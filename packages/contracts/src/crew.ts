import * as Schema from "effect/Schema";
import { ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export class CrewError extends Schema.TaggedError<CrewError>()("CrewError", {
  code: Schema.Literals([
    "disconnected",
    "connection",
    "not_found",
    "nonce_conflict",
    "storage",
    "forbidden",
    "invalid_input",
  ]),
  message: Schema.String,
}) {}

export const CrewBot = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  isGroup: Schema.Boolean,
  sessionId: Schema.NullOr(Schema.String),
  memberIds: Schema.Array(Schema.String),
  unavailableReason: Schema.optional(Schema.String),
  avatarShape: Schema.optional(Schema.String),
  avatarColor: Schema.optional(Schema.String),
  avatarVersion: Schema.optional(Schema.String),
});
export type CrewBot = typeof CrewBot.Type;

export const CREW_AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const CREW_AVATAR_MAX_DATA_URL_LENGTH = Math.ceil(CREW_AVATAR_MAX_BYTES / 3) * 4 + 64;
export const CrewAvatarDataUrl = Schema.String.check(
  Schema.isMaxLength(CREW_AVATAR_MAX_DATA_URL_LENGTH),
  Schema.isPattern(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/),
);
export const CrewAvatarInput = Schema.Struct({
  accountScope: TrimmedNonEmptyString,
  botId: TrimmedNonEmptyString,
  version: Schema.optional(Schema.String),
});
export type CrewAvatarInput = typeof CrewAvatarInput.Type;
export const CrewAvatar = Schema.Struct({
  accountScope: Schema.String,
  botId: Schema.String,
  version: Schema.NullOr(Schema.String),
  dataUrl: Schema.NullOr(CrewAvatarDataUrl),
});
export type CrewAvatar = typeof CrewAvatar.Type;

export const CrewEntry = Schema.Struct({
  id: Schema.String,
  role: Schema.Literals(["user", "assistant", "system", "unknown"]),
  author: Schema.String,
  authorBotId: Schema.optional(Schema.String),
  text: Schema.String,
  createdAt: Schema.NullOr(Schema.String),
  streaming: Schema.Boolean,
  nonce: Schema.NullOr(Schema.String),
  unsupportedKind: Schema.NullOr(Schema.String),
  interBot: Schema.optional(
    Schema.Struct({
      direction: Schema.Literals(["incoming", "outgoing"]),
      botId: Schema.NullOr(Schema.String),
      botName: Schema.NullOr(Schema.String),
    }),
  ),
});
export type CrewEntry = typeof CrewEntry.Type;

const BriefText = Schema.String.check(Schema.isMaxLength(16000));
export const CrewTaskContext = Schema.Struct({
  goal: Schema.optional(BriefText),
  currentState: Schema.optional(BriefText),
  constraints: Schema.optional(Schema.Array(BriefText).check(Schema.isMaxLength(20))),
  evidence: Schema.optional(
    Schema.Array(
      Schema.Struct({
        label: Schema.String.check(Schema.isMaxLength(256)),
        text: BriefText,
      }),
    ).check(Schema.isMaxLength(20)),
  ),
  expectedResult: Schema.optional(BriefText),
});
export type CrewTaskContext = typeof CrewTaskContext.Type;
export const CrewDelivery = Schema.Struct({
  status: Schema.Literals([
    "awaiting_reply",
    "ready",
    "claimed",
    "accepted",
    "delivered",
    "stopped",
    "failed",
    "uncertain",
  ]),
  commandId: Schema.NullOr(Schema.String),
  messageId: Schema.NullOr(Schema.String),
  text: Schema.NullOr(Schema.String),
  entryIds: Schema.Array(Schema.String),
  error: Schema.NullOr(Schema.String),
  updatedAt: Schema.String,
  attempt: Schema.optional(Schema.Number),
});
export type CrewDelivery = typeof CrewDelivery.Type;
export const CrewDelegation = Schema.Struct({
  replyMarker: Schema.String,
  correlation: Schema.Literals(["awaiting", "matched", "needs_attention"]),
  rootHandoffId: Schema.String,
  parentHandoffId: Schema.NullOr(Schema.String),
  round: Schema.Number,
  maxRounds: Schema.Number,
  delivery: CrewDelivery,
});
export type CrewDelegation = typeof CrewDelegation.Type;

export const CrewHandoff = Schema.Struct({
  id: Schema.String,
  accountScope: Schema.String,
  originThreadId: Schema.NullOr(ThreadId),
  botId: Schema.String,
  sessionId: Schema.String,
  nonce: Schema.String,
  text: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  acceptance: Schema.Literals(["pending", "accepted", "uncertain", "rejected"]),
  echoEntryId: Schema.NullOr(Schema.String),
  replies: Schema.Array(CrewEntry),
  context: Schema.optional(CrewTaskContext),
  contextTokenBudget: Schema.optional(Schema.Number),
  wireText: Schema.optional(Schema.String),
  delegation: Schema.optional(CrewDelegation),
});
export type CrewHandoff = typeof CrewHandoff.Type;

export const CrewSnapshot = Schema.Struct({
  connection: Schema.Struct({
    status: Schema.Literals(["disconnected", "connecting", "connected", "error"]),
    accountScope: Schema.NullOr(Schema.String),
    error: Schema.NullOr(Schema.String),
    availableAccountScopes: Schema.optional(Schema.Array(Schema.String)),
  }),
  bots: Schema.Array(CrewBot),
  handoffs: Schema.Array(CrewHandoff),
  revision: Schema.Number,
});
export type CrewSnapshot = typeof CrewSnapshot.Type;
export const CrewConnectInput = Schema.Struct({
  accountScope: Schema.optional(TrimmedNonEmptyString),
});
export type CrewConnectInput = typeof CrewConnectInput.Type;
export const CrewConversationInput = Schema.Struct({
  accountScope: Schema.optional(TrimmedNonEmptyString),
  botId: TrimmedNonEmptyString,
  sessionId: Schema.optional(Schema.String),
  beforeSeq: Schema.optional(Schema.Number),
});
export type CrewConversationInput = typeof CrewConversationInput.Type;
export const CrewConversation = Schema.Struct({
  accountScope: Schema.String,
  botId: Schema.String,
  sessionId: Schema.String,
  entries: Schema.Array(CrewEntry),
  nextBeforeSeq: Schema.NullOr(Schema.Number),
});
export type CrewConversation = typeof CrewConversation.Type;
export const CrewAskInput = Schema.Struct({
  accountScope: TrimmedNonEmptyString,
  botId: TrimmedNonEmptyString,
  sessionId: Schema.optional(Schema.String),
  text: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(32000)),
  nonce: TrimmedNonEmptyString,
  context: Schema.optional(CrewTaskContext),
  automaticDelivery: Schema.optional(Schema.Boolean),
  parentHandoffId: Schema.optional(TrimmedNonEmptyString),
  maxRounds: Schema.optional(
    Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 5 })),
  ),
  contextTokenBudget: Schema.optional(
    Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 256, maximum: 4000 })),
  ),
});
export type CrewAskInput = typeof CrewAskInput.Type;
export const CrewSendInput = Schema.Struct({
  ...CrewAskInput.fields,
  originThreadId: Schema.optional(ThreadId),
});
export type CrewSendInput = typeof CrewSendInput.Type;
export const CrewHandoffInput = Schema.Struct({ handoffId: TrimmedNonEmptyString });
export type CrewHandoffInput = typeof CrewHandoffInput.Type;

export const CrewStopDeliveryInput = Schema.Struct({
  accountScope: TrimmedNonEmptyString,
  handoffId: TrimmedNonEmptyString,
});
export type CrewStopDeliveryInput = typeof CrewStopDeliveryInput.Type;

/** A small invalidation event: clients fetch just the state they currently display. */
export const CrewChange = Schema.Struct({
  revision: Schema.Number,
  botId: Schema.NullOr(Schema.String),
});
export type CrewChange = typeof CrewChange.Type;
