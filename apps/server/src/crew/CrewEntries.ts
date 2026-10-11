// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";
import type { CrewEntry, CrewHandoff } from "@t3tools/contracts";
import { DateTime, Option, Schema } from "effect";
import { matchesCrewReply } from "./CrewDelivery.ts";

const Author = Schema.Struct({
  id: Schema.optional(Schema.Unknown),
  name: Schema.optional(Schema.String),
});
const AgentIdentity = Schema.Struct({
  id: Schema.optional(Schema.Unknown),
  name: Schema.optional(Schema.Unknown),
});
const AgentRecipient = Schema.Struct({
  ...AgentIdentity.fields,
  kind: Schema.Literal("agent"),
});

const RawEntry = Schema.Struct({
  id: Schema.optional(Schema.String),
  kind: Schema.optional(Schema.String),
  role: Schema.optional(Schema.String),
  content: Schema.optional(Schema.Unknown),
  text: Schema.optional(Schema.Unknown),
  clientNonce: Schema.optional(Schema.String),
  nonce: Schema.optional(Schema.String),
  isStreaming: Schema.optional(Schema.Boolean),
  streaming: Schema.optional(Schema.NullOr(Schema.Boolean)),
  timestampMs: Schema.optional(Schema.Number),
  fromAgent: Schema.optional(Schema.Unknown),
  toAgent: Schema.optional(Schema.Unknown),
  fromUser: Schema.optional(Schema.NullOr(Author)),
  author: Schema.optional(Schema.NullOr(Author)),
  createdAt: Schema.optional(Schema.Unknown),
  timestamp: Schema.optional(Schema.Unknown),
  authorName: Schema.optional(Schema.String),
  message: Schema.optional(Schema.Unknown),
});
const Message = Schema.Struct({
  type: Schema.optional(Schema.String),
  content: Schema.optional(Schema.Unknown),
});

const decodeRawEntry = Schema.decodeUnknownSync(RawEntry);
const decodeMessage = Schema.decodeUnknownOption(Message);
const decodeAgentIdentity = Schema.decodeUnknownOption(AgentIdentity);
const decodeAgentRecipient = Schema.decodeUnknownOption(AgentRecipient);

export function normalizeCrewEntry(value: unknown, botName: string): CrewEntry {
  const raw = decodeRawEntry(value);
  const message = decodeMessage(raw.message);
  const nested = message._tag === "Some" ? message.value : undefined;
  const kind = raw.kind ?? "unknown";
  const fromAgent = Option.getOrUndefined(decodeAgentIdentity(raw.fromAgent));
  const toAgent = Option.getOrUndefined(decodeAgentRecipient(raw.toAgent));
  // Group replies use send-message.author; these message-only markers describe
  // traffic with another bot, rather than a reply addressed to this conversation.
  const peer = kind === "message" ? (fromAgent ?? toAgent) : undefined;
  const interBot: CrewEntry["interBot"] = peer
    ? {
        direction: fromAgent ? "incoming" : "outgoing",
        botId: typeof peer.id === "string" ? peer.id : null,
        botName: typeof peer.name === "string" ? peer.name : null,
      }
    : undefined;
  const text =
    typeof raw.content === "string"
      ? raw.content
      : typeof raw.text === "string"
        ? raw.text
        : kind === "send-message" && nested?.type === "text" && typeof nested.content === "string"
          ? nested.content
          : "";
  const supported =
    (kind === "message" && text.length > 0) || (kind === "send-message" && nested?.type === "text");
  const role = interBot
    ? "system"
    : raw.role === "user" || raw.role === "assistant" || raw.role === "system"
      ? raw.role
      : kind === "send-message"
        ? "assistant"
        : "unknown";
  const timestamp = raw.timestampMs ?? raw.createdAt ?? raw.timestamp;
  const date =
    typeof timestamp === "string" || typeof timestamp === "number"
      ? DateTime.make(timestamp)
      : Option.none();
  return {
    id:
      raw.id ??
      `opaque-${NodeCrypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")}`,
    role,
    author:
      raw.fromUser?.name ??
      (typeof fromAgent?.name === "string" ? fromAgent.name : undefined) ??
      raw.author?.name ??
      raw.authorName ??
      (role === "user" ? "You" : role === "assistant" ? botName : "Grok Bot"),
    ...(kind === "send-message" && typeof raw.author?.id === "string"
      ? { authorBotId: raw.author.id }
      : {}),
    text,
    createdAt: Option.isSome(date) ? DateTime.formatIso(date.value) : null,
    streaming: raw.isStreaming ?? raw.streaming ?? false,
    nonce: raw.clientNonce ?? raw.nonce ?? null,
    unsupportedKind: supported ? null : nested?.type ? `${kind}:${nested.type}` : kind,
    ...(interBot ? { interBot } : {}),
  };
}

/** Subsequent entries are conversation evidence, never a claim of semantic task completion. */
export function reconcileHandoff(
  handoff: CrewHandoff,
  entries: readonly CrewEntry[],
  now: string,
): CrewHandoff {
  const echoIndex = entries.findIndex(
    (entry) => !entry.interBot && entry.role === "user" && entry.nonce === handoff.nonce,
  );
  if (echoIndex < 0) return handoff;
  const replies: CrewEntry[] = [];
  for (const entry of entries.slice(echoIndex + 1)) {
    if (entry.interBot) continue;
    if (entry.role === "user") break;
    if (entry.role === "assistant") replies.push(entry);
  }
  const echoEntryId = entries[echoIndex]!.id;
  let delegation = handoff.delegation;
  if (
    delegation &&
    delegation.delivery.text === null &&
    ["awaiting_reply", "ready"].includes(delegation.delivery.status)
  ) {
    const marker = delegation.replyMarker;
    const completed = replies.filter((entry) => !entry.streaming && !entry.unsupportedKind);
    // An unmarked assistant entry may belong to concurrent human traffic. Only a single
    // final marker, following the exact nonce echo in this conversation, can wake a task.
    const matched = completed.filter((entry) => matchesCrewReply(entry, marker));
    const correlation =
      matched.length === 1 ? "matched" : completed.length > 0 ? "needs_attention" : "awaiting";
    const status = correlation === "matched" ? "ready" : "awaiting_reply";
    const error =
      correlation === "needs_attention"
        ? "The bot replied without a unique final reply marker. Review the conversation before using this response."
        : null;
    if (
      delegation.correlation !== correlation ||
      delegation.delivery.status !== status ||
      delegation.delivery.error !== error
    )
      delegation = {
        ...delegation,
        correlation,
        delivery: { ...delegation.delivery, status, error, updatedAt: now },
      };
  }
  if (
    handoff.acceptance === "accepted" &&
    handoff.echoEntryId === echoEntryId &&
    JSON.stringify(handoff.replies) === JSON.stringify(replies) &&
    delegation === handoff.delegation
  )
    return handoff;
  return {
    ...handoff,
    acceptance: "accepted",
    echoEntryId,
    replies,
    updatedAt: now,
    ...(delegation ? { delegation } : {}),
  };
}
