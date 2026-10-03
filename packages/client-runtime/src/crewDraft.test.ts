import { describe, expect, it } from "@effect/vitest";
import {
  AuthOrchestrationOperateScope,
  CrewError,
  EnvironmentAuthorizationError,
  EnvironmentId,
  MessageId,
  ThreadId,
  WsCrewSendRpc,
  type CrewEntry,
  type CrewHandoff,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import {
  canStopCrewDelivery,
  classifyCrewSendFailure,
  crewDraftKey,
  crewDraftPreview,
  crewDraftValidationError,
  crewTaskContextSources,
  updateCrewDraftOptions,
  crewDraftSendInput,
  editCrewDraft,
  formatCrewReplyDraft,
  recoverRejectedCrewDraft,
  setCrewDraftOrigin,
  type CrewDraftScope,
} from "./crewDraft.ts";

const encodeCrewSendError = Schema.encodeSync(WsCrewSendRpc.errorSchema);
const decodeCrewSendError = Schema.decodeUnknownSync(WsCrewSendRpc.errorSchema);

const scope: CrewDraftScope = {
  environmentId: EnvironmentId.make("environment-a"),
  accountScope: "account-a",
  botId: "bot-a",
  sessionId: "session-a",
};
const origin = {
  environmentId: scope.environmentId,
  threadId: ThreadId.make("task-a"),
  title: "Task A",
};

describe("crew drafts", () => {
  it("restores the exact draft after a proven server rejection without generating another nonce", () => {
    const intended = updateCrewDraftOptions(
      editCrewDraft(undefined, "Review this change", origin, () => "nonce-1"),
      {
        context: { goal: "Fix login", evidence: [{ label: "Log", text: "HTTP 401" }] },
        automaticDelivery: true,
        contextTokenBudget: 1000,
      },
      origin,
      () => "unused",
    );
    const attempted = { ...intended, attempted: true };
    for (const code of ["invalid_input", "disconnected", "not_found", "nonce_conflict"] as const) {
      const error = JSON.parse(
        JSON.stringify(new CrewError({ code, message: "Request rejected" })),
      );
      const recovered = recoverRejectedCrewDraft(attempted, "nonce-1", error)!;
      expect(recovered).toEqual(intended);
      expect(crewDraftSendInput(scope, recovered)).toEqual(crewDraftSendInput(scope, intended));
      expect(classifyCrewSendFailure(error)).toEqual({
        disposition: "rejected",
        message: "Request rejected",
      });
      expect(attempted.attempted).toBe(true);
    }
  });

  it("keeps a saved attempt frozen for transport, persistence, malformed and unknown failures", () => {
    const attempted = JSON.parse(
      JSON.stringify({
        ...editCrewDraft(undefined, "Hello", origin, () => "nonce-1"),
        attempted: true,
      }),
    );
    for (const error of [
      new Error("socket closed"),
      ...(["connection", "storage", "forbidden"] as const).map(
        (code) => new CrewError({ code, message: "Request failed" }),
      ),
      { code: "invalid_input", message: "Missing service tag" },
      { _tag: "CrewError", code: "invalid_input", message: null },
      { _tag: "CrewError", code: "future_error", message: "Unknown dispatch boundary" },
      "invalid_input",
      null,
    ]) {
      expect(classifyCrewSendFailure(error).disposition).toBe("uncertain");
      expect(recoverRejectedCrewDraft(attempted, "nonce-1", error)).toBe(attempted);
      expect(crewDraftSendInput(scope, attempted)).toBeNull();
    }
  });

  it("recovers an authorization rejection through the send RPC error contract and rejects lookalikes", () => {
    const intended = updateCrewDraftOptions(
      editCrewDraft(undefined, "Review this change", origin, () => "nonce-1"),
      { context: { goal: "Fix login" }, automaticDelivery: true, contextTokenBudget: 1000 },
      origin,
      () => "unused",
    );
    const attempted = { ...intended, attempted: true };
    const error = new EnvironmentAuthorizationError({
      message: "The authenticated token is missing required scope: orchestration:operate.",
      requiredScope: AuthOrchestrationOperateScope,
    });
    const serialized = JSON.parse(JSON.stringify(encodeCrewSendError(error)));
    const decoded = decodeCrewSendError(serialized);
    for (const failure of [serialized, decoded]) {
      expect(classifyCrewSendFailure(failure)).toEqual({
        disposition: "rejected",
        message: error.message,
      });
      const recovered = recoverRejectedCrewDraft(attempted, intended.nonce, failure)!;
      expect(recovered).toEqual(intended);
      expect(crewDraftSendInput(scope, recovered)).toEqual(crewDraftSendInput(scope, intended));
    }
    for (const failure of [
      { _tag: "EnvironmentAuthorizationError", message: error.message },
      { ...serialized, requiredScope: "unknown:scope" },
      { ...serialized, message: null },
      { ...serialized, _tag: "OtherAuthorizationError" },
    ]) {
      expect(classifyCrewSendFailure(failure).disposition).toBe("uncertain");
      expect(recoverRejectedCrewDraft(attempted, intended.nonce, failure)).toBe(attempted);
    }
  });

  it("does not unlock a different or missing attempt using a stale failure", () => {
    const attempted = {
      ...editCrewDraft(undefined, "Hello", origin, () => "new-nonce"),
      attempted: true,
    };
    const failure = new CrewError({ code: "invalid_input", message: "Rejected old attempt" });
    expect(recoverRejectedCrewDraft(attempted, "old-nonce", failure)).toBe(attempted);
    expect(recoverRejectedCrewDraft(undefined, "old-nonce", failure)).toBeUndefined();
  });

  it("keeps the nonce and original task when editing selected context", () => {
    const first = editCrewDraft(undefined, "Investigate", origin, () => "nonce-1");
    const edited = editCrewDraft(
      first,
      "Investigate these selected logs",
      { ...origin, threadId: ThreadId.make("task-b") },
      () => "nonce-2",
    );
    expect(crewDraftSendInput(scope, edited)).toEqual({
      accountScope: "account-a",
      botId: "bot-a",
      sessionId: "session-a",
      text: "Investigate these selected logs",
      nonce: "nonce-1",
      originThreadId: "task-a",
    });
  });

  it("keeps a persisted ambiguous send immutable and refuses a second attempt", () => {
    const attempted = JSON.parse(
      JSON.stringify({
        ...editCrewDraft(undefined, "Hello", origin, () => "nonce-1"),
        attempted: true,
      }),
    );
    expect(editCrewDraft(attempted, "Hello again", null, () => "nonce-2")).toBe(attempted);
    expect(crewDraftSendInput(scope, attempted)).toBeNull();
  });

  it("isolates drafts between environments, accounts, bots and sessions", () => {
    expect(
      new Set([
        crewDraftKey(scope),
        crewDraftKey({ ...scope, environmentId: EnvironmentId.make("environment-b") }),
        crewDraftKey({ ...scope, accountScope: "account-b" }),
        crewDraftKey({ ...scope, botId: "bot-b" }),
        crewDraftKey({ ...scope, sessionId: "session-b" }),
      ]).size,
    ).toBe(5);
  });

  it("refuses a task handoff to a different environment and empty text", () => {
    const draft = editCrewDraft(undefined, "Hello", origin, () => "nonce-1");
    expect(
      crewDraftSendInput({ ...scope, environmentId: EnvironmentId.make("environment-b") }, draft),
    ).toBeNull();
    expect(crewDraftSendInput(scope, { ...draft, text: " \n " })).toBeNull();
  });

  it("does not attach a task to an ordinary direct message", () => {
    const draft = editCrewDraft(undefined, "Hello", null, () => "nonce-1");
    expect(crewDraftSendInput(scope, draft)).not.toHaveProperty("originThreadId");
  });

  it("unlinks an unsent message without changing its text or nonce", () => {
    const draft = editCrewDraft(undefined, "Review these logs", origin, () => "nonce-1");
    const unlinked = setCrewDraftOrigin(draft, null, () => "nonce-2");
    expect(unlinked).toEqual({ ...draft, origin: null });
    expect(crewDraftSendInput(scope, unlinked)).toEqual({
      accountScope: "account-a",
      botId: "bot-a",
      sessionId: "session-a",
      text: "Review these logs",
      nonce: "nonce-1",
    });
  });

  it("keeps an explicit unlink through reload and later edits with stale ask context", () => {
    const draft = editCrewDraft(undefined, "Review", origin, () => "nonce-1");
    const restored = JSON.parse(JSON.stringify(setCrewDraftOrigin(draft, null, () => "nonce-2")));
    const edited = editCrewDraft(restored, "Review these logs", origin, () => "nonce-3");
    expect(edited.origin).toBeNull();
    expect(edited.nonce).toBe("nonce-1");
    expect(crewDraftSendInput(scope, edited)).not.toHaveProperty("originThreadId");
  });

  it("links an unsent message to the explicitly chosen task", () => {
    const draft = editCrewDraft(undefined, "Review", null, () => "nonce-1");
    const relinked = setCrewDraftOrigin(draft, origin, () => "nonce-2");
    expect(crewDraftSendInput(scope, relinked)?.originThreadId).toBe(origin.threadId);
    expect(relinked.text).toBe(draft.text);
    expect(relinked.nonce).toBe(draft.nonce);
  });

  it("refuses to change the origin of an attempted message", () => {
    const attempted = {
      ...editCrewDraft(undefined, "Review", origin, () => "nonce-1"),
      attempted: true,
    };
    expect(setCrewDraftOrigin(attempted, null, () => "nonce-2")).toBe(attempted);
    expect(
      setCrewDraftOrigin(
        attempted,
        { ...origin, threadId: ThreadId.make("task-b") },
        () => "nonce-2",
      ),
    ).toBe(attempted);
  });

  it("records an unlink before typing so the old task cannot be restored implicitly", () => {
    const empty = setCrewDraftOrigin(undefined, null, () => "nonce-1");
    expect(empty).toEqual({ text: "", origin: null, nonce: "nonce-1", attempted: false });
    expect(crewDraftSendInput(scope, empty)).toBeNull();
    const edited = editCrewDraft(empty, "Hello", origin, () => "nonce-2");
    expect(crewDraftSendInput(scope, edited)).not.toHaveProperty("originThreadId");
    expect(edited.nonce).toBe("nonce-1");
  });
});

describe("crew task context", () => {
  it("keeps context and automatic delivery in the same immutable send intent", () => {
    const draft = editCrewDraft(undefined, "Review this change", origin, () => "nonce-1");
    const withContext = updateCrewDraftOptions(
      draft,
      {
        context: { goal: "Fix login", evidence: [{ label: "Selected log", text: "HTTP 401" }] },
        automaticDelivery: true,
      },
      origin,
      () => "nonce-2",
    );
    expect(crewDraftSendInput(scope, withContext)).toMatchObject({
      nonce: "nonce-1",
      text: "Review this change",
      automaticDelivery: true,
      context: { goal: "Fix login", evidence: [{ label: "Selected log", text: "HTTP 401" }] },
    });
    const attempted = { ...withContext, attempted: true };
    expect(
      updateCrewDraftOptions(
        attempted,
        { context: null, automaticDelivery: false },
        origin,
        () => "nonce-3",
      ),
    ).toBe(attempted);
    expect(crewDraftSendInput(scope, attempted)).toBeNull();
  });

  it("removes old task context and auto return when changing the task, preserving the question", () => {
    const draft = updateCrewDraftOptions(
      editCrewDraft(undefined, "Review", origin, () => "nonce-1"),
      {
        context: { goal: "Private task A" },
        automaticDelivery: true,
      },
      origin,
      () => "nonce-2",
    );
    for (const nextOrigin of [null, { ...origin, threadId: ThreadId.make("task-b") }]) {
      const changed = setCrewDraftOrigin(draft, nextOrigin, () => "nonce-3");
      expect(changed.text).toBe("Review");
      expect(changed.nonce).toBe("nonce-1");
      expect(changed.context).toBeUndefined();
      expect(changed.automaticDelivery).toBeUndefined();
    }
    expect(
      setCrewDraftOrigin(draft, { ...origin, title: "Renamed" }, () => "nonce-3").context,
    ).toEqual(draft.context);
  });

  it("preserves options across edits and context removal without enabling direct automatic delivery", () => {
    const draft = updateCrewDraftOptions(
      undefined,
      { context: { goal: "Goal" }, automaticDelivery: true, contextTokenBudget: 1000 },
      origin,
      () => "nonce-1",
    );
    const edited = updateCrewDraftOptions(
      draft,
      { context: { goal: "New goal" } },
      origin,
      () => "nonce-2",
    );
    expect(edited.automaticDelivery).toBe(true);
    expect(edited.contextTokenBudget).toBe(1000);
    const removed = updateCrewDraftOptions(edited, { context: null }, origin, () => "nonce-2");
    expect(removed.context).toBeUndefined();
    expect(removed.automaticDelivery).toBe(true);
    const direct = updateCrewDraftOptions(
      undefined,
      { automaticDelivery: true },
      null,
      () => "nonce-3",
    );
    expect(direct.automaticDelivery).toBe(false);
  });

  it("previews selected text and rejects an over-budget assembled send before reserving it", () => {
    const draft = updateCrewDraftOptions(
      editCrewDraft(undefined, "Review", origin, () => "nonce-1"),
      {
        context: { evidence: [{ label: "Code", text: "const answer = 42;" }] },
      },
      origin,
      () => "nonce-2",
    );
    expect(crewDraftPreview(draft)).toBe("Review\n\nEvidence — Code:\nconst answer = 42;");
    const huge = updateCrewDraftOptions(
      draft,
      { context: { goal: "x".repeat(8100) } },
      origin,
      () => "nonce-2",
    );
    expect(crewDraftValidationError(huge)).toContain("2,000");
    expect(crewDraftSendInput(scope, huge)).toBeNull();
    expect(
      crewDraftSendInput(
        scope,
        updateCrewDraftOptions(huge, { contextTokenBudget: 4000 }, origin, () => "nonce-2"),
      ),
    ).not.toBeNull();
  });

  it("rejects too many constraint lines without silently dropping them", () => {
    const constraints = Array.from({ length: 21 }, (_, index) => `Constraint ${index + 1}`);
    const draft = updateCrewDraftOptions(
      editCrewDraft(undefined, "Review", origin, () => "nonce-1"),
      { context: { constraints } },
      origin,
      () => "nonce-2",
    );
    expect(draft.context?.constraints).toEqual(constraints);
    expect(crewDraftValidationError(draft)).toContain("20 lines");
    expect(crewDraftSendInput(scope, draft)).toBeNull();
  });

  it("reserves room for reply routing in the automatic send budget", () => {
    const draft = {
      ...editCrewDraft(undefined, "x".repeat(7900), origin, () => "nonce-1"),
      automaticDelivery: true,
    };
    expect(crewDraftValidationError(draft)).toContain("2,000");
    expect(crewDraftValidationError({ ...draft, automaticDelivery: false })).toBeNull();
  });

  it("offers actual bounded excerpts only, excluding streaming, system and attachment content", () => {
    const base = {
      turnId: null,
      streaming: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const sources = crewTaskContextSources({
      messages: [
        { ...base, id: MessageId.make("user-a"), role: "user", text: "Selected question" },
        { ...base, id: MessageId.make("assistant-a"), role: "assistant", text: "x".repeat(3000) },
        {
          ...base,
          id: MessageId.make("stream"),
          role: "assistant",
          streaming: true,
          text: "Unfinished",
        },
        { ...base, id: MessageId.make("system"), role: "system", text: "Internal" },
      ],
      proposedPlans: [],
      checkpoints: [],
    });
    expect(sources).toHaveLength(2);
    expect(sources[0]?.text).toContain("Excerpt truncated");
    expect(sources[0]?.text.length).toBeLessThan(2500);
    expect(sources[1]?.text).toBe("Selected question");
    expect(crewTaskContextSources(null)).toEqual([]);
  });
});

describe("crew automatic delivery controls", () => {
  function receipt(
    status: NonNullable<CrewHandoff["delegation"]>["delivery"]["status"],
  ): CrewHandoff {
    return {
      id: "handoff-1",
      accountScope: scope.accountScope,
      originThreadId: origin.threadId,
      botId: scope.botId,
      sessionId: scope.sessionId,
      nonce: "nonce-1",
      text: "Review",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      acceptance: "accepted",
      echoEntryId: "echo",
      replies: [],
      delegation: {
        replyMarker: "marker",
        correlation: "matched",
        rootHandoffId: "handoff-1",
        parentHandoffId: null,
        round: 1,
        maxRounds: 3,
        delivery: {
          status,
          commandId: "command-1",
          messageId: "message-1",
          text: "Reply",
          entryIds: ["reply-1"],
          error: null,
          updatedAt: "2026-01-01",
        },
      },
    };
  }

  it("keeps stopping available after a reply is reserved or queued for the coding runtime", () => {
    for (const status of ["ready", "claimed", "accepted", "uncertain"] as const) {
      expect(canStopCrewDelivery(receipt(status))).toBe(true);
    }
  });

  it("does not offer to retract an already delivered reply or stop a direct manual message", () => {
    expect(canStopCrewDelivery(receipt("delivered"))).toBe(false);
    expect(canStopCrewDelivery(receipt("stopped"))).toBe(false);
    const { delegation: _delegation, ...manual } = receipt("awaiting_reply");
    expect(canStopCrewDelivery(manual)).toBe(false);
  });
});

describe("crew reply drafts", () => {
  it("preserves provenance and quotes bot content as context for user review", () => {
    const entry: CrewEntry = {
      id: "message-a",
      text: "Found two cases.\nCheck the second.",
      role: "assistant",
      author: "Researcher",
      createdAt: null,
      streaming: false,
      nonce: null,
      unsupportedKind: null,
    };
    expect(formatCrewReplyDraft(scope, "Specialist", entry, "handoff-a")).toBe(
      "Grok Bot reply from Researcher (Specialist)\nSource: account account-a; bot bot-a; session session-a; message message-a; handoff handoff-a\n\n> Found two cases.\n> Check the second.",
    );
  });
});
