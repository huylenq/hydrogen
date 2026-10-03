// @effect-diagnostics nodeBuiltinImport:off - checks atomic storage in an isolated temporary directory.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ThreadId, type CrewHandoff } from "@t3tools/contracts";
import { CrewController } from "./CrewController.ts";
import { fileCrewStore, type CrewStore } from "./CrewStore.ts";
import { fixtureGateway, memoryStore } from "./CrewTestFixtures.ts";

const input = {
  accountScope: "account-one",
  botId: "bot-1",
  text: "Review this change",
  nonce: "auto-nonce",
  originThreadId: ThreadId.make("thread-one"),
  automaticDelivery: true,
};
const controllers: CrewController[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(controllers.splice(0).map((controller) => controller.close()));
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => NodeFSP.rm(directory, { recursive: true, force: true })),
  );
});
async function setup(store: CrewStore = memoryStore()) {
  const fixture = fixtureGateway();
  const openGateway = vi.fn(async () => fixture.gateway);
  const controller = await CrewController.make({ store, openGateway });
  controllers.push(controller);
  return { ...fixture, controller, openGateway };
}
function entries(
  handoff: CrewHandoff,
  text = `A useful finding.\n${handoff.delegation!.replyMarker}`,
) {
  return [
    {
      id: `echo-${handoff.nonce}`,
      kind: "message",
      role: "user",
      content: handoff.wireText,
      clientNonce: handoff.nonce,
    },
    {
      id: `reply-${handoff.nonce}`,
      kind: "send-message",
      message: { type: "text", content: text },
    },
  ];
}
const scope = (handoff: CrewHandoff) => ({
  accountScope: handoff.accountScope,
  handoffId: handoff.id,
});
async function ready(fixture: Awaited<ReturnType<typeof setup>>, handoff: CrewHandoff) {
  fixture.setEntries(entries(handoff));
  return fixture.controller.getHandoff(handoff.id);
}

describe("asynchronous Grok Bot delegation", () => {
  it("sends one compact wire message and reserves its nonce across context or delivery changes", async () => {
    const fixture = await setup();
    await fixture.controller.connect({});
    const request = {
      ...input,
      context: { goal: "Ship auth", evidence: [{ label: "diff", text: "+ verify(token)" }] },
    };
    const sent = await fixture.controller.send(request);
    expect(sent.wireText).toContain("Task goal:\nShip auth");
    expect(sent.wireText).toContain(sent.delegation!.replyMarker);
    expect(fixture.send).toHaveBeenCalledWith(
      expect.objectContaining({ text: sent.wireText, clientNonce: input.nonce }),
    );
    expect((await fixture.controller.send(request)).id).toBe(sent.id);
    await expect(
      fixture.controller.send({ ...request, automaticDelivery: false }),
    ).rejects.toMatchObject({ code: "nonce_conflict" });
    await expect(
      fixture.controller.send({ ...request, context: { goal: "Other" } }),
    ).rejects.toMatchObject({ code: "nonce_conflict" });
    expect(fixture.send).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized briefs before recording or dispatching, including routing overhead", async () => {
    const fixture = await setup();
    await fixture.controller.connect({});
    await expect(
      fixture.controller.send({ ...input, text: "x".repeat(8000) }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      fixture.controller.send({ ...input, contextTokenBudget: 4001 }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      fixture.controller.send({
        ...input,
        automaticDelivery: false,
        context: { goal: "x".repeat(16000) },
        text: "x".repeat(17000),
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(fixture.send).not.toHaveBeenCalled();
    expect(fixture.controller.snapshot().handoffs).toHaveLength(0);
  });

  it("requires the exact nonce echo, one final marker, and a non-streaming supported reply", async () => {
    const fixture = await setup();
    await fixture.controller.connect({});
    const sent = await fixture.controller.send(input);
    fixture.setEntries(entries(sent).slice(1));
    expect((await fixture.controller.getHandoff(sent.id)).delegation?.correlation).toBe("awaiting");
    fixture.setEntries(entries(sent, "An unrelated answer"));
    expect((await fixture.controller.getHandoff(sent.id)).delegation?.correlation).toBe(
      "needs_attention",
    );
    expect(await fixture.controller.claimDelivery(scope(sent))).toBeNull();
    fixture.setEntries([...entries(sent).slice(0, 1), { ...entries(sent)[1], streaming: true }]);
    expect((await fixture.controller.getHandoff(sent.id)).delegation?.correlation).toBe("awaiting");
    fixture.setEntries(
      entries(sent, `${sent.delegation!.replyMarker}\nA finding\n${sent.delegation!.replyMarker}`),
    );
    expect((await fixture.controller.getHandoff(sent.id)).delegation?.correlation).toBe(
      "needs_attention",
    );
    expect((await ready(fixture, sent)).delegation?.delivery.status).toBe("ready");
  });

  it("refuses to correlate across an intervening human message or another account", async () => {
    const fixture = await setup();
    await fixture.controller.connect({});
    const sent = await fixture.controller.send(input);
    const valid = entries(sent);
    fixture.setEntries([
      valid[0]!,
      { id: "other-user", kind: "message", role: "user", content: "new question" },
      valid[1]!,
    ]);
    expect((await fixture.controller.getHandoff(sent.id)).delegation?.correlation).toBe("awaiting");
    await ready(fixture, sent);
    expect(
      await fixture.controller.claimDelivery({ ...scope(sent), accountScope: "different" }),
    ).toBeNull();
  });

  it("serializes overlapping requests in one bot conversation while permitting another bot", async () => {
    const fixture = await setup();
    vi.mocked(fixture.gateway.roster).mockResolvedValue({
      bots: [{ id: "bot-1" }, { id: "bot-2" }],
    });
    await fixture.controller.connect({});
    const sent = await fixture.controller.send(input);
    await expect(fixture.controller.send({ ...input, nonce: "second" })).rejects.toMatchObject({
      code: "invalid_input",
    });
    await fixture.controller.send({ ...input, botId: "bot-2", nonce: "independent" });
    await fixture.controller.stopDelivery(scope(sent), input.originThreadId);
    await fixture.controller.send({ ...input, nonce: "after-stop" });
    expect(fixture.send).toHaveBeenCalledTimes(3);
  });

  it("claims once and freezes reply text; definite deferral uses a new command with the same message", async () => {
    const fixture = await setup();
    await fixture.controller.connect({});
    const sent = await fixture.controller.send(input);
    await ready(fixture, sent);
    const [first, second] = await Promise.all([
      fixture.controller.claimDelivery(scope(sent)),
      fixture.controller.claimDelivery(scope(sent)),
    ]);
    expect(first?.delegation?.delivery.status).toBe("claimed");
    expect(second).toBeNull();
    const initial = first!.delegation!.delivery;
    expect(initial.text).not.toContain(sent.delegation!.replyMarker);
    await fixture.controller.markDelivery({
      handoffId: sent.id,
      commandId: initial.commandId!,
      status: "ready",
    });
    const edited = entries(sent, "The original reply was replaced, including its marker.");
    fixture.setEntries([edited[0]!, { ...edited[1], id: "replacement-reply" }]);
    const refreshed = await fixture.controller.getHandoff(sent.id);
    expect(refreshed.replies[0]?.id).toBe("replacement-reply");
    expect(refreshed.delegation?.correlation).toBe("matched");
    const retry = (await fixture.controller.claimDelivery(scope(sent)))!.delegation!.delivery;
    expect(retry.commandId).not.toBe(initial.commandId);
    expect(retry.messageId).toBe(initial.messageId);
    expect(retry.text).toBe(initial.text);
    expect(retry.entryIds).toEqual(initial.entryIds);
    await fixture.controller.markDelivery({
      handoffId: sent.id,
      commandId: retry.commandId!,
      status: "delivered",
    });
    expect(await fixture.controller.claimDelivery(scope(sent))).toBeNull();
  });

  it("stops pending delivery with task/account scope without cancelling or re-sending the bot request", async () => {
    const fixture = await setup();
    await fixture.controller.connect({});
    const sent = await fixture.controller.send(input);
    await expect(
      fixture.controller.stopDelivery(scope(sent), ThreadId.make("other")),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      fixture.controller.stopDelivery({ ...scope(sent), accountScope: "other" }),
    ).rejects.toMatchObject({ code: "not_found" });
    await fixture.controller.stopDelivery(scope(sent), input.originThreadId);
    expect((await ready(fixture, sent)).delegation?.delivery.status).toBe("stopped");
    expect(await fixture.controller.claimDelivery(scope(sent))).toBeNull();
    expect(fixture.send).toHaveBeenCalledTimes(1);
  });

  it("recovers an interrupted claim conservatively, reconnects only the saved account, and honors explicit disconnect", async () => {
    const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "crew-delivery-"));
    directories.push(directory);
    const path = NodePath.join(directory, "ledger.json");
    const first = await setup(fileCrewStore(path));
    await first.controller.connect({});
    const sent = await first.controller.send(input);
    await ready(first, sent);
    const claim = await first.controller.claimDelivery(scope(sent));
    await first.controller.close();
    const second = await setup(fileCrewStore(path));
    expect(second.openGateway).toHaveBeenCalledWith({ accountScope: "account-one" });
    const recovered = await second.controller.getHandoff(sent.id);
    expect(recovered.delegation?.delivery).toMatchObject({
      status: "uncertain",
      commandId: claim!.delegation!.delivery.commandId,
    });
    expect(await second.controller.claimDelivery(scope(sent))).toBeNull();
    expect(second.send).not.toHaveBeenCalled();
    await second.controller.disconnect();
    await second.controller.close();
    const third = await setup(fileCrewStore(path));
    expect(third.openGateway).not.toHaveBeenCalled();
  });

  it.each(["claimed", "accepted"] as const)(
    "records late dispatch proof after stopping a %s delivery without reopening it",
    async (status) => {
      const fixture = await setup();
      await fixture.controller.connect({});
      const sent = await fixture.controller.send(input);
      await ready(fixture, sent);
      const claim = await fixture.controller.claimDelivery(scope(sent));
      const commandId = claim!.delegation!.delivery.commandId!;
      if (status === "accepted") {
        await fixture.controller.markDelivery({ handoffId: sent.id, commandId, status });
      }
      const stopped = await fixture.controller.stopDelivery(scope(sent), input.originThreadId);
      expect(stopped.delegation?.delivery).toMatchObject({ status: "stopped", commandId });
      for (const lateStatus of ["ready", "accepted", "uncertain", "failed"] as const) {
        expect(
          (
            await fixture.controller.markDelivery({
              handoffId: sent.id,
              commandId,
              status: lateStatus,
            })
          ).delegation?.delivery.status,
        ).toBe("stopped");
      }
      expect(await fixture.controller.claimDelivery(scope(sent))).toBeNull();
      await expect(
        fixture.controller.markDelivery({
          handoffId: sent.id,
          commandId: "other-attempt",
          status: "delivered",
        }),
      ).rejects.toMatchObject({ code: "not_found" });
      expect(
        (
          await fixture.controller.markDelivery({
            handoffId: sent.id,
            commandId,
            status: "delivered",
          })
        ).delegation?.delivery.status,
      ).toBe("delivered");
      expect(await fixture.controller.claimDelivery(scope(sent))).toBeNull();
      expect(fixture.send).toHaveBeenCalledTimes(1);
    },
  );

  it("does not persist or publish an unchanged delivery receipt", async () => {
    const store = memoryStore();
    const save = vi.spyOn(store, "save");
    const fixture = await setup(store);
    await fixture.controller.connect({});
    const sent = await fixture.controller.send(input);
    await ready(fixture, sent);
    const claim = await fixture.controller.claimDelivery(scope(sent));
    const update = {
      handoffId: sent.id,
      commandId: claim!.delegation!.delivery.commandId!,
      status: "accepted" as const,
    };
    const accepted = await fixture.controller.markDelivery(update);
    const snapshot = fixture.controller.snapshot();
    save.mockClear();
    expect(await fixture.controller.markDelivery(update)).toBe(accepted);
    expect(fixture.controller.snapshot()).toEqual(snapshot);
    expect(save).not.toHaveBeenCalled();
  });

  it("recovers an accepted dispatch as uncertain before reconnect so delayed connection cannot hide missing runtime proof", async () => {
    const store = memoryStore();
    const first = await setup(store);
    await first.controller.connect({});
    const sent = await first.controller.send(input);
    await ready(first, sent);
    const claim = await first.controller.claimDelivery(scope(sent));
    const commandId = claim!.delegation!.delivery.commandId!;
    await first.controller.markDelivery({ handoffId: sent.id, commandId, status: "accepted" });
    await first.controller.close();
    const second = await setup(store);
    expect(second.openGateway).not.toHaveBeenCalled();
    expect((await second.controller.getHandoff(sent.id)).delegation?.delivery).toMatchObject({
      status: "uncertain",
      commandId,
    });
    await second.controller.connect({});
    expect(await second.controller.claimDelivery(scope(sent))).toBeNull();
    expect(
      (await second.controller.markDelivery({ handoffId: sent.id, commandId, status: "delivered" }))
        .delegation?.delivery.status,
    ).toBe("delivered");
    expect(second.send).not.toHaveBeenCalled();
  });

  it("inherits the root round cap and rejects branching or cross-task follow-ups", async () => {
    const fixture = await setup();
    await fixture.controller.connect({});
    const first = await fixture.controller.send({ ...input, maxRounds: 2 });
    await ready(fixture, first);
    const claim = await fixture.controller.claimDelivery(scope(first));
    await fixture.controller.markDelivery({
      handoffId: first.id,
      commandId: claim!.delegation!.delivery.commandId!,
      status: "delivered",
    });
    await expect(
      fixture.controller.send({
        ...input,
        nonce: "wrong-origin",
        originThreadId: ThreadId.make("other"),
        parentHandoffId: first.id,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    const second = await fixture.controller.send({
      ...input,
      nonce: "followup",
      parentHandoffId: first.id,
      maxRounds: 5,
    });
    expect(second.delegation).toMatchObject({ round: 2, maxRounds: 2, rootHandoffId: first.id });
    expect(
      (
        await fixture.controller.send({
          ...input,
          nonce: "followup",
          parentHandoffId: first.id,
          maxRounds: 5,
        })
      ).id,
    ).toBe(second.id);
    await ready(fixture, second);
    const nextClaim = await fixture.controller.claimDelivery(scope(second));
    await fixture.controller.markDelivery({
      handoffId: second.id,
      commandId: nextClaim!.delegation!.delivery.commandId!,
      status: "delivered",
    });
    await expect(
      fixture.controller.send({
        ...input,
        nonce: "over-cap",
        parentHandoffId: first.id,
        maxRounds: 5,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("backfills an offline reply whose nonce echo fell out of the latest page", async () => {
    const fixture = await setup();
    await fixture.controller.connect({});
    const sent = await fixture.controller.send(input);
    const valid = entries(sent);
    fixture.transcript.mockImplementation(async (request) =>
      request.beforeSeq === undefined
        ? { entries: valid.slice(1), nextBeforeSeq: 50 }
        : { entries: valid.slice(0, 1), nextBeforeSeq: null },
    );
    expect((await fixture.controller.getHandoff(sent.id)).delegation?.delivery.status).toBe(
      "ready",
    );
  });
});
