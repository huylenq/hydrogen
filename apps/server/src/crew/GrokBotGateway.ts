// @effect-diagnostics nodeBuiltinImport:off - Native crypto and Keychain access are confined to this adapter.
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as HostProcess from "@t3tools/shared/HostProcess";
import {
  CREW_AVATAR_MAX_BYTES,
  CREW_AVATAR_MAX_DATA_URL_LENGTH,
  CrewAvatarDataUrl,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const MAX_DESCRIPTOR_BYTES = 1024 * 1024;
const MAX_REPLY_BYTES = 16 * 1024 * 1024;
const MAX_DESCRIPTOR_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ACCOUNT_HASH = /^[0-9a-f]{64}$/;
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const HOST_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const NonEmptyString = Schema.String.check(Schema.isPattern(/\S/));
const NonnegativeInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const JsonObject = Schema.Record(Schema.String, Schema.Unknown);
const Descriptor = Schema.Struct({
  baseUrl: NonEmptyString,
  token: Schema.optional(Schema.String),
  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});
const DescriptorStore = Schema.Struct({
  version: Schema.Literal(2),
  entries: Schema.Record(Schema.String, Schema.Unknown),
});
const SavedEntry = Schema.Struct({
  savedAtMs: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
  encrypted: Schema.String,
});
const Bot = Schema.Struct({
  id: NonEmptyString,
  name: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  isGroup: Schema.optional(Schema.Boolean),
  memberIds: Schema.optional(Schema.Array(Schema.String)),
  harness: Schema.optional(Schema.String),
  serverId: Schema.optional(Schema.String),
  viewerSessionId: Schema.optional(Schema.String),
  viewerIsOwner: Schema.optional(Schema.NullOr(Schema.Boolean)),
  visibility: Schema.optional(Schema.NullOr(Schema.String)),
  runningSessionIds: Schema.optional(Schema.Array(Schema.String)),
  activeGroupMemberId: Schema.optional(Schema.String),
  isActive: Schema.optional(Schema.Boolean),
  isRunning: Schema.optional(Schema.Boolean),
  isRunningTurn: Schema.optional(Schema.NullOr(Schema.Boolean)),
  isComposingMessage: Schema.optional(Schema.Boolean),
  isRetrying: Schema.optional(Schema.NullOr(Schema.Boolean)),
  hasUnread: Schema.optional(Schema.Boolean),
  unreadCount: Schema.optional(Schema.Finite),
  awaitingUserResponse: Schema.optional(Schema.Unknown),
  lastActivityAt: Schema.optional(Schema.Finite),
  createdAt: Schema.optional(Schema.Finite),
  updatedAt: Schema.optional(Schema.Finite),
  isHiddenFromSidebar: Schema.optional(Schema.NullOr(Schema.Boolean)),
  avatarShape: Schema.optional(Schema.Unknown),
  avatarColor: Schema.optional(Schema.Unknown),
  avatarVersion: Schema.optional(Schema.Unknown),
});
const AvatarReply = Schema.Struct({
  dataUrl: Schema.optional(Schema.NullOr(CrewAvatarDataUrl)),
  version: Schema.optional(Schema.NullOr(Schema.String.check(Schema.isMaxLength(256)))),
});
const AvatarInput = Schema.Struct({ botId: NonEmptyString });
const TranscriptPage = Schema.Struct({
  entries: Schema.Array(JsonObject),
  nextBeforeSeq: Schema.optional(Schema.NullOr(NonnegativeInteger)),
});
const SendReply = Schema.NullOr(
  Schema.Struct({ accepted: Schema.optional(Schema.NullOr(Schema.Boolean)) }),
);
const Event = Schema.Struct({ channel: Schema.String, payload: Schema.Unknown });
const TranscriptInput = Schema.Struct({
  botId: NonEmptyString,
  sessionId: Schema.optional(Schema.String),
  beforeSeq: Schema.optional(NonnegativeInteger),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 }))),
});
const SendInput = Schema.Struct({
  botId: NonEmptyString,
  sessionId: Schema.optional(Schema.String),
  text: NonEmptyString,
  clientNonce: NonEmptyString,
});

const decodeDescriptor = Schema.decodeUnknownSync(Descriptor);
const decodeAccountHashes = Schema.decodeUnknownSync(
  Schema.Array(Schema.String.check(Schema.isPattern(ACCOUNT_HASH))),
);
const decodeDescriptorStore = Schema.decodeUnknownSync(Schema.fromJsonString(DescriptorStore));
const decodeSavedEntry = Schema.decodeUnknownSync(SavedEntry);
const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));
const decodeEvent = Schema.decodeUnknownSync(Schema.fromJsonString(Event));
const decodeBots = Schema.decodeUnknownSync(Schema.Array(Bot));
const decodeAvatarReply = Schema.decodeUnknownSync(AvatarReply);
const decodeAvatarInput = Schema.decodeUnknownSync(AvatarInput);
const decodeTranscriptInput = Schema.decodeUnknownSync(TranscriptInput);
const decodeTranscriptPage = Schema.decodeUnknownSync(TranscriptPage);
const decodeSendInput = Schema.decodeUnknownSync(SendInput);
const decodeSendReply = Schema.decodeUnknownSync(SendReply);

export type GatewayBot = typeof Bot.Type;
export type GatewayTranscriptPage = typeof TranscriptPage.Type;
export type GatewayEvent = typeof Event.Type;

/** Errors contain no underlying exception, request URL, headers, or response body. */
export class GatewayError extends Error {
  override readonly name = "GatewayError";
  readonly deliveryUnknown: boolean;

  constructor(message: string, deliveryUnknown = false) {
    super(message);
    this.deliveryUnknown = deliveryUnknown;
  }
}

export class ConnectionLoadError extends Error {
  override readonly name = "ConnectionLoadError";
}

function validateDescriptor(value: unknown): typeof Descriptor.Type {
  let descriptor: typeof Descriptor.Type;
  try {
    descriptor = decodeDescriptor(value);
  } catch {
    throw new ConnectionLoadError("Saved gateway connection has invalid fields.");
  }
  const { baseUrl, token, headers } = descriptor;
  try {
    if (
      /[\s\\?#]/.test(baseUrl) ||
      [...baseUrl].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)
    )
      throw new Error();
    const url = new URL(baseUrl);
    const authority = /^https?:\/\/([^/]+)/i.exec(baseUrl)?.[1];
    if (!authority || authority.includes("@")) throw new Error();
    const host = authority.startsWith("[")
      ? authority.slice(1, authority.indexOf("]"))
      : authority.split(":")[0];
    if (!host) throw new Error();
    if (host.includes(":")) {
      if (NodeNet.isIP(host) !== 6) throw new Error();
    } else if (
      host.length > 253 ||
      !host
        .replace(/\.$/, "")
        .split(".")
        .every((label) => HOST_LABEL.test(label))
    ) {
      throw new Error();
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.port === "0" ||
      (url.protocol === "http:" && !["localhost", "127.0.0.1", "::1"].includes(host.toLowerCase()))
    ) {
      throw new Error();
    }
  } catch {
    throw new ConnectionLoadError(
      "Gateway must use HTTPS or HTTP with an exact loopback host, without credentials, query strings, or fragments.",
    );
  }
  if (
    token !== undefined &&
    [...token].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) > 126)
  ) {
    throw new ConnectionLoadError("Saved gateway connection has an invalid token.");
  }
  const names = new Set<string>();
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (
      !HEADER_NAME.test(name) ||
      names.has(name.toLowerCase()) ||
      [...value].some((char) => {
        const code = char.charCodeAt(0);
        return (code < 32 && code !== 9) || code === 127 || code > 255;
      })
    ) {
      throw new ConnectionLoadError("Saved gateway connection has invalid headers.");
    }
    names.add(name.toLowerCase());
  }
  return { ...descriptor, baseUrl: baseUrl.replace(/\/+$/, "") };
}

const connectionSecrets = new WeakMap<GrokBotConnection, typeof Descriptor.Type>();

/** Only the account hash is enumerable. Credentials remain in memory at this boundary. */
export class GrokBotConnection {
  readonly accountScope: string;

  constructor(descriptor: unknown, accountScope: string) {
    if (!ACCOUNT_HASH.test(accountScope)) {
      throw new ConnectionLoadError("Saved gateway connection has an invalid account hash.");
    }
    this.accountScope = accountScope;
    connectionSecrets.set(this, validateDescriptor(descriptor));
  }
}

export interface AppConnectionDependencies {
  readonly readDescriptor?: (path: string) => Promise<Uint8Array>;
  /** Returns the password itself, preserving spaces, without security's trailing newline. */
  readonly readSafeStoragePassword?: () => Promise<Uint8Array>;
  readonly now?: () => number;
  readonly platform?: NodeJS.Platform;
}

export interface AppConnectionOptions {
  readonly accountScope?: string;
  readonly dataDir?: string;
  readonly dependencies?: AppConnectionDependencies;
}

async function readDescriptor(path: string): Promise<Uint8Array> {
  const file = await NodeFSP.open(path, "r");
  try {
    const buffer = Buffer.alloc(MAX_DESCRIPTOR_BYTES + 1);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await file.read(buffer, total, buffer.length - total, null);
      if (bytesRead === 0) break;
      total += bytesRead;
    }
    return buffer.subarray(0, total);
  } finally {
    await file.close();
  }
}

async function readSafeStoragePassword(platform: NodeJS.Platform): Promise<Uint8Array> {
  if (platform !== "darwin") {
    throw new ConnectionLoadError("Connecting through the installed Grok Bot app requires macOS.");
  }
  return new Promise((resolve, reject) => {
    NodeChildProcess.execFile(
      "/usr/bin/security",
      ["find-generic-password", "-s", "Grok Bot Safe Storage", "-w"],
      { encoding: "buffer", timeout: 30_000, maxBuffer: MAX_DESCRIPTOR_BYTES },
      (error, stdout) => {
        if (error || stdout.length === 0) {
          reject(new ConnectionLoadError("macOS Keychain access failed or timed out."));
          return;
        }
        resolve(stdout.at(-1) === 10 ? stdout.subarray(0, -1) : stdout);
      },
    );
  });
}

async function readStore(options: AppConnectionOptions) {
  let bytes: Uint8Array;
  try {
    bytes = await (options.dependencies?.readDescriptor ?? readDescriptor)(
      NodePath.join(
        options.dataDir ??
          NodePath.join(NodeOS.homedir(), "Library", "Application Support", "Grok Bot"),
        "gateway-descriptor.json",
      ),
    );
  } catch {
    throw new ConnectionLoadError(
      "No readable saved gateway descriptor was found. Connect in Grok Bot first.",
    );
  }
  if (bytes.byteLength > MAX_DESCRIPTOR_BYTES) {
    throw new ConnectionLoadError("Saved gateway descriptor exceeds the supported size.");
  }
  try {
    const store = decodeDescriptorStore(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (decodeAccountHashes(Object.keys(store.entries)).length === 0) throw new Error();
    return store;
  } catch {
    throw new ConnectionLoadError(
      "Saved gateway descriptor has an unsupported or invalid format; expected version 2 account entries.",
    );
  }
}

/** Reads account hashes only. This never accesses Keychain or opens a network connection. */
export async function discoverAppAccounts(
  options: AppConnectionOptions = {},
): Promise<readonly string[]> {
  return Object.keys((await readStore(options)).entries).sort();
}

/** Explicit connection operation: reads only gateway-descriptor.json and its Safe Storage key. */
export async function loadAppConnection(
  options: AppConnectionOptions = {},
): Promise<GrokBotConnection> {
  const { entries } = await readStore(options);
  const keys = Object.keys(entries);
  let accountScope: string;
  if (options.accountScope === undefined) {
    if (keys.length !== 1) {
      throw new ConnectionLoadError(
        "Multiple saved accounts exist. Select the stored account hash.",
      );
    }
    accountScope = keys[0]!;
  } else {
    const scope = options.accountScope;
    let candidates: Set<string>;
    try {
      if (!scope || !scope.isWellFormed()) throw new Error();
      candidates = new Set(
        [scope, decodeURIComponent(scope.replace(/%(?![0-9a-f]{2})/gi, "%25"))].map((value) =>
          NodeCrypto.createHash("sha256").update(value).digest("hex"),
        ),
      );
      if (ACCOUNT_HASH.test(scope)) candidates.add(scope);
    } catch {
      throw new ConnectionLoadError("Account scope must be nonempty valid UTF-8 text.");
    }
    const matches = keys.filter((key) => candidates.has(key));
    if (matches.length === 0) {
      throw new ConnectionLoadError("No saved gateway descriptor matches the selected account.");
    }
    if (matches.length !== 1) {
      throw new ConnectionLoadError(
        "Selected scope matches multiple saved accounts. Use the exact stored account hash.",
      );
    }
    accountScope = matches[0]!;
  }
  let entry: typeof SavedEntry.Type;
  try {
    entry = decodeSavedEntry(entries[accountScope]);
  } catch {
    throw new ConnectionLoadError("Saved gateway descriptor has an invalid account entry.");
  }
  const now = (options.dependencies?.now ?? Date.now)();
  if (entry.savedAtMs > now + 5 * 60_000) {
    throw new ConnectionLoadError("Saved gateway descriptor has an invalid timestamp.");
  }
  if (now - entry.savedAtMs > MAX_DESCRIPTOR_AGE_MS) {
    throw new ConnectionLoadError(
      "Saved gateway descriptor is older than seven days. Reconnect in Grok Bot first.",
    );
  }
  const encoded = entry.encrypted;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new ConnectionLoadError("Saved gateway descriptor has invalid base64 data.");
  }
  const encrypted = Buffer.from(encoded, "base64");
  if (
    encrypted.subarray(0, 3).toString("ascii") !== "v10" ||
    encrypted.length <= 3 ||
    (encrypted.length - 3) % 16 !== 0
  ) {
    throw new ConnectionLoadError(
      "Saved gateway descriptor has unsupported encryption; expected v10 AES blocks.",
    );
  }
  let password: Uint8Array;
  try {
    password = await (
      options.dependencies?.readSafeStoragePassword ??
      (() =>
        readSafeStoragePassword(
          options.dependencies?.platform ?? HostProcess.Platform.defaultValue(),
        ))
    )();
    if (password.byteLength === 0) throw new Error();
  } catch {
    throw new ConnectionLoadError(
      "macOS Keychain did not provide Grok Bot's Safe Storage password.",
    );
  }
  let descriptor: unknown;
  try {
    const key = NodeCrypto.pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
    const decipher = NodeCrypto.createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, 32));
    const plaintext = Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()]);
    descriptor = decodeJson(new TextDecoder("utf-8", { fatal: true }).decode(plaintext));
  } catch {
    throw new ConnectionLoadError("Saved gateway descriptor could not be decrypted or parsed.");
  }
  return new GrokBotConnection(descriptor, accountScope);
}

export interface GrokBotGateway {
  readonly accountScope: string;
  roster(): Promise<{ readonly bots: readonly GatewayBot[] }>;
  avatar(
    input: typeof AvatarInput.Type,
  ): Promise<{ readonly dataUrl: string | null; readonly version: string | null }>;
  transcript(input: typeof TranscriptInput.Type): Promise<GatewayTranscriptPage>;
  send(input: typeof SendInput.Type): Promise<{ readonly accepted: boolean | null }>;
  events(signal: AbortSignal): AsyncIterable<GatewayEvent>;
}

export interface GatewayOptions {
  readonly fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  readonly timeoutMs?: number;
}

// The declared MIME type is insufficient: a mislabeled SVG must never cross this boundary.
function isRasterAvatar(dataUrl: string): boolean {
  const comma = dataUrl.indexOf(",");
  const mimeType = dataUrl.slice(5, dataUrl.indexOf(";"));
  const encoded = dataUrl.slice(comma + 1);
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length > CREW_AVATAR_MAX_BYTES || bytes.toString("base64") !== encoded) return false;
  switch (mimeType) {
    case "image/png":
      return (
        bytes.length >= 24 &&
        bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
        bytes.subarray(12, 16).toString("ascii") === "IHDR"
      );
    case "image/jpeg":
      return bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    case "image/gif":
      return (
        bytes.length >= 10 && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))
      );
    case "image/webp":
      return (
        bytes.length >= 16 &&
        bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
        bytes.subarray(8, 12).toString("ascii") === "WEBP"
      );
    default:
      return false;
  }
}

async function readReply(response: Response, maxBytes = MAX_REPLY_BYTES): Promise<string> {
  if (!response.body) throw new GatewayError("Gateway reply was empty.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new GatewayError("Gateway reply exceeds the size limit.");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function* readEventChunks(
  body: ReadableStream<Uint8Array>,
  controller: AbortController,
): AsyncIterable<Uint8Array> {
  const reader = body.getReader();
  try {
    while (true) {
      let stalled = false;
      // @effect-diagnostics-next-line globalTimers:off - The SSE boundary bounds each idle read; keepalives reset the watchdog.
      const timer = setTimeout(() => {
        stalled = true;
        controller.abort();
        void reader.cancel().catch(() => undefined);
      }, 35_000);
      let result: Awaited<ReturnType<typeof reader.read>>;
      try {
        result = await reader.read();
      } finally {
        clearTimeout(timer);
      }
      if (stalled)
        throw new GatewayError("Gateway event stream stalled. Reconnect and reconcile history.");
      if (result.done) return;
      yield result.value;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** SSE has no replay cursor. Callers must reconcile roster/history after any reconnect. */
export async function* parseGatewayEvents(
  chunks: AsyncIterable<Uint8Array>,
): AsyncIterable<GatewayEvent> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let pending = "";
  let data: string[] = [];
  let size = 0;
  let skipLf = false;
  const handleLine = (line: string): GatewayEvent | undefined => {
    if (line === "") {
      let event: GatewayEvent | undefined;
      if (data.length > 0) {
        event = decodeEvent(data.join("\n"));
      }
      data = [];
      size = 0;
      return event;
    }
    if (line.startsWith("data:")) {
      const value = line.slice(5).replace(/^ /, "");
      size += Buffer.byteLength(value);
      if (size > MAX_REPLY_BYTES) throw new GatewayError("Gateway event exceeds the size limit.");
      data.push(value);
    }
    return undefined;
  };
  try {
    for await (const chunk of chunks) {
      let text = decoder.decode(chunk, { stream: true });
      if (skipLf && text.length > 0) {
        if (text.startsWith("\n")) text = text.slice(1);
        skipLf = false;
      }
      pending += text;
      let match: RegExpExecArray | null;
      while ((match = /\r\n|\r|\n/.exec(pending))) {
        const line = pending.slice(0, match.index);
        pending = pending.slice(match.index + match[0].length);
        skipLf = match[0] === "\r" && pending.length === 0;
        const event = handleLine(line);
        if (event) yield event;
      }
      if (Buffer.byteLength(pending) + size > MAX_REPLY_BYTES) {
        throw new GatewayError("Gateway event exceeds the size limit.");
      }
    }
    decoder.decode();
    // An event without a terminating blank line is incomplete and is discarded.
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    throw new GatewayError(
      "Invalid or interrupted gateway event stream. Reconnect and reconcile history.",
    );
  }
}

export function createGateway(
  connection: GrokBotConnection,
  options: GatewayOptions = {},
): GrokBotGateway {
  const descriptor = connectionSecrets.get(connection);
  if (!descriptor) throw new ConnectionLoadError("Invalid gateway connection.");
  const fetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new GatewayError("Gateway timeout must be positive.");
  const headersFor = (stream: boolean) => {
    const headers = new Headers(descriptor.headers);
    if (descriptor.token) headers.set("Authorization", `Bearer ${descriptor.token}`);
    headers.set("Accept", stream ? "text/event-stream" : "application/json");
    headers.set("x-sand-slim-avatars", "1");
    if (!stream) headers.set("Content-Type", "application/json");
    return headers;
  };
  const call = async (
    method: string,
    payload: unknown,
    sending = false,
    maxReplyBytes = MAX_REPLY_BYTES,
  ): Promise<unknown> => {
    try {
      const response = await fetch(`${descriptor.baseUrl}/api/${method}`, {
        method: "POST",
        headers: headersFor(false),
        body: JSON.stringify(payload),
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new GatewayError(
          `Gateway returned HTTP ${response.status}; no retry was attempted.`,
          sending,
        );
      }
      return decodeJson(await readReply(response, maxReplyBytes));
    } catch (error) {
      if (error instanceof GatewayError) throw new GatewayError(error.message, sending);
      throw new GatewayError(
        sending
          ? "Gateway send failed; delivery may be unknown. No retry was attempted."
          : "Gateway request failed or returned an invalid response.",
        sending,
      );
    }
  };
  return {
    accountScope: connection.accountScope,
    async roster() {
      const raw = await call("listAgents", {});
      try {
        return { bots: decodeBots(raw) };
      } catch {
        throw new GatewayError("Unexpected gateway roster response.");
      }
    },
    async avatar(input) {
      let parsed: typeof AvatarInput.Type;
      try {
        parsed = decodeAvatarInput(input);
      } catch {
        throw new GatewayError("Provide a bot ID to read its avatar.");
      }
      const raw = await call(
        "getAgentAvatar",
        { id: parsed.botId },
        false,
        CREW_AVATAR_MAX_DATA_URL_LENGTH + 2048,
      );
      try {
        const avatar = decodeAvatarReply(raw);
        if (avatar.dataUrl && !isRasterAvatar(avatar.dataUrl)) throw new Error();
        return { dataUrl: avatar.dataUrl ?? null, version: avatar.version ?? null };
      } catch {
        throw new GatewayError("Grok Bot returned an unsupported or invalid avatar.");
      }
    },
    async transcript(input) {
      let parsed: typeof TranscriptInput.Type;
      try {
        parsed = decodeTranscriptInput(input);
      } catch {
        throw new GatewayError(
          "Provide a bot ID, a limit from 1 to 200, and a nonnegative history cursor.",
        );
      }
      const raw = await call("getAgentTranscriptTail", {
        id: parsed.botId,
        limit: parsed.limit ?? 100,
        ...(parsed.beforeSeq !== undefined ? { beforeSeq: parsed.beforeSeq } : {}),
        ...(parsed.sessionId ? { sessionId: parsed.sessionId } : {}),
      });
      try {
        return decodeTranscriptPage(raw);
      } catch {
        throw new GatewayError("Unexpected gateway transcript response.");
      }
    },
    async send(input) {
      let parsed: typeof SendInput.Type;
      try {
        parsed = decodeSendInput(input);
      } catch {
        throw new GatewayError(
          "Sending requires a bot ID, nonempty message, and stable client nonce.",
        );
      }
      const raw = await call(
        "sendPrompt",
        {
          agentId: parsed.botId,
          prompt: parsed.text,
          clientNonce: parsed.clientNonce,
          ...(parsed.sessionId ? { sessionId: parsed.sessionId } : {}),
        },
        true,
      );
      try {
        const result = decodeSendReply(raw);
        return { accepted: result?.accepted ?? null };
      } catch {
        throw new GatewayError(
          "Unexpected send response; delivery may be unknown. No retry was attempted.",
          true,
        );
      }
    },
    async *events(signal) {
      const controller = new AbortController();
      const requestSignal = AbortSignal.any([signal, controller.signal]);
      // @effect-diagnostics-next-line globalTimers:off - The fetch boundary clears this handshake timer when response headers arrive.
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response | undefined;
      try {
        response = await fetch(`${descriptor.baseUrl}/events`, {
          method: "GET",
          headers: headersFor(true),
          redirect: "manual",
          signal: requestSignal,
        });
        clearTimeout(timer);
        if (!response.ok)
          throw new GatewayError(`Gateway events returned HTTP ${response.status}.`);
        if (!response.body) throw new GatewayError("Gateway event stream was empty.");
        yield* parseGatewayEvents(readEventChunks(response.body, controller));
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof GatewayError) throw error;
        throw new GatewayError("Gateway event stream failed. Reconnect and reconcile history.");
      } finally {
        clearTimeout(timer);
        controller.abort();
        await response?.body?.cancel().catch(() => undefined);
      }
    },
  };
}
