import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { CrewError, EnvironmentId, ThreadId } from "@t3tools/contracts";
import {
  crewDraftKey,
  crewDraftSendInput,
  type CrewDraftScope,
} from "@t3tools/client-runtime/crew-draft";

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

let useCrewStore: typeof import("./crewStore").useCrewStore;

describe("crew draft task links", () => {
  beforeEach(async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    vi.resetModules();
    ({ useCrewStore } = await import("./crewStore"));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("opens only the rail and preserves a pending draft when hiding or collapsing chat", () => {
    const store = useCrewStore.getState();
    store.toggle();
    expect(useCrewStore.getState()).toMatchObject({ open: true, chatOpen: false, askOrigin: null });
    store.askFrom(origin);
    store.editDraft(scope, "Review these logs");
    store.updateDraftOptions(scope, {
      context: { goal: "Find the failure" },
      automaticDelivery: true,
    });
    store.markAttempted(scope);
    const draft = useCrewStore.getState().drafts[crewDraftKey(scope)];
    store.selectBot(scope.environmentId, scope.accountScope, scope.botId);
    expect(useCrewStore.getState().chatOpen).toBe(true);
    store.collapseChat();
    expect(useCrewStore.getState()).toMatchObject({ open: true, chatOpen: false });
    store.selectBot(scope.environmentId, scope.accountScope, scope.botId);
    store.toggle();
    expect(useCrewStore.getState()).toMatchObject({ open: false, chatOpen: false });
    store.toggle();
    expect(useCrewStore.getState()).toMatchObject({
      open: true,
      chatOpen: false,
      askOrigin: origin,
    });
    expect(useCrewStore.getState().drafts[crewDraftKey(scope)]).toBe(draft);
    expect(crewDraftSendInput(scope, draft!)).toBeNull();
  });

  it("remembers bot selection per account and environment without reopening chat on reload", async () => {
    const { crewBotSelectionKey } = await import("./crewStore");
    const otherEnvironment = EnvironmentId.make("environment-b");
    const store = useCrewStore.getState();
    store.selectBot(scope.environmentId, "account-a", "bot-a");
    store.selectBot(scope.environmentId, "account-b", "bot-b");
    store.selectBot(otherEnvironment, "account-a", "bot-c");
    vi.resetModules();
    ({ useCrewStore } = await import("./crewStore"));
    expect(useCrewStore.getState()).toMatchObject({ open: false, chatOpen: false });
    expect(useCrewStore.getState().selectedBotByAccount).toEqual({
      [crewBotSelectionKey(scope.environmentId, "account-a")]: "bot-a",
      [crewBotSelectionKey(scope.environmentId, "account-b")]: "bot-b",
      [crewBotSelectionKey(otherEnvironment, "account-a")]: "bot-c",
    });
  });

  it("retains existing persisted drafts without adopting an accountless legacy bot selection", async () => {
    const store = useCrewStore.getState();
    store.askFrom(origin);
    store.editDraft(scope, "Saved before the avatar rail");
    store.markAttempted(scope);
    const drafts = useCrewStore.getState().drafts;
    localStorage.setItem(
      "t3code:crew-drafts:v1",
      JSON.stringify({
        state: { drafts, selectedBotByEnvironment: { [scope.environmentId]: "legacy-bot" } },
        version: 0,
      }),
    );
    vi.resetModules();
    ({ useCrewStore } = await import("./crewStore"));
    expect(useCrewStore.getState().drafts).toEqual(drafts);
    expect(useCrewStore.getState().selectedBotByAccount).toEqual({});
    expect(useCrewStore.getState().chatOpen).toBe(false);
  });

  it("preserves a persisted unlink despite subsequent ask intent and text edits", async () => {
    const store = useCrewStore.getState();
    store.askFrom(origin);
    store.editDraft(scope, "Review these logs");
    const original = useCrewStore.getState().drafts[crewDraftKey(scope)]!;
    store.unlinkDraft(scope);
    expect(useCrewStore.getState().askOrigin).toBeNull();

    vi.resetModules();
    ({ useCrewStore } = await import("./crewStore"));
    const restoredStore = useCrewStore.getState();
    expect(restoredStore.drafts[crewDraftKey(scope)]).toEqual({ ...original, origin: null });
    restoredStore.askFrom(origin);
    restoredStore.editDraft(scope, "Review these logs carefully");
    const edited = useCrewStore.getState().drafts[crewDraftKey(scope)]!;
    expect(edited.nonce).toBe(original.nonce);
    expect(crewDraftSendInput(scope, edited)).not.toHaveProperty("originThreadId");
  });

  it("unlinks only the selected environment, account, bot and session draft", () => {
    const otherScopes = [
      { ...scope, environmentId: EnvironmentId.make("environment-b") },
      { ...scope, accountScope: "account-b" },
      { ...scope, botId: "bot-b" },
      { ...scope, sessionId: "session-b" },
    ];
    const store = useCrewStore.getState();
    for (const draftScope of [scope, ...otherScopes]) {
      store.linkDraft(draftScope, { ...origin, environmentId: draftScope.environmentId });
      store.editDraft(draftScope, "Review");
    }
    const before = useCrewStore.getState().drafts;
    store.unlinkDraft(scope);
    const after = useCrewStore.getState().drafts;
    expect(after[crewDraftKey(scope)]?.origin).toBeNull();
    for (const otherScope of otherScopes) {
      expect(after[crewDraftKey(otherScope)]).toBe(before[crewDraftKey(otherScope)]);
    }
  });

  it("preserves pending ask intent in another environment", () => {
    const otherOrigin = { ...origin, environmentId: EnvironmentId.make("environment-b") };
    const store = useCrewStore.getState();
    store.askFrom(otherOrigin);
    store.unlinkDraft(scope);
    expect(useCrewStore.getState().askOrigin).toEqual(otherOrigin);
    const otherScope = { ...scope, environmentId: otherOrigin.environmentId };
    store.editDraft(otherScope, "Review");
    expect(useCrewStore.getState().drafts[crewDraftKey(otherScope)]?.origin).toEqual(otherOrigin);
  });

  it("supports unlinking before typing and explicitly linking that draft again", () => {
    const store = useCrewStore.getState();
    store.askFrom(origin);
    store.unlinkDraft(scope);
    const empty = useCrewStore.getState().drafts[crewDraftKey(scope)]!;
    expect(empty.origin).toBeNull();
    store.editDraft(scope, "Review");
    expect(useCrewStore.getState().drafts[crewDraftKey(scope)]?.origin).toBeNull();
    store.linkDraft(scope, origin);
    const linked = useCrewStore.getState().drafts[crewDraftKey(scope)]!;
    expect(crewDraftSendInput(scope, linked)?.originThreadId).toBe(origin.threadId);
    expect(linked.nonce).toBe(empty.nonce);
  });

  it("does not modify an attempted draft or implicitly create a replacement", () => {
    const store = useCrewStore.getState();
    store.askFrom(origin);
    store.editDraft(scope, "Review");
    store.markAttempted(scope);
    const attempted = useCrewStore.getState().drafts[crewDraftKey(scope)];
    store.unlinkDraft(scope);
    store.linkDraft(scope, { ...origin, threadId: ThreadId.make("task-b") });
    expect(useCrewStore.getState().drafts[crewDraftKey(scope)]).toBe(attempted);
    expect(useCrewStore.getState().askOrigin).toEqual(origin);
  });

  it("refuses to link a task from another environment", () => {
    useCrewStore.getState().linkDraft(scope, {
      ...origin,
      environmentId: EnvironmentId.make("environment-b"),
    });
    expect(useCrewStore.getState().drafts[crewDraftKey(scope)]).toBeUndefined();
  });

  it("persists a rejected attempt as the same editable draft without affecting another scope", async () => {
    const store = useCrewStore.getState();
    store.askFrom(origin);
    store.editDraft(scope, "Review these logs");
    store.updateDraftOptions(scope, {
      context: { goal: "Fix login" },
      automaticDelivery: true,
      contextTokenBudget: 1000,
    });
    const intended = useCrewStore.getState().drafts[crewDraftKey(scope)]!;
    const otherScope = { ...scope, botId: "other-bot" };
    store.editDraft(otherScope, "Another question");
    store.markAttempted(otherScope);
    const otherAttempt = useCrewStore.getState().drafts[crewDraftKey(otherScope)];
    store.markAttempted(scope);
    store.recoverRejectedDraft(
      scope,
      intended.nonce,
      new CrewError({ code: "invalid_input", message: "Another automatic request is pending" }),
    );
    expect(useCrewStore.getState().drafts[crewDraftKey(scope)]).toEqual(intended);
    expect(useCrewStore.getState().drafts[crewDraftKey(otherScope)]).toBe(otherAttempt);

    vi.resetModules();
    ({ useCrewStore } = await import("./crewStore"));
    const restored = useCrewStore.getState().drafts[crewDraftKey(scope)]!;
    expect(restored).toEqual(intended);
    expect(crewDraftSendInput(scope, restored)?.nonce).toBe(intended.nonce);
    useCrewStore.getState().unlinkDraft(scope);
    expect(useCrewStore.getState().drafts[crewDraftKey(scope)]?.origin).toBeNull();
  });

  it("keeps an uncertain draft locked after reload and ignores a stale rejected nonce", async () => {
    const store = useCrewStore.getState();
    store.editDraft(scope, "Review these logs");
    store.markAttempted(scope);
    const attempted = useCrewStore.getState().drafts[crewDraftKey(scope)]!;
    store.recoverRejectedDraft(scope, attempted.nonce, new Error("socket closed"));
    store.recoverRejectedDraft(
      scope,
      "another-nonce",
      new CrewError({ code: "invalid_input", message: "Old request rejected" }),
    );
    vi.resetModules();
    ({ useCrewStore } = await import("./crewStore"));
    const restored = useCrewStore.getState().drafts[crewDraftKey(scope)]!;
    expect(restored).toEqual(attempted);
    expect(crewDraftSendInput(scope, restored)).toBeNull();
    useCrewStore.getState().editDraft(scope, "Changed message");
    expect(useCrewStore.getState().drafts[crewDraftKey(scope)]).toBe(restored);
  });

  it("persists selected context, delivery preference and budget only for its exact draft scope", async () => {
    const store = useCrewStore.getState();
    store.askFrom(origin);
    store.editDraft(scope, "Review");
    store.updateDraftOptions(scope, {
      context: { goal: "Goal", evidence: [{ label: "Log", text: "ERROR 401" }] },
      automaticDelivery: true,
      contextTokenBudget: 1000,
    });
    const saved = useCrewStore.getState().drafts[crewDraftKey(scope)]!;
    store.editDraft({ ...scope, botId: "other-bot" }, "Another question");
    vi.resetModules();
    ({ useCrewStore } = await import("./crewStore"));
    expect(useCrewStore.getState().drafts[crewDraftKey(scope)]).toEqual(saved);
    expect(
      useCrewStore.getState().drafts[crewDraftKey({ ...scope, botId: "other-bot" })]?.context,
    ).toBeUndefined();
    useCrewStore.getState().markAttempted(scope);
    const attempted = useCrewStore.getState().drafts[crewDraftKey(scope)];
    useCrewStore.getState().updateDraftOptions(scope, { context: null, automaticDelivery: false });
    expect(useCrewStore.getState().drafts[crewDraftKey(scope)]).toBe(attempted);
  });
});
