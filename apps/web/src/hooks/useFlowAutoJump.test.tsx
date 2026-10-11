import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  scopeProjectRef,
  scopeThreadRef,
  scopedThreadKey,
} from "@t3tools/client-runtime/environment";
import {
  EnvironmentId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, useLayoutEffect } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const data = vi.hoisted(() => ({
  threads: [] as EnvironmentThreadShell[],
  listeners: new Set<() => void>(),
}));
vi.mock("../state/entities", () => ({ readThreadShells: () => data.threads }));
vi.mock("../state/presentation", () => ({
  environmentPresentations: { presentationsAtom: "presentations" },
}));
vi.mock("../state/threads", () => ({ environmentThreadDetails: { threadAtom: () => "detail" } }));
vi.mock("../rpc/atomRegistry", () => ({
  appAtomRegistry: {
    get: (atom: unknown) =>
      atom === "presentations"
        ? new Map([["env", { connection: { phase: "connected" } }]])
        : { projection: { runtimeRequests: [], turnItems: [] } },
    subscribe: (_atom: unknown, listener: () => void) => {
      const notify = () => listener();
      data.listeners.add(notify);
      return () => data.listeners.delete(notify);
    },
  },
}));
vi.mock("../components/ui/toast", () => ({
  stackedThreadToast: (value: unknown) => value,
  toastManager: { add: vi.fn() },
}));

import { useHuyActionLifecycle } from "../customizations/huy/useHuyActionLifecycle";
import { useFlowAutoJump, useFlowJumpCancellation } from "./useFlowAutoJump";
import { DraftId, useComposerDraftStore } from "../composerDraftStore";
import { useFlowStore } from "../flowStore";
import { useModalKeyboardStore } from "../modalKeyboardStore";

const source = scopeThreadRef(EnvironmentId.make("env"), ThreadId.make("source"));
let prepare: ReturnType<typeof useFlowAutoJump>;
let lifecycle: ReturnType<typeof useHuyActionLifecycle>;
let renderer: ReactTestRenderer | undefined;

function Probe() {
  const nextLifecycle = useHuyActionLifecycle();
  useFlowJumpCancellation();
  useLayoutEffect(() => {
    lifecycle = nextLifecycle;
    prepare = (threadRef, excludedThreadKeys, deliveryThreadRef) => {
      const completion = nextLifecycle.prepare({
        threadRef,
        excludedThreadKeys,
        ...(deliveryThreadRef ? { deliveryThreadRef } : {}),
      });
      return completion.ownsNavigation ? completion.succeeded : null;
    };
  }, [nextLifecycle]);
  return null;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("self", {});
  vi.stubGlobal("document", new EventTarget());
  data.listeners.clear();
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
  });
  useFlowStore.getState().setOpen(true);
  useModalKeyboardStore.setState(useModalKeyboardStore.getInitialState(), true);
  const instanceId = ProviderInstanceId.make("codex");
  const nextId = ThreadId.make("next");
  data.threads = [
    {
      environmentId: source.environmentId,
      id: nextId,
      projectId: ProjectId.make("p"),
      title: "Next",
      providerInstanceId: instanceId,
      modelSelection: { instanceId, model: "test" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      lineage: { relationshipToParent: null, parentThreadId: null, rootThreadId: nextId },
      forkedFrom: null,
      activeProviderThreadId: null,
      latestRun: null,
      runtime: null,
      latestUserMessageAt: null,
      hasPendingApprovals: false,
      hasPendingUserInput: false,
      hasActionableProposedPlan: false,
      pendingBackgroundTasks: [],
      providerInstanceHistory: [instanceId],
      goal: null,
      itemCount: 0,
      visibleItemCount: 0,
      createdAt: "2026-09-09T00:00:00.000Z",
      updatedAt: "2026-09-09T00:00:00.000Z",
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      unsettledAt: null,
      snoozedUntil: null,
      snoozedAt: null,
      pinnedAt: null,
      pinOrderKey: null,
      activeOrderKey: null,
      pullRequests: [],
      deletedAt: null,
      source: {} as EnvironmentThreadShell["source"],
    },
  ];
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(initialEntry = "/env/source") {
  const root = createRootRoute({ component: Probe });
  const thread = createRoute({ getParentRoute: () => root, path: "/$environmentId/$threadId" });
  const draft = createRoute({ getParentRoute: () => root, path: "/draft/$draftId" });
  const settings = createRoute({ getParentRoute: () => root, path: "/settings/general" });
  const router = createRouter({
    isServer: true,
    routeTree: root.addChildren([thread, draft, settings]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
  await router.load();
  await act(() => {
    renderer = create(<RouterProvider router={router} />);
  });
  return router;
}

describe("flow navigation integration", () => {
  it("leaves normal action navigation available when Flow is disabled", async () => {
    useFlowStore.getState().setOpen(false);
    const router = await mount();
    const completion = lifecycle.prepare({ threadRef: source });
    expect(completion.ownsNavigation).toBe(false);
    await act(() => completion.succeeded());
    expect(router.state.location.pathname).toBe("/env/source");
  });

  it("does not navigate before an action succeeds", async () => {
    const router = await mount();
    const navigate = vi.spyOn(router, "navigate");
    const completion = lifecycle.prepare({ threadRef: source });
    expect(completion.ownsNavigation).toBe(true);
    expect(router.state.location.pathname).toBe("/env/source");
    expect(navigate).not.toHaveBeenCalled();
    await act(async () => {
      completion.succeeded();
      completion.succeeded();
      await navigate.mock.results.at(-1)?.value;
    });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe("/env/next");
  });

  it("background sends leave navigation with the user even after success", async () => {
    const router = await mount();
    const navigate = vi.spyOn(router, "navigate");
    const completion = lifecycle.prepare({ threadRef: source, navigation: "background" });
    expect(completion.ownsNavigation).toBe(false);
    await act(() => completion.succeeded());
    expect(navigate).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/env/source");
  });

  it("failed actions never leave the source thread", async () => {
    const router = await mount();
    const navigate = vi.spyOn(router, "navigate");
    lifecycle.prepare({ threadRef: source });
    await act(() => {
      data.listeners.forEach((notify) => notify());
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/env/source");
  });

  it("coalesces concurrent completions into one navigation", async () => {
    const router = await mount();
    const first = prepare(source);
    const second = prepare(source);
    const navigate = vi.spyOn(router, "navigate");
    await act(async () => {
      first?.();
      second?.();
      await navigate.mock.results.at(-1)?.value;
    });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(router.history.length).toBe(2);
  });

  it("pushes the next thread with conversation focus state and preserves Back", async () => {
    const router = await mount();
    const navigate = vi.spyOn(router, "navigate");
    const finish = prepare(source);
    await act(async () => {
      finish?.();
      await navigate.mock.results.at(-1)?.value;
    });
    expect(router.state.location.pathname).toBe("/env/next");
    expect(router.state.location.state.flowAutoJump).toBe(true);
    expect(router.history.length).toBe(2);
    await act(async () => {
      router.history.back();
      await router.load();
    });
    expect(router.state.location.pathname).toBe("/env/source");
  });

  it("pins a session opened outside the queue so Flow does not yank it back", async () => {
    const router = await mount();
    await act(async () => {
      await router.navigate({
        to: "/$environmentId/$threadId",
        params: { environmentId: "env", threadId: "other" },
      });
    });
    expect(useFlowStore.getState().inspectedThreadKey).toBe(
      scopedThreadKey(scopeThreadRef(EnvironmentId.make("env"), ThreadId.make("other"))),
    );
  });

  it("pins a queued destination before the route changes so the overview cannot steal it", async () => {
    const router = await mount();
    await act(async () => {
      await router.navigate({
        to: "/$environmentId/$threadId",
        params: { environmentId: "env", threadId: "next" },
      });
    });
    expect(useFlowStore.getState().inspectedThreadKey).toBe(
      scopedThreadKey(scopeThreadRef(EnvironmentId.make("env"), ThreadId.make("next"))),
    );
  });

  it("does not treat a settings path as a pinned thread", async () => {
    const router = await mount();
    const other = scopedThreadKey(
      scopeThreadRef(EnvironmentId.make("env"), ThreadId.make("other")),
    );
    useFlowStore.getState().inspectSession(other);
    await act(async () => {
      await router.navigate({ to: "/settings/general" });
    });
    expect(useFlowStore.getState().inspectedThreadKey).toBe(other);
  });

  it("unpins after autojumping onto a queued session", async () => {
    const router = await mount();
    useFlowStore.getState().inspectSession("env:source");
    const finish = prepare(source);
    const navigate = vi.spyOn(router, "navigate");
    await act(async () => {
      finish?.();
      await navigate.mock.results.at(-1)?.value;
    });
    expect(router.state.location.pathname).toBe("/env/next");
    expect(useFlowStore.getState().inspectedThreadKey).toBeNull();
  });

  it("a manual round trip cancels the original action even when Back restores its history key", async () => {
    const router = await mount();
    const finish = prepare(source);
    await act(async () => {
      await router.navigate({
        to: "/$environmentId/$threadId",
        params: { environmentId: "env", threadId: "other" },
      });
    });
    await act(async () => {
      router.history.back();
      await router.load();
    });
    const navigate = vi.spyOn(router, "navigate");
    finish?.();
    expect(navigate).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/env/source");
  });

  it("typing cancels a pending send without changing the route", async () => {
    const router = await mount();
    const finish = prepare(source);
    document.dispatchEvent(new Event("beforeinput"));
    const navigate = vi.spyOn(router, "navigate");
    finish?.();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("jumps to the leftmost waiting card after an accepted send", async () => {
    const router = await mount();
    const next = data.threads[0]!;
    data.threads = [
      { ...next, id: source.threadId, updatedAt: "2026-09-09T02:00:00.000Z" },
      { ...next, id: ThreadId.make("later"), updatedAt: "2026-09-09T01:00:00.000Z" },
      next,
    ];
    useComposerDraftStore.getState().setPrompt(source, "send this");
    const finish = prepare(source);
    const navigate = vi.spyOn(router, "navigate");
    expect(navigate).not.toHaveBeenCalled();
    useComposerDraftStore.getState().setPrompt(source, "");
    await act(async () => {
      finish?.({ kind: "turn", messageId: MessageId.make("sent") });
      await navigate.mock.results.at(-1)?.value;
    });
    expect(router.state.location.pathname).toBe("/env/next");
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(data.listeners.size).toBe(0);
  });

  it("returns an inspected session to the working grid after a successful send empties the queue", async () => {
    const router = await mount();
    const sourceShell = data.threads[0]!;
    data.threads = [
      {
        ...sourceShell,
        id: source.threadId,
        runtime: {
          status: "running",
          activeRunId: null,
          providerInstanceId: sourceShell.providerInstanceId,
          providerName: "Codex",
          lastError: null,
          updatedAt: "2026-09-09T00:00:00.000Z",
        },
      },
    ];
    useFlowStore.getState().inspectSession(scopedThreadKey(source));
    const finish = prepare(source);
    const navigate = vi.spyOn(router, "navigate");

    await act(() => finish?.({ kind: "turn", messageId: MessageId.make("sent") }));

    expect(navigate).not.toHaveBeenCalled();
    expect(useFlowStore.getState().inspectedThreadKey).toBeNull();
    expect(useModalKeyboardStore.getState().focusRequest).toBe("conversation");
    expect(data.listeners.size).toBe(0);
  });

  it("ignores send clearing and edits to a different thread", async () => {
    const router = await mount();
    useComposerDraftStore.getState().setPrompt(source, "send this");
    const finish = prepare(source);
    useComposerDraftStore.getState().setPrompt(source, "");
    useComposerDraftStore
      .getState()
      .setPrompt(scopeThreadRef(source.environmentId, ThreadId.make("other")), "background draft");
    const navigate = vi.spyOn(router, "navigate");
    await act(async () => {
      finish?.();
      await navigate.mock.results.at(-1)?.value;
    });
    expect(router.state.location.pathname).toBe("/env/next");
  });

  it("upload bookkeeping preserves a pending jump while adding an attachment cancels it", async () => {
    const router = await mount();
    const store = useComposerDraftStore.getState();
    const file = {
      type: "file" as const,
      id: "file",
      name: "file.txt",
      mimeType: "text/plain",
      sizeBytes: 4,
      file: null,
    };
    store.addFiles(source, [file]);
    const first = prepare(source);
    const revision = useFlowStore.getState().interactionRevision;
    store.setFileUpload(source, file.id, source.environmentId, "uploaded");
    expect(useFlowStore.getState().interactionRevision).toBe(revision);
    store.addFiles(source, [{ ...file, id: "new-file", name: "another.txt" }]);
    const navigate = vi.spyOn(router, "navigate");
    first?.();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("allows the sending draft's own promotion before advancing", async () => {
    useComposerDraftStore
      .getState()
      .setProjectDraftThreadId(
        scopeProjectRef(source.environmentId, ProjectId.make("p")),
        DraftId.make("draft-1"),
        { threadId: source.threadId },
      );
    const router = await mount("/draft/draft-1");
    const finish = prepare(source);
    const promotionSource = router.state.location.state.__TSR_key;
    expect(promotionSource).toBeDefined();
    await act(async () => {
      await router.navigate({
        to: "/$environmentId/$threadId",
        params: { environmentId: "env", threadId: "source" },
        replace: true,
        state: promotionSource ? { flowPromotionSource: promotionSource } : {},
      });
    });
    const navigate = vi.spyOn(router, "navigate");
    await act(async () => {
      finish?.();
      await navigate.mock.results.at(-1)?.value;
    });
    expect(router.state.location.pathname).toBe("/env/next");
    expect(router.history.length).toBe(2);
  });
});
