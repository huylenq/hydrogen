import {
  CrewError,
  EnvironmentAuthorizationError,
  type CrewEntry,
  type CrewHandoff,
  type CrewSendInput,
  type EnvironmentId,
  type OrchestrationV2ProjectedTurnItem,
  type ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { formatCrewMessage, validateCrewMessage } from "@t3tools/shared/crewContext";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export type CrewDraftContext = NonNullable<CrewSendInput["context"]>;

export interface CrewDraftScope {
  readonly environmentId: EnvironmentId;
  readonly accountScope: string;
  readonly botId: string;
  readonly sessionId: string;
}

export interface CrewDraftOrigin {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly title: string;
}

export interface CrewDraft {
  readonly text: string;
  readonly nonce: string;
  readonly origin: CrewDraftOrigin | null;
  readonly attempted: boolean;
  readonly context?: CrewDraftContext;
  readonly automaticDelivery?: boolean;
  readonly contextTokenBudget?: number;
}

export function crewDraftKey(scope: CrewDraftScope): string {
  return JSON.stringify([scope.environmentId, scope.accountScope, scope.botId, scope.sessionId]);
}

const decodeCrewSendError = Schema.decodeUnknownOption(
  Schema.Union([CrewError, EnvironmentAuthorizationError]),
);

/** Only typed authorization or service rejections prove this attempt did not reach dispatch. */
export function classifyCrewSendFailure(error: unknown): {
  readonly disposition: "rejected" | "uncertain";
  readonly message: string;
} {
  const decoded = decodeCrewSendError(error);
  if (Option.isSome(decoded)) {
    const failure = decoded.value;
    if (failure._tag === "EnvironmentAuthorizationError") {
      return { disposition: "rejected", message: failure.message };
    }
    switch (failure.code) {
      case "invalid_input":
      case "disconnected":
      case "not_found":
      case "nonce_conflict":
        return { disposition: "rejected", message: failure.message };
      default:
        return { disposition: "uncertain", message: failure.message };
    }
  }
  return {
    disposition: "uncertain",
    message: error instanceof Error ? error.message : "The Grok Bot request failed.",
  };
}

/** Preserve the intended payload and nonce; recovery permits editing, never an automatic retry. */
export function recoverRejectedCrewDraft(
  draft: CrewDraft | undefined,
  nonce: string,
  error: unknown,
): CrewDraft | undefined {
  return draft?.attempted &&
    draft.nonce === nonce &&
    classifyCrewSendFailure(error).disposition === "rejected"
    ? { ...draft, attempted: false }
    : draft;
}

/** A submitted draft is immutable, including after a timeout or reload. */
export function editCrewDraft(
  draft: CrewDraft | undefined,
  text: string,
  origin: CrewDraftOrigin | null,
  createNonce: () => string,
): CrewDraft {
  if (draft?.attempted) return draft;
  return draft ? { ...draft, text } : { text, origin, nonce: createNonce(), attempted: false };
}

export function setCrewDraftOrigin(
  draft: CrewDraft | undefined,
  origin: CrewDraftOrigin | null,
  createNonce: () => string,
): CrewDraft {
  if (draft?.attempted) return draft;
  if (!draft) return { text: "", origin, nonce: createNonce(), attempted: false };
  if (
    draft.origin?.threadId === origin?.threadId &&
    draft.origin?.environmentId === origin?.environmentId
  )
    return { ...draft, origin };
  const { context: _context, automaticDelivery: _automaticDelivery, ...rest } = draft;
  return { ...rest, origin };
}

export function crewDraftSendInput(scope: CrewDraftScope, draft: CrewDraft): CrewSendInput | null {
  if (
    draft.attempted ||
    crewDraftValidationError(draft) !== null ||
    draft.text.trim().length === 0 ||
    (draft.origin !== null && draft.origin.environmentId !== scope.environmentId)
  ) {
    return null;
  }
  return {
    accountScope: scope.accountScope,
    botId: scope.botId,
    sessionId: scope.sessionId,
    text: draft.text,
    nonce: draft.nonce,
    ...(draft.origin ? { originThreadId: draft.origin.threadId } : {}),
    ...(draft.context ? { context: draft.context } : {}),
    ...(draft.origin && draft.automaticDelivery ? { automaticDelivery: true } : {}),
    ...(draft.contextTokenBudget ? { contextTokenBudget: draft.contextTokenBudget } : {}),
  };
}

export function formatCrewReplyDraft(
  scope: CrewDraftScope,
  botName: string,
  entry: CrewEntry,
  handoffId?: string,
): string {
  return [
    `Grok Bot reply from ${entry.author || botName} (${botName})`,
    `Source: account ${scope.accountScope}; bot ${scope.botId}; session ${scope.sessionId || "(default)"}; message ${entry.id}${handoffId ? `; handoff ${handoffId}` : ""}`,
    "",
    ...entry.text.split("\n").map((line) => `> ${line}`),
  ].join("\n");
}

/** Context is a snapshot chosen by the user, so later task updates cannot silently alter a send. */
export function updateCrewDraftOptions(
  draft: CrewDraft | undefined,
  options: {
    context?: CrewDraftContext | null;
    automaticDelivery?: boolean;
    contextTokenBudget?: number;
  },
  origin: CrewDraftOrigin | null,
  createNonce: () => string,
): CrewDraft {
  const current = draft ?? editCrewDraft(undefined, "", origin, createNonce);
  if (current.attempted) return current;
  const { context: _context, ...rest } = current;
  const context = options.context === undefined ? current.context : options.context;
  return {
    ...rest,
    ...(context ? { context } : {}),
    ...(options.automaticDelivery !== undefined
      ? { automaticDelivery: !!current.origin && options.automaticDelivery }
      : {}),
    ...(options.contextTokenBudget !== undefined
      ? { contextTokenBudget: options.contextTokenBudget }
      : {}),
  };
}

export function crewDraftPreview(draft: Pick<CrewDraft, "text" | "context">): string {
  return formatCrewMessage({
    text: draft.text,
    ...(draft.context ? { context: draft.context } : {}),
  });
}

export function crewDraftBudgetText(
  draft: Pick<CrewDraft, "text" | "context" | "automaticDelivery">,
): string {
  return formatCrewMessage({
    text: draft.text,
    context: draft.context,
    ...(draft.automaticDelivery
      ? { replyMarker: "[t3-reply:00000000-0000-0000-0000-000000000000]" }
      : {}),
  });
}

export function crewDraftValidationError(draft: CrewDraft): string | null {
  if ((draft.context?.constraints?.length ?? 0) > 20)
    return "Keep constraints to 20 lines or fewer.";
  return validateCrewMessage(crewDraftBudgetText(draft), draft.contextTokenBudget ?? 2000);
}

export interface CrewContextSource {
  readonly id: string;
  readonly label: string;
  readonly text: string;
}

/** The parts of a task Grok Bot may quote, already projected by the client. */
export interface CrewTaskContextThread {
  readonly messages: ReadonlyArray<{
    readonly id: string;
    readonly role: "user" | "assistant" | "system";
    readonly text: string;
    readonly streaming: boolean;
    readonly createdAt: string;
  }>;
  readonly proposedPlans: ReadonlyArray<{
    readonly id: string;
    readonly planMarkdown: string;
    readonly updatedAt: string;
  }>;
  readonly checkpoints: ReadonlyArray<{
    readonly turnId: string;
    readonly files: ReadonlyArray<{
      readonly path: string;
      readonly kind: string;
      readonly additions: number;
      readonly deletions: number;
    }>;
  }>;
}

/** Read the quotable parts of a task from its visible turn items. */
export function crewTaskContextThread(
  items: ReadonlyArray<OrchestrationV2ProjectedTurnItem>,
): CrewTaskContextThread {
  const messages: Array<CrewTaskContextThread["messages"][number]> = [];
  const proposedPlans: Array<CrewTaskContextThread["proposedPlans"][number]> = [];
  for (const { item } of items) {
    const at = DateTime.formatIso(item.startedAt ?? item.updatedAt);
    if (item.type === "user_message" || item.type === "assistant_message") {
      messages.push({
        id: item.messageId,
        role: item.type === "user_message" ? "user" : "assistant",
        text: item.text,
        streaming: item.type === "assistant_message" && item.streaming,
        createdAt: at,
      });
    } else if (item.type === "proposed_plan" && !item.streaming) {
      proposedPlans.push({ id: item.planId, planMarkdown: item.markdown, updatedAt: at });
    }
  }
  return { messages, proposedPlans, checkpoints: [] };
}

/** Offer bounded, explicit selections from the loaded task; never include attachments or tool payloads. */
export function crewTaskContextSources(
  thread: CrewTaskContextThread | null,
): ReadonlyArray<CrewContextSource> {
  if (!thread) return [];
  const excerpt = (text: string) =>
    text.length > 2400
      ? `${text.slice(0, 2400)}\n[Excerpt truncated; select or paste more if needed.]`
      : text;
  const sources: CrewContextSource[] = thread.messages
    .filter((message) => !message.streaming && message.role !== "system" && message.text.trim())
    .slice(-12)
    .toReversed()
    .map((message) => ({
      id: `message:${message.id}`,
      label: `${message.role === "user" ? "User" : "Agent"} message · ${message.createdAt}`,
      text: excerpt(message.text),
    }));
  for (const plan of thread.proposedPlans.slice(-2).toReversed()) {
    sources.push({
      id: `plan:${plan.id}`,
      label: `Proposed plan · ${plan.updatedAt}`,
      text: excerpt(plan.planMarkdown),
    });
  }
  const checkpoint = thread.checkpoints.at(-1);
  if (checkpoint?.files.length) {
    const files = checkpoint.files.slice(0, 30);
    sources.push({
      id: `changes:${checkpoint.turnId}`,
      label: "Latest changed-file summary (no file contents)",
      text: [
        "Changed-file statistics only; file contents and patches are not included.",
        ...files.map((file) => `${file.path}: ${file.kind}, +${file.additions} -${file.deletions}`),
        ...(files.length < checkpoint.files.length
          ? [`${checkpoint.files.length - files.length} more files omitted.`]
          : []),
      ].join("\n"),
    });
  }
  return sources;
}

export function crewHandoffStatus(handoff: CrewHandoff): string {
  const status = handoff.delegation?.delivery.status;
  if (status === "stopped") return "Future delivery stopped";
  if (
    handoff.delegation?.correlation === "needs_attention" ||
    status === "failed" ||
    status === "uncertain"
  )
    return "Needs attention";
  if (status === "delivered") return "Delivered to coding agent";
  if (status === "claimed" || status === "accepted") return "Queued for coding agent";
  if (status === "ready") return "Reply received · queued for coding agent";
  if (handoff.acceptance === "pending") return "Sending…";
  if (handoff.acceptance === "uncertain") return "Delivery unconfirmed";
  if (handoff.acceptance === "rejected") return "Message rejected";
  return handoff.replies.length ? "Reply received" : "Awaiting reply";
}

export function canStopCrewDelivery(handoff: CrewHandoff): boolean {
  const status = handoff.delegation?.delivery.status;
  return status !== undefined && status !== "stopped" && status !== "delivered";
}
