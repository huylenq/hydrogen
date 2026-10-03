// @effect-diagnostics nodeBuiltinImport:off - Synthetic encryption exercises the installed descriptor format.
import * as NodeCrypto from "node:crypto";
import * as NodeUtil from "node:util";

import { describe, expect, it, vi } from "vite-plus/test";
import { CREW_AVATAR_MAX_DATA_URL_LENGTH } from "@t3tools/contracts";

import {
  ConnectionLoadError,
  GatewayError,
  GrokBotConnection,
  createGateway,
  discoverAppAccounts,
  loadAppConnection,
  parseGatewayEvents,
} from "./GrokBotGateway.ts";

const ACCOUNT = "google-oauth2|synthetic";
const ACCOUNT_HASH = NodeCrypto.createHash("sha256").update(ACCOUNT).digest("hex");
const PASSWORD = Buffer.from(" synthetic password with spaces ");
const NOW = 1_800_000_000_000;
const PNG_AVATAR =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXGkAAAAASUVORK5CYII=";
const DESCRIPTOR = {
  baseUrl: "https://gateway.example.test/private-path/",
  token: "synthetic-private-bearer",
  headers: { "x-anyrun-network-token": "synthetic-private-network" },
  vncProxy: { networkToken: "never-retain-this" },
};

function encryptedDescriptor(value: unknown = DESCRIPTOR) {
  const key = NodeCrypto.pbkdf2Sync(PASSWORD, "saltysalt", 1003, 16, "sha1");
  const cipher = NodeCrypto.createCipheriv("aes-128-cbc", key, Buffer.alloc(16, 32));
  return Buffer.concat([
    Buffer.from("v10"),
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]).toString("base64");
}

function savedConnection(
  entries = { [ACCOUNT_HASH]: { savedAtMs: NOW, encrypted: encryptedDescriptor() } },
) {
  const readDescriptor = vi.fn(async () => Buffer.from(JSON.stringify({ version: 2, entries })));
  const readSafeStoragePassword = vi.fn(async () => PASSWORD);
  return { readDescriptor, readSafeStoragePassword, now: () => NOW };
}

function fixtureGateway(
  responder: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
) {
  const fetch = vi.fn(responder);
  const gateway = createGateway(new GrokBotConnection(DESCRIPTOR, ACCOUNT_HASH), { fetch });
  return { gateway, fetch };
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function* chunks(...values: (string | Uint8Array)[]) {
  for (const value of values)
    yield typeof value === "string" ? new TextEncoder().encode(value) : value;
}

async function collect<T>(values: AsyncIterable<T>): Promise<T[]> {
  const output: T[] = [];
  for await (const value of values) output.push(value);
  return output;
}

describe("Grok Bot saved connection", () => {
  it("discovers only account hashes without reading Keychain", async () => {
    const dependencies = savedConnection();
    expect(await discoverAppAccounts({ dataDir: "/synthetic/app", dependencies })).toEqual([
      ACCOUNT_HASH,
    ]);
    expect(dependencies.readDescriptor).toHaveBeenCalledExactlyOnceWith(
      "/synthetic/app/gateway-descriptor.json",
    );
    expect(dependencies.readSafeStoragePassword).not.toHaveBeenCalled();
  });

  it("decrypts Electron v10 with whitespace-preserving PBKDF2 and keeps credentials opaque", async () => {
    const dependencies = savedConnection();
    const connection = await loadAppConnection({ dependencies });
    const fetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>(
      async () => jsonResponse([]),
    );
    const gateway = createGateway(connection, { fetch });
    await gateway.roster();
    expect(connection.accountScope).toBe(ACCOUNT_HASH);
    expect(gateway.accountScope).toBe(ACCOUNT_HASH);
    expect(JSON.stringify(connection)).toBe(JSON.stringify({ accountScope: ACCOUNT_HASH }));
    expect(NodeUtil.inspect(connection)).not.toContain("private");
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://gateway.example.test/private-path/api/listAgents");
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${DESCRIPTOR.token}`);
    expect(new Headers(init?.headers).get("x-anyrun-network-token")).toBe(
      DESCRIPTOR.headers["x-anyrun-network-token"],
    );
    expect(dependencies.readSafeStoragePassword).toHaveBeenCalledOnce();
  });

  it("selects exact hashes, raw principals, and percent-encoded cache principals", async () => {
    const dependencies = savedConnection({
      [ACCOUNT_HASH]: { savedAtMs: NOW, encrypted: encryptedDescriptor() },
      ["a".repeat(64)]: { savedAtMs: NOW, encrypted: encryptedDescriptor() },
    });
    for (const accountScope of [ACCOUNT_HASH, ACCOUNT, encodeURIComponent(ACCOUNT)]) {
      expect((await loadAppConnection({ accountScope, dependencies })).accountScope).toBe(
        ACCOUNT_HASH,
      );
    }
    await expect(loadAppConnection({ dependencies })).rejects.toThrow("Multiple saved accounts");
  });

  it("rejects ambiguous raw and decoded scope matches before Keychain", async () => {
    const scope = encodeURIComponent(ACCOUNT);
    const encodedHash = NodeCrypto.createHash("sha256").update(scope).digest("hex");
    const dependencies = savedConnection({
      [ACCOUNT_HASH]: { savedAtMs: NOW, encrypted: encryptedDescriptor() },
      [encodedHash]: { savedAtMs: NOW, encrypted: encryptedDescriptor() },
    });
    await expect(loadAppConnection({ accountScope: scope, dependencies })).rejects.toThrow(
      "matches multiple",
    );
    expect(dependencies.readSafeStoragePassword).not.toHaveBeenCalled();
  });

  it("allows literal percent signs in a raw account principal", async () => {
    const accountScope = "synthetic%raw-principal";
    const hash = NodeCrypto.createHash("sha256").update(accountScope).digest("hex");
    const dependencies = savedConnection({
      [hash]: { savedAtMs: NOW, encrypted: encryptedDescriptor() },
    });
    expect((await loadAppConnection({ accountScope, dependencies })).accountScope).toBe(hash);
  });

  it("rejects stale and future timestamps before Keychain", async () => {
    for (const savedAtMs of [
      NOW - 7 * 24 * 60 * 60 * 1000 - 1,
      NOW + 5 * 60_000 + 1,
      -1,
      Number.NaN,
    ]) {
      const dependencies = savedConnection({
        [ACCOUNT_HASH]: { savedAtMs, encrypted: encryptedDescriptor() },
      });
      await expect(loadAppConnection({ dependencies })).rejects.toBeInstanceOf(ConnectionLoadError);
      expect(dependencies.readSafeStoragePassword).not.toHaveBeenCalled();
    }
  });

  it("rejects invalid store keys, format, encryption prefix, and truncated blocks before Keychain", async () => {
    for (const value of [
      { version: 1, entries: {} },
      { version: 2, entries: {} },
      { version: 2, entries: { invalid: { savedAtMs: NOW, encrypted: encryptedDescriptor() } } },
      {
        version: 2,
        entries: {
          [ACCOUNT_HASH]: { savedAtMs: NOW, encrypted: encryptedDescriptor() },
          invalid: { savedAtMs: NOW, encrypted: encryptedDescriptor() },
        },
      },
      { version: 2, entries: { [ACCOUNT_HASH]: { savedAtMs: NOW, encrypted: "%%%" } } },
      {
        version: 2,
        entries: {
          [ACCOUNT_HASH]: {
            savedAtMs: NOW,
            encrypted: Buffer.from("v11" + "x".repeat(16)).toString("base64"),
          },
        },
      },
      {
        version: 2,
        entries: {
          [ACCOUNT_HASH]: { savedAtMs: NOW, encrypted: Buffer.from("v10x").toString("base64") },
        },
      },
    ]) {
      const dependencies = savedConnection();
      dependencies.readDescriptor.mockResolvedValue(Buffer.from(JSON.stringify(value)));
      await expect(loadAppConnection({ dependencies })).rejects.toBeInstanceOf(ConnectionLoadError);
      expect(dependencies.readSafeStoragePassword).not.toHaveBeenCalled();
    }
  });

  it("sanitizes filesystem, Keychain, and decryption failures", async () => {
    for (const source of ["file", "keychain", "password"]) {
      const dependencies = savedConnection();
      if (source === "file")
        dependencies.readDescriptor.mockRejectedValue(
          new Error("private-path synthetic-private-bearer"),
        );
      if (source === "keychain")
        dependencies.readSafeStoragePassword.mockRejectedValue(
          new Error("synthetic-private-password"),
        );
      if (source === "password")
        dependencies.readSafeStoragePassword.mockResolvedValue(Buffer.from("wrong-password"));
      const error = await loadAppConnection({ dependencies }).catch((error: unknown) => error);
      expect(error).toBeInstanceOf(ConnectionLoadError);
      expect(NodeUtil.inspect(error)).not.toContain("synthetic-private");
      expect(NodeUtil.inspect(error)).not.toContain("private-path");
      expect(error).not.toHaveProperty("cause");
    }
  });

  it("accepts HTTPS and exact HTTP loopback hosts", () => {
    for (const baseUrl of [
      "https://gateway.example.test",
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      "http://[::1]:8080",
    ]) {
      expect(() => new GrokBotConnection({ baseUrl }, ACCOUNT_HASH)).not.toThrow();
    }
  });

  it("rejects unsafe URLs including URL-normalized loopback aliases", () => {
    for (const baseUrl of [
      "http://remote.example.test",
      "http://127.1",
      "http://127.0.0.2",
      "http://2130706433",
      "http://0x7f000001",
      "http://localhost.",
      "http://localhost.evil.test",
      "http://%6cocalhost",
      "file:///tmp/gateway",
      "https://user:password@gateway.example.test",
      "https://gateway.example.test?secret",
      "https://gateway.example.test#secret",
      "https://gateway.example.test?",
      "https://gateway.example.test#",
      "https://gateway.example.test\\foo",
      "https://gateway.example.test\n",
      " https://gateway.example.test",
      "https://bad_host.test",
      "https://gateway.example.test:0",
      "https://gateway.example.test:99999",
    ]) {
      expect(() => new GrokBotConnection({ baseUrl }, ACCOUNT_HASH), baseUrl).toThrow(
        ConnectionLoadError,
      );
    }
  });

  it("rejects invalid and duplicate header names and token control characters", () => {
    for (const descriptor of [
      { ...DESCRIPTOR, token: "secret\r\n" },
      { ...DESCRIPTOR, headers: { "bad:name": "secret" } },
      { ...DESCRIPTOR, headers: { "x-a": "a", "X-A": "b" } },
      { ...DESCRIPTOR, headers: { "x-a": "secret\n" } },
    ]) {
      expect(() => new GrokBotConnection(descriptor, ACCOUNT_HASH)).toThrow(ConnectionLoadError);
    }
  });
});

describe("Grok Bot gateway protocol", () => {
  it("retains routing metadata while excluding roster message previews", async () => {
    const bot = {
      id: "bot-1",
      name: "Dummy",
      harness: "temporal",
      viewerSessionId: "session-1",
      serverId: "server-1",
      isGroup: true,
      memberIds: ["bot-2"],
      avatarShape: "pebble",
      avatarColor: "red",
      avatarVersion: "version-one",
    };
    const { gateway, fetch } = fixtureGateway(async () =>
      jsonResponse([
        { ...bot, lastEntry: { text: "private preview" }, avatarDataUrl: "large-image" },
      ]),
    );
    expect(await gateway.roster()).toEqual({ bots: [bot] });
    const [, init] = fetch.mock.calls[0]!;
    expect(init?.redirect).toBe("manual");
    expect(init?.body).toBe("{}");
    expect(new Headers(init?.headers).get("x-sand-slim-avatars")).toBe("1");
  });

  it("reads custom avatars only through the bounded authenticated avatar method", async () => {
    const { gateway, fetch } = fixtureGateway(async () =>
      jsonResponse({ dataUrl: PNG_AVATAR, version: "avatar-one" }),
    );
    expect(await gateway.avatar({ botId: "bot-1" })).toEqual({
      dataUrl: PNG_AVATAR,
      version: "avatar-one",
    });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://gateway.example.test/private-path/api/getAgentAvatar");
    expect(JSON.parse(String(init?.body))).toEqual({ id: "bot-1" });
    expect(new Headers(init?.headers).get("x-sand-slim-avatars")).toBe("1");
    expect(init?.redirect).toBe("manual");
    fetch.mockImplementation(async () => jsonResponse({ dataUrl: null, version: null }));
    expect(await gateway.avatar({ botId: "bot-1" })).toEqual({ dataUrl: null, version: null });
  });

  it("rejects remote URLs, SVGs, mislabeled payloads, invalid base64, and oversized avatars", async () => {
    for (const dataUrl of [
      "https://private.example.test/image.png",
      `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`,
      `data:image/png;base64,${Buffer.from("<svg/>").toString("base64")}`,
      "data:image/png;base64,%%%",
      "data:image/png;base64,AAAAA",
      `data:image/png;base64,${"A".repeat(CREW_AVATAR_MAX_DATA_URL_LENGTH)}`,
    ]) {
      const { gateway } = fixtureGateway(async () => jsonResponse({ dataUrl, version: null }));
      const error = await gateway.avatar({ botId: "bot-1" }).catch((value: unknown) => value);
      expect(error).toBeInstanceOf(GatewayError);
      expect(NodeUtil.inspect(error)).not.toContain(dataUrl);
      expect(error).not.toHaveProperty("cause");
    }
  });

  it("rejects missing avatar targets before contacting the gateway", async () => {
    const { gateway, fetch } = fixtureGateway(async () =>
      jsonResponse({ dataUrl: null, version: null }),
    );
    await expect(gateway.avatar({ botId: " " })).rejects.toThrow(GatewayError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves heterogeneous transcript cards and exact pagination/session fields", async () => {
    const entries = [
      { kind: "message", id: "message-1", role: "user", content: "Hi", clientNonce: "nonce-1" },
      { kind: "send-message", id: "message-2", message: { type: "text", content: "Hello" } },
      { kind: "future-card", id: "card-1", arbitrary: { unknown: true } },
    ];
    const { gateway, fetch } = fixtureGateway(async () =>
      jsonResponse({ entries, nextBeforeSeq: 42 }),
    );
    expect(
      await gateway.transcript({ botId: "bot-1", sessionId: "session-1", beforeSeq: 90, limit: 3 }),
    ).toEqual({ entries, nextBeforeSeq: 42 });
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toEqual({
      id: "bot-1",
      sessionId: "session-1",
      beforeSeq: 90,
      limit: 3,
    });
  });

  it("rejects invalid pagination before dispatch", async () => {
    const { gateway, fetch } = fixtureGateway(async () => jsonResponse({ entries: [] }));
    await expect(gateway.transcript({ botId: "bot-1", limit: 201 })).rejects.toThrow(GatewayError);
    await expect(gateway.transcript({ botId: "bot-1", beforeSeq: 0.5 })).rejects.toThrow(
      GatewayError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends once using the caller's nonce and explicit session", async () => {
    const { gateway, fetch } = fixtureGateway(async () => jsonResponse({ accepted: true }));
    expect(
      await gateway.send({
        botId: "bot-1",
        sessionId: "session-1",
        text: "Hello",
        clientNonce: "stable-nonce",
      }),
    ).toEqual({ accepted: true });
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toEqual({
      agentId: "bot-1",
      sessionId: "session-1",
      prompt: "Hello",
      clientNonce: "stable-nonce",
    });
  });

  it("does not confuse null or missing acceptance with accepted delivery", async () => {
    for (const [response, accepted] of [
      [null, null],
      [{}, null],
      [{ accepted: null }, null],
      [{ accepted: false }, false],
    ] as const) {
      const { gateway } = fixtureGateway(async () => jsonResponse(response));
      expect(await gateway.send({ botId: "bot-1", text: "Hello", clientNonce: "stable" })).toEqual({
        accepted,
      });
    }
  });

  it("rejects missing nonce and blank messages before dispatch", async () => {
    const { gateway, fetch } = fixtureGateway(async () => jsonResponse({ accepted: true }));
    await expect(
      gateway.send({ botId: "bot-1", text: "Hello", clientNonce: " " }),
    ).rejects.toMatchObject({ deliveryUnknown: false });
    await expect(
      gateway.send({ botId: "bot-1", text: "\n", clientNonce: "stable" }),
    ).rejects.toMatchObject({ deliveryUnknown: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never retries ambiguous sends or forwards transport details", async () => {
    const { gateway, fetch } = fixtureGateway(async () => {
      throw new Error("https://private-host/synthetic-private-token");
    });
    const error = await gateway
      .send({ botId: "bot-1", text: "Hello", clientNonce: "stable" })
      .catch((error: unknown) => error);
    expect(fetch).toHaveBeenCalledOnce();
    expect(error).toMatchObject({ deliveryUnknown: true });
    expect(NodeUtil.inspect(error)).not.toContain("private-host");
    expect(NodeUtil.inspect(error)).not.toContain("synthetic-private-token");
    expect(error).not.toHaveProperty("cause");
  });

  it("rejects redirects without following and ignores error bodies", async () => {
    const { gateway, fetch } = fixtureGateway(
      async () =>
        new Response("synthetic-private-response", {
          status: 302,
          headers: { Location: "https://private-host" },
        }),
    );
    const error = await gateway.roster().catch((error: unknown) => error);
    expect(error).toMatchObject({ message: "Gateway returned HTTP 302; no retry was attempted." });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![1]?.redirect).toBe("manual");
    expect(NodeUtil.inspect(error)).not.toContain("synthetic-private-response");
  });

  it("marks invalid send replies and interrupted bodies as ambiguous without retrying", async () => {
    for (const response of [
      jsonResponse({ accepted: "true" }),
      new Response("not-json-private-token"),
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("private-token"));
          },
        }),
      ),
    ]) {
      const { gateway, fetch } = fixtureGateway(async () => response);
      const error = await gateway
        .send({ botId: "bot-1", text: "Hello", clientNonce: "stable" })
        .catch((error: unknown) => error);
      expect(error).toMatchObject({ deliveryUnknown: true });
      expect(NodeUtil.inspect(error)).not.toContain("private-token");
      expect(fetch).toHaveBeenCalledOnce();
    }
  });
});

describe("Grok Bot SSE", () => {
  it("ends a silently stalled stream so the controller can reconnect and backfill", async () => {
    vi.useFakeTimers();
    try {
      const { gateway } = fixtureGateway(async () => new Response(new ReadableStream()));
      const reading = collect(gateway.events(new AbortController().signal));
      const assertion = expect(reading).rejects.toThrow("stalled");
      await vi.advanceTimersByTimeAsync(35_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("parses multiline data, keepalives, split CRLF, and split UTF-8 without emitting incomplete frames", async () => {
    const bytes = new TextEncoder().encode(
      ': keepalive\r\n\r\ndata: {"channel":"transcript",\r\ndata: "payload":{"text":"👋"}}\r\n\r\ndata: {"channel":"incomplete"}',
    );
    const singleBytes = Array.from(bytes, (value) => Uint8Array.of(value));
    expect(await collect(parseGatewayEvents(chunks(...singleBytes)))).toEqual([
      { channel: "transcript", payload: { text: "👋" } },
    ]);
  });

  it("supports CR-only and LF line endings", async () => {
    expect(
      await collect(
        parseGatewayEvents(
          chunks(
            'data: {"channel":"one","payload":null}\r\rdata: {"channel":"two","payload":[]}\n\n',
          ),
        ),
      ),
    ).toEqual([
      { channel: "one", payload: null },
      { channel: "two", payload: [] },
    ]);
  });

  it("rejects malformed UTF-8, JSON, and event envelopes with sanitized errors", async () => {
    for (const input of [
      Uint8Array.of(255),
      "data: private-token\n\n",
      'data: {"channel":1,"payload":null}\n\n',
      'data: {"channel":"missing-payload"}\n\n',
    ]) {
      const error = await collect(parseGatewayEvents(chunks(input))).catch(
        (error: unknown) => error,
      );
      expect(error).toBeInstanceOf(GatewayError);
      expect(NodeUtil.inspect(error)).not.toContain("private-token");
    }
  });

  it("authenticates the event stream and cancels its body when the consumer stops", async () => {
    const cancel = vi.fn();
    const { gateway, fetch } = fixtureGateway(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode('data: {"channel":"agents","payload":[]}\n\n'),
              );
            },
            cancel,
          }),
        ),
    );
    for await (const event of gateway.events(new AbortController().signal)) {
      expect(event).toEqual({ channel: "agents", payload: [] });
      break;
    }
    expect(cancel).toHaveBeenCalled();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://gateway.example.test/private-path/events");
    expect(init?.method).toBe("GET");
    expect(init?.redirect).toBe("manual");
    expect(new Headers(init?.headers).get("Accept")).toBe("text/event-stream");
  });
});
