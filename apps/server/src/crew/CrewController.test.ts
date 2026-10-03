// @effect-diagnostics nodeBuiltinImport:off - exercises real ledger durability in an isolated temporary directory.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ThreadId } from "@t3tools/contracts";
import { CrewController } from "./CrewController.ts";
import { fileCrewStore } from "./CrewStore.ts";
import { fixtureGateway, memoryStore } from "./CrewTestFixtures.ts";

const threadId = ThreadId.make("thread-one");
const input = {
  accountScope: "account-one",
  botId: "bot-1",
  text: "hello",
  nonce: "one-nonce",
  originThreadId: threadId,
};
const echo = {
  kind: "message",
  id: "echo",
  role: "user",
  content: "hello",
  clientNonce: "one-nonce",
};
const answer = {
  kind: "send-message",
  id: "answer",
  message: { type: "text", content: "Hello back" },
};

const controllers: CrewController[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(controllers.splice(0).map((controller) => controller.close()));
  await Promise.all(
    directories.splice(0).map((path) => NodeFSP.rm(path, { recursive: true, force: true })),
  );
});
async function setup(store = memoryStore()) {
  const fixture = fixtureGateway();
  const openGateway = vi.fn(async () => fixture.gateway);
  const controller = await CrewController.make({
    store,
    openGateway,
    now: () => "2026-09-05T00:00:00.000Z",
  });
  controllers.push(controller);
  return { controller, openGateway, ...fixture };
}

describe("crew avatars", () => {
  const avatarInput = { accountScope: "account-one", botId: "bot-1", version: "one" };

  it("preserves avatar metadata on connection and refresh without failing on future or malformed values", async () => {
    const { controller, gateway, avatar, emit } = await setup();
    vi.mocked(gateway.roster).mockResolvedValue({
      bots: [{ id: "bot-1", avatarShape: "pebble", avatarColor: "red", avatarVersion: "one" }],
    });
    const connected = await controller.connect({});
    expect(connected.bots[0]).toMatchObject({
      avatarShape: "pebble",
      avatarColor: "red",
      avatarVersion: "one",
    });
    await controller.drain();
    vi.mocked(gateway.roster).mockResolvedValue({
      bots: [{ id: "bot-1", avatarShape: "future-shape", avatarColor: null, avatarVersion: 42 }],
    });
    await emit("agents");
    await controller.drain();
    expect(controller.snapshot().bots[0]).toMatchObject({ avatarShape: "future-shape" });
    expect(controller.snapshot().bots[0]).not.toHaveProperty("avatarColor");
    expect(controller.snapshot().bots[0]).not.toHaveProperty("avatarVersion");
    expect(avatar).not.toHaveBeenCalled();
  });

  it("lazily shares reads, scopes them to the connected roster, and refreshes cache on version or connection changes", async () => {
    const { controller, gateway, avatar, emit } = await setup();
    await expect(controller.getAvatar(avatarInput)).rejects.toMatchObject({ code: "disconnected" });
    vi.mocked(gateway.roster).mockResolvedValue({ bots: [{ id: "bot-1", avatarVersion: "one" }] });
    await controller.connect({});
    await controller.drain();
    await expect(
      controller.getAvatar({ ...avatarInput, accountScope: "another-account" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(controller.getAvatar({ ...avatarInput, botId: "missing" })).rejects.toMatchObject({
      code: "not_found",
    });
    expect(avatar).not.toHaveBeenCalled();
    avatar.mockResolvedValue({ dataUrl: null, version: "one" });
    const [first, second] = await Promise.all([
      controller.getAvatar(avatarInput),
      controller.getAvatar(avatarInput),
    ]);
    expect(first).toEqual({
      accountScope: "account-one",
      botId: "bot-1",
      dataUrl: null,
      version: "one",
    });
    expect(second).toEqual(first);
    await controller.getAvatar({ ...avatarInput, version: "untrusted-cache-key" });
    expect(avatar).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().bots[0]).not.toHaveProperty("dataUrl");
    vi.mocked(gateway.roster).mockResolvedValue({ bots: [{ id: "bot-1", avatarVersion: "two" }] });
    avatar.mockResolvedValue({ dataUrl: null, version: "two" });
    await emit("agents");
    await controller.drain();
    expect((await controller.getAvatar(avatarInput)).version).toBe("two");
    expect(avatar).toHaveBeenCalledTimes(2);
    await controller.disconnect();
    await expect(controller.getAvatar(avatarInput)).rejects.toMatchObject({ code: "disconnected" });
    await controller.connect({});
    await controller.getAvatar(avatarInput);
    expect(avatar).toHaveBeenCalledTimes(3);
  });

  it("does not block disconnect behind an image read or return an earlier connection's image", async () => {
    const { controller, avatar } = await setup();
    await controller.connect({});
    await controller.drain();
    const pending = Promise.withResolvers<{ dataUrl: null; version: string }>();
    avatar.mockReturnValueOnce(pending.promise);
    const read = controller.getAvatar(avatarInput);
    const rejected = expect(read).rejects.toMatchObject({ code: "disconnected" });
    await controller.disconnect();
    await controller.connect({});
    pending.resolve({ dataUrl: null, version: "old" });
    await rejected;
    expect((await controller.getAvatar(avatarInput)).version).toBeNull();
    expect(avatar).toHaveBeenCalledTimes(2);
  });

  it("bounds the number of cached bot images and retries a failed read on demand", async () => {
    const { controller, gateway, avatar } = await setup();
    vi.mocked(gateway.roster).mockResolvedValue({
      bots: Array.from({ length: 33 }, (_, i) => ({ id: `bot-${i}`, avatarVersion: "one" })),
    });
    await controller.connect({});
    avatar.mockRejectedValueOnce(new Error("private descriptor"));
    await expect(controller.getAvatar({ ...avatarInput, botId: "bot-0" })).rejects.toMatchObject({
      code: "connection",
      message: expect.not.stringContaining("private"),
    });
    for (let i = 0; i < 33; i++) await controller.getAvatar({ ...avatarInput, botId: `bot-${i}` });
    await controller.getAvatar({ ...avatarInput, botId: "bot-0" });
    expect(avatar).toHaveBeenCalledTimes(35);
  });
});

describe("crew handoffs", () => {
  it("starts disconnected without probing credentials and refuses sends", async () => {
    const { controller, openGateway, send } = await setup();
    expect(controller.snapshot().connection.status).toBe("disconnected");
    await expect(controller.send(input)).rejects.toMatchObject({ code: "disconnected" });
    expect(openGateway).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("persists intent before dispatch and serializes duplicate nonces", async () => {
    const store = memoryStore();
    const { controller, send } = await setup(store);
    await controller.connect({});
    send.mockImplementation(async () => {
      expect(await store.load()).toMatchObject([{ nonce: input.nonce, acceptance: "pending" }]);
      return { accepted: true };
    });
    const [first, second] = await Promise.all([controller.send(input), controller.send(input)]);
    expect(first.id).toBe(second.id);
    expect(send).toHaveBeenCalledTimes(1);
    await expect(controller.send({ ...input, text: "changed" })).rejects.toMatchObject({
      code: "nonce_conflict",
    });
    await expect(
      controller.send({ ...input, originThreadId: ThreadId.make("another") }),
    ).rejects.toMatchObject({ code: "nonce_conflict" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("never dispatches when recording intent fails", async () => {
    const { controller, send } = await setup({
      load: async () => [],
      save: async () => {
        throw new Error("disk full");
      },
    });
    await controller.connect({});
    await expect(controller.send(input)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps ambiguous delivery durable across a real store restart and never resends", async () => {
    const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-crew-test-"));
    directories.push(directory);
    const store = fileCrewStore(NodePath.join(directory, "crew.json"));
    const first = await setup(store);
    await first.controller.connect({});
    first.send.mockRejectedValue(new Error("connection closed after dispatch"));
    const sent = await first.controller.send(input);
    expect(sent.acceptance).toBe("uncertain");
    await first.controller.close();
    const second = await setup(store);
    expect(second.openGateway).toHaveBeenCalledWith({ accountScope: "account-one" });
    expect(await second.controller.send(input)).toMatchObject({
      id: sent.id,
      acceptance: "uncertain",
    });
    expect(second.send).not.toHaveBeenCalled();
    expect(await NodeFSP.readFile(NodePath.join(directory, "crew.json"), "utf8")).not.toContain(
      "token",
    );
  });

  it("converts a crash-left pending intent to uncertain without dispatching", async () => {
    const first = await setup();
    await first.controller.connect({});
    const handoff = await first.controller.send(input);
    const recovered = await setup(memoryStore([{ ...handoff, acceptance: "pending" }]));
    expect((await recovered.controller.getHandoff(handoff.id)).acceptance).toBe("uncertain");
    await recovered.controller.connect({});
    expect((await recovered.controller.send(input)).acceptance).toBe("uncertain");
    expect(recovered.send).not.toHaveBeenCalled();
  });

  it("matches exact nonce and stops reply association at the next user message", async () => {
    const { controller, setEntries } = await setup();
    await controller.connect({});
    const sent = await controller.send(input);
    setEntries([{ ...echo, clientNonce: "another-nonce" }, answer]);
    expect((await controller.getHandoff(sent.id, threadId)).replies).toEqual([]);
    setEntries([
      echo,
      answer,
      { ...echo, id: "other-user", clientNonce: "other" },
      { ...answer, id: "unrelated-reply" },
    ]);
    const read = await controller.getHandoff(sent.id, threadId);
    expect(read.echoEntryId).toBe("echo");
    expect(read.replies.map((entry) => entry.id)).toEqual(["answer"]);
    await expect(
      controller.getHandoff(sent.id, ThreadId.make("other-thread")),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("backfills older pages to match the echo and preserves unknown cards", async () => {
    const { controller, transcript } = await setup();
    await controller.connect({});
    await controller.drain();
    const sent = await controller.send(input);
    await controller.drain();
    transcript.mockImplementation(async ({ beforeSeq }) =>
      beforeSeq === undefined
        ? {
            entries: [
              answer,
              { id: "approval", kind: "send-message", message: { type: "approval" } },
            ],
            nextBeforeSeq: 10,
          }
        : { entries: [echo], nextBeforeSeq: null },
    );
    const result = await controller.getHandoff(sent.id, threadId);
    expect(result.replies).toMatchObject([
      { id: "answer" },
      { id: "approval", unsupportedKind: "send-message:approval", text: "" },
    ]);
    expect(transcript).toHaveBeenLastCalledWith({
      botId: "bot-1",
      sessionId: "",
      beforeSeq: 10,
      limit: 100,
    });
  });

  it("keeps ledger nonces separate for accounts", async () => {
    const store = memoryStore();
    const first = await setup(store);
    await first.controller.connect({});
    await first.controller.send(input);
    await first.controller.close();
    const fixture = fixtureGateway("account-two");
    const controller = await CrewController.make({
      store,
      openGateway: async () => fixture.gateway,
    });
    controllers.push(controller);
    await controller.connect({});
    const second = await controller.send({ ...input, accountScope: "account-two" });
    expect(second.accountScope).toBe("account-two");
    expect(fixture.send).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().handoffs).toHaveLength(1);
  });

  it("backfills on events and disconnects only this client subscription", async () => {
    const { controller, setEntries, emit, stopped, send } = await setup();
    await controller.connect({});
    const sent = await controller.send(input);
    await controller.drain();
    setEntries([echo, answer]);
    await emit();
    await controller.drain();
    expect(
      controller.snapshot().handoffs.find((handoff) => handoff.id === sent.id)?.replies,
    ).toHaveLength(1);
    await controller.disconnect();
    await expect(controller.send({ ...input, nonce: "second" })).rejects.toMatchObject({
      code: "disconnected",
    });
    expect(stopped).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent conversation reads", async () => {
    const { controller, transcript } = await setup();
    await controller.connect({});
    await controller.drain();
    const first = controller.getConversation({ botId: "bot-1" });
    const second = controller.getConversation({ botId: "bot-1" });
    expect(first).toBe(second);
    await first;
    expect(transcript).toHaveBeenCalledTimes(1);
  });

  it("keeps a dispatched nonce uncertain when saving acceptance fails", async () => {
    const stored = memoryStore();
    let saves = 0;
    const { controller, send } = await setup({
      load: stored.load,
      save: async (next) => {
        saves++;
        if (saves === 2) throw new Error("disk full after dispatch");
        await stored.save(next);
      },
    });
    await controller.connect({});
    await expect(controller.send(input)).rejects.toMatchObject({ code: "storage" });
    expect((await controller.send(input)).acceptance).toBe("uncertain");
    expect(send).toHaveBeenCalledTimes(1);
    expect((await stored.load())[0]?.acceptance).toBe("pending");
  });

  it("rejects a stale draft account before any dispatch or transcript read", async () => {
    const { controller, send, transcript } = await setup();
    await controller.connect({});
    await controller.drain();
    await expect(
      controller.send({ ...input, accountScope: "previous-account" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      controller.getConversation({ botId: "bot-1", accountScope: "previous-account" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(send).not.toHaveBeenCalled();
    expect(transcript).not.toHaveBeenCalled();
    await controller.send(input);
    await controller.disconnect();
    expect(controller.snapshot().handoffs).toEqual([]);
  });

  it("rejects Temporal bots before reaching the unsupported gateway route", async () => {
    const fixture = fixtureGateway();
    const gateway = {
      ...fixture.gateway,
      roster: async () => ({ bots: [{ id: "bot-1", name: "Team bot", harness: "temporal" }] }),
    };
    const controller = await CrewController.make({
      store: memoryStore(),
      openGateway: async () => gateway,
    });
    controllers.push(controller);
    await controller.connect({});
    expect(controller.snapshot().bots[0]?.unavailableReason).toContain("Temporal");
    await expect(controller.send(input)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(controller.getConversation({ botId: "bot-1" })).rejects.toMatchObject({
      code: "invalid_input",
    });
    expect(fixture.send).not.toHaveBeenCalled();
    expect(fixture.transcript).not.toHaveBeenCalled();
  });

  it("disconnect also aborts a subscription created by an already queued connect", async () => {
    const fixture = fixtureGateway();
    const opening = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    const controller = await CrewController.make({
      store: memoryStore(),
      openGateway: async () => {
        entered.resolve();
        await opening.promise;
        return fixture.gateway;
      },
    });
    controllers.push(controller);
    const connecting = controller.connect({});
    await entered.promise;
    const disconnected = controller.disconnect();
    opening.resolve();
    await connecting;
    await disconnected;
    await controller.drain();
    expect(controller.snapshot().connection.status).toBe("disconnected");
    expect(fixture.stopped).toHaveBeenCalledTimes(1);
  });

  it("discovers account choices only after an explicit failed connection", async () => {
    const discoverAccounts = vi.fn(async () => ["hash-one", "hash-two"]);
    const controller = await CrewController.make({
      store: memoryStore(),
      discoverAccounts,
      openGateway: async () => {
        throw new Error("choose account");
      },
    });
    controllers.push(controller);
    expect(discoverAccounts).not.toHaveBeenCalled();
    await expect(controller.connect({})).rejects.toThrow();
    expect(controller.snapshot().connection.availableAccountScopes).toEqual([
      "hash-one",
      "hash-two",
    ]);
  });

  it("keeps corrupt optional crew storage from taking down the server", async () => {
    const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-crew-test-"));
    directories.push(directory);
    const path = NodePath.join(directory, "crew.json");
    await NodeFSP.writeFile(path, "broken");
    const { controller, openGateway, send } = await setup(fileCrewStore(path));
    expect(controller.snapshot().connection).toMatchObject({ status: "error", accountScope: null });
    await expect(controller.connect({})).rejects.toMatchObject({ code: "storage" });
    await expect(controller.send(input)).rejects.toMatchObject({ code: "storage" });
    expect(openGateway).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(await NodeFSP.readFile(path, "utf8")).toBe("broken");
  });

  it("refuses corrupt durable state instead of silently losing nonce protection", async () => {
    const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-crew-test-"));
    directories.push(directory);
    const path = NodePath.join(directory, "crew.json");
    await NodeFSP.writeFile(path, "broken");
    await expect(fileCrewStore(path).load()).rejects.toMatchObject({ code: "storage" });
  });
});
