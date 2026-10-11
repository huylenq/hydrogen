import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { EnvironmentId, ProjectId, ProviderInstanceId, RunId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  deriveFlow,
  flowAttentionTarget,
  isFlowSessionInspection,
  flowNavigationEntries,
  flowNavigationTarget,
  isFlowAttentionSession,
  isFlowOverviewAvailable,
  nextFlowThread,
  shouldReleaseFlowInspection,
} from "./Flow.logic";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";

const ENVIRONMENT_ID = EnvironmentId.make("environment-1");
const PROJECT_ID = ProjectId.make("project-1");

function thread(
  id: string,
  overrides: Partial<EnvironmentThreadShell> = {},
): EnvironmentThreadShell {
  const threadId = ThreadId.make(id);
  const instanceId = ProviderInstanceId.make("codex");
  return {
    environmentId: ENVIRONMENT_ID,
    id: threadId,
    projectId: PROJECT_ID,
    title: id,
    providerInstanceId: instanceId,
    modelSelection: { instanceId, model: "gpt-5.6" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    lineage: { relationshipToParent: null, parentThreadId: null, rootThreadId: threadId },
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
    createdAt: "2026-09-04T08:00:00.000Z",
    updatedAt: "2026-09-04T08:00:00.000Z",
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
    ...overrides,
  };
}

function runtime(
  status: NonNullable<EnvironmentThreadShell["runtime"]>["status"],
  updatedAt = "2026-09-04T11:00:00.000Z",
): Pick<EnvironmentThreadShell, "runtime"> {
  return {
    runtime: {
      status,
      activeRunId: null,
      providerInstanceId: ProviderInstanceId.make("codex"),
      providerName: "Codex",
      lastError: status === "failed" ? "boom" : null,
      updatedAt,
    },
  };
}

const working = runtime("running");
const monitoring: Pick<EnvironmentThreadShell, "pendingBackgroundTasks"> = {
  pendingBackgroundTasks: [{ taskId: "bg-1", description: "watch build", kind: "command" }],
};

const NOW = "2026-09-04T12:00:00.000Z";

describe("nextFlowThread", () => {
  const key = (id: string) => scopedThreadKey(scopeThreadRef(ENVIRONMENT_ID, ThreadId.make(id)));
  const connected = new Set([ENVIRONMENT_ID]);

  it("picks the oldest waiting thread, not the next card after the current one", () => {
    const model = deriveFlow(
      [
        thread("current", { updatedAt: "2026-09-04T10:00:00.000Z" }),
        thread("oldest", { updatedAt: "2026-09-04T08:00:00.000Z" }),
        thread("approval", { hasPendingApprovals: true, updatedAt: "2026-09-04T11:00:00.000Z" }),
      ],
      { now: NOW },
    );
    expect(nextFlowThread(model, key("current"), connected)?.id).toBe("oldest");
  });

  it("skips parked, archived, working, and co-parking threads", () => {
    const model = deriveFlow(
      [
        thread("current"),
        thread("settled", { settledOverride: "settled" }),
        thread("archived", { archivedAt: NOW }),
        thread("snoozed", { snoozedAt: NOW, snoozedUntil: "2026-09-05T12:00:00.000Z" }),
        thread("working", working),
        thread("batch"),
        thread("remaining"),
      ],
      { now: NOW },
    );
    expect(nextFlowThread(model, key("current"), connected, new Set([key("batch")]))?.id).toBe(
      "remaining",
    );
  });

  it("distinguishes identical thread IDs in different environments and skips disconnected ones", () => {
    const remote = EnvironmentId.make("remote");
    const model = deriveFlow([thread("same"), thread("same", { environmentId: remote })], {
      now: NOW,
    });
    expect(nextFlowThread(model, key("same"), connected)).toBeNull();
    expect(
      nextFlowThread(model, key("same"), new Set([ENVIRONMENT_ID, remote]))?.environmentId,
    ).toBe(remote);
  });

  it("stays when only the current thread or bench remains", () => {
    const model = deriveFlow([thread("current"), thread("bench", monitoring)], { now: NOW });
    expect(nextFlowThread(model, key("current"), connected)).toBeNull();
    expect(nextFlowThread(model, null, connected)).toBeNull();
  });
});

describe("deriveFlow", () => {
  it("orders attention threads from oldest to newest", () => {
    const model = deriveFlow(
      [
        thread("newer", { updatedAt: "2026-09-04T11:00:00.000Z" }),
        thread("older", { updatedAt: "2026-09-04T09:00:00.000Z" }),
      ],
      { now: NOW },
    );

    expect(model.attention.map((entry) => entry.thread.id)).toEqual(["older", "newer"]);
    expect(model.attention.map((entry) => entry.status)).toEqual(["Review", "Review"]);
  });

  it("moves running and monitoring threads onto the bench", () => {
    const running = thread("running", {
      createdAt: "2026-09-04T09:00:00.000Z",
      ...runtime("running", "2026-09-04T11:30:00.000Z"),
    });
    const monitored = thread("monitoring", monitoring);

    const model = deriveFlow([monitored, running], { now: NOW });

    expect(model.attention).toHaveLength(0);
    expect(model.bench.map((entry) => entry.status)).toEqual(["Working", "Monitoring"]);
  });

  it("keeps working-session positions stable as activity timestamps change", () => {
    const older = thread("older", {
      createdAt: "2026-09-04T08:00:00.000Z",
      ...runtime("running", "2026-09-04T11:30:00.000Z"),
    });
    const newer = thread("newer", {
      createdAt: "2026-09-04T09:00:00.000Z",
      ...runtime("running", "2026-09-04T11:00:00.000Z"),
    });

    const initial = deriveFlow([older, newer], { now: NOW });
    const updated = deriveFlow(
      [
        { ...newer, runtime: { ...newer.runtime!, updatedAt: "2026-09-04T12:00:00.000Z" } },
        { ...older, runtime: { ...older.runtime!, updatedAt: "2026-09-04T12:30:00.000Z" } },
      ],
      { now: NOW },
    );

    expect(initial.bench.map((entry) => entry.thread.id)).toEqual(["newer", "older"]);
    expect(updated.bench.map((entry) => entry.thread.id)).toEqual(["newer", "older"]);
  });

  it("keeps approvals on the attention conveyor even while the session runs", () => {
    const approval = thread("approval", {
      hasPendingApprovals: true,
      ...runtime("running"),
    });

    const model = deriveFlow([approval], { now: NOW });

    expect(model.attention[0]?.status).toBe("Approval");
    expect(model.bench).toHaveLength(0);
  });

  it("shows failed sessions instead of stale background work", () => {
    const failed = thread("failed", {
      ...monitoring,
      ...runtime("failed"),
      latestRun: {
        runId: RunId.make("run-failed"),
        status: "failed",
        requestedAt: "2026-09-04T10:59:00.000Z",
        startedAt: "2026-09-04T10:59:00.000Z",
        completedAt: "2026-09-04T11:00:00.000Z",
        assistantMessageId: null,
      },
    });

    const model = deriveFlow([failed], { now: NOW });

    expect(model.attention[0]?.status).toBe("Failed");
    expect(model.bench).toHaveLength(0);
  });

  it("omits archived, settled, and still-snoozed threads from the conveyor", () => {
    const model = deriveFlow(
      [
        thread("archived", { archivedAt: "2026-09-04T09:00:00.000Z" }),
        thread("settled", { settledOverride: "settled" }),
        thread("snoozed", {
          snoozedAt: "2026-09-04T10:00:00.000Z",
          snoozedUntil: "2026-09-04T13:00:00.000Z",
        }),
      ],
      { now: NOW },
    );

    expect(model.attention).toEqual([]);
    expect(model.bench).toEqual([]);
    expect(model.snoozed.map((shell) => shell.id)).toEqual(["snoozed"]);
  });

  it("lists snoozed threads soonest wake first, running or not", () => {
    const model = deriveFlow(
      [
        thread("later", { snoozedAt: NOW, snoozedUntil: "2026-09-05T12:00:00.000Z" }),
        thread("sooner", {
          snoozedAt: NOW,
          snoozedUntil: "2026-09-04T13:00:00.000Z",
          ...runtime("running"),
        }),
        thread("woken", { snoozedAt: NOW, snoozedUntil: "2026-09-04T09:00:00.000Z" }),
        thread("archived", {
          archivedAt: NOW,
          snoozedAt: NOW,
          snoozedUntil: "2026-09-05T12:00:00.000Z",
        }),
      ],
      { now: NOW },
    );

    expect(model.snoozed.map((shell) => shell.id)).toEqual(["sooner", "later"]);
    expect(model.bench).toHaveLength(0);
  });

  it("omits subagent threads, which have no run of their own", () => {
    const parent = thread("parent", runtime("running"));
    const subagent = thread("subagent", {
      lineage: {
        relationshipToParent: "subagent",
        parentThreadId: parent.id,
        rootThreadId: parent.id,
      },
    });

    const model = deriveFlow([parent, subagent], { now: NOW });

    expect(model.attention).toHaveLength(0);
    expect(model.bench.map((entry) => entry.thread.id)).toEqual(["parent"]);
  });
});

describe("flowNavigationEntries", () => {
  it("keeps attention cards before working-session items", () => {
    const model = deriveFlow([thread("attention"), thread("working", working)], { now: NOW });

    expect(flowNavigationEntries(model).map((entry) => entry.thread.id)).toEqual([
      "attention",
      "working",
    ]);
  });

  it("allows bracket navigation to enter and move through working sessions", () => {
    const model = deriveFlow(
      [
        thread("attention"),
        thread("working", {
          ...working,
          createdAt: "2026-09-04T10:00:00.000Z",
          updatedAt: "2026-09-04T11:00:00.000Z",
        }),
        thread("monitoring", {
          ...monitoring,
          createdAt: "2026-09-04T09:00:00.000Z",
          updatedAt: "2026-09-04T10:00:00.000Z",
        }),
      ],
      { now: NOW },
    );

    expect(flowNavigationTarget(model, keyFor("attention"), "next")?.id).toBe("working");
    expect(flowNavigationTarget(model, keyFor("working"), "next")?.id).toBe("monitoring");
    expect(flowNavigationTarget(model, keyFor("working"), "previous")?.id).toBe("attention");
  });

  it("re-enters the queue from a session outside the conveyor", () => {
    const model = deriveFlow([thread("attention"), thread("working", working)], { now: NOW });

    expect(flowNavigationTarget(model, keyFor("settled"), "next")?.id).toBe("attention");
    expect(flowNavigationTarget(model, keyFor("settled"), "previous")?.id).toBe("attention");
  });
});

describe("isFlowAttentionSession", () => {
  it("is true only for sessions currently on the attention queue", () => {
    const model = deriveFlow([thread("attention"), thread("working", working)], { now: NOW });

    expect(isFlowAttentionSession(model, keyFor("attention"))).toBe(true);
    expect(isFlowAttentionSession(model, keyFor("working"))).toBe(false);
    expect(isFlowAttentionSession(model, keyFor("settled"))).toBe(false);
    expect(isFlowAttentionSession(model, null)).toBe(false);
  });
});

describe("shouldReleaseFlowInspection", () => {
  it("keeps a working-session pin while the current route is still the queue", () => {
    const model = deriveFlow([thread("attention"), thread("working", working)], { now: NOW });

    expect(shouldReleaseFlowInspection(model, keyFor("attention"), keyFor("working"))).toBe(false);
    expect(shouldReleaseFlowInspection(model, keyFor("working"), keyFor("working"))).toBe(false);
    expect(shouldReleaseFlowInspection(model, keyFor("attention"), keyFor("attention"))).toBe(true);
  });
});

function keyFor(id: string): string {
  return scopedThreadKey(scopeThreadRef(ENVIRONMENT_ID, ThreadId.make(id)));
}

describe("flowAttentionTarget", () => {
  const key = (id: string) => scopedThreadKey(scopeThreadRef(ENVIRONMENT_ID, ThreadId.make(id)));

  it("enters the oldest queued session from the overview or a working session", () => {
    const model = deriveFlow(
      [
        thread("working", working),
        thread("newer", { updatedAt: "2026-09-04T11:00:00.000Z" }),
        thread("oldest"),
      ],
      { now: NOW },
    );
    expect(flowAttentionTarget(model, null)?.id).toBe("oldest");
    expect(flowAttentionTarget(model, key("working"))?.id).toBe("oldest");
  });

  it("does not steal an explicitly opened session outside the queue", () => {
    const model = deriveFlow([thread("working", working), thread("oldest")], { now: NOW });
    expect(flowAttentionTarget(model, key("working"), key("working"))).toBeNull();
    expect(flowAttentionTarget(model, key("settled"), key("settled"))).toBeNull();
    expect(flowAttentionTarget(model, key("working"), key("oldest"))).toBeNull();
  });

  it("does not interrupt a queued session already being viewed", () => {
    const model = deriveFlow([thread("first"), thread("second")], { now: NOW });
    expect(flowAttentionTarget(model, key("second"))).toBeNull();
  });

  it("stays in the overview with an empty queue", () => {
    const model = deriveFlow([thread("working", working)], { now: NOW });
    expect(flowAttentionTarget(model, null)).toBeNull();
  });

  it("distinguishes queued sessions with the same ID in different environments", () => {
    const remote = EnvironmentId.make("remote");
    const model = deriveFlow([thread("same", { environmentId: remote })], { now: NOW });
    expect(flowAttentionTarget(model, key("same"))?.environmentId).toBe(remote);
  });
});

describe("isFlowSessionInspection", () => {
  const key = (id: string) => scopedThreadKey(scopeThreadRef(ENVIRONMENT_ID, ThreadId.make(id)));

  it("opens an explicitly selected working session and returns to previews when cleared", () => {
    const model = deriveFlow([thread("working", working)], { now: NOW });
    expect(isFlowSessionInspection(model, key("working"), null)).toBe(false);
    expect(isFlowSessionInspection(model, key("working"), key("working"))).toBe(true);
    expect(isFlowSessionInspection(model, key("working"), null)).toBe(false);
    expect(isFlowSessionInspection(model, null, key("working"))).toBe(false);
  });

  it("opens a sidebar session that is not on the working bench", () => {
    expect(
      isFlowSessionInspection(
        { attention: [], bench: [], snoozed: [] },
        key("settled"),
        key("settled"),
      ),
    ).toBe(true);
  });

  it("resumes the queue when a session needs attention", () => {
    const model = deriveFlow([thread("working", working), thread("waiting")], { now: NOW });
    expect(isFlowSessionInspection(model, key("working"), key("working"))).toBe(false);
    expect(flowAttentionTarget(model, key("working"))?.id).toBe("waiting");
  });

  it("does not treat a same-ID session in another environment as the inspected one", () => {
    const remote = EnvironmentId.make("remote");
    const model = deriveFlow([thread("working", { environmentId: remote, ...working })], {
      now: NOW,
    });
    expect(
      isFlowSessionInspection(
        model,
        key("working"),
        scopedThreadKey(scopeThreadRef(remote, ThreadId.make("working"))),
      ),
    ).toBe(false);
  });
});

describe("held Flow overview", () => {
  const model = deriveFlow([thread("working", working), thread("waiting")], { now: NOW });

  it("shows while threads wait instead of entering the oldest one", () => {
    expect(isFlowOverviewAvailable(model, false)).toBe(false);
    expect(isFlowOverviewAvailable(model, true)).toBe(true);
    expect(flowAttentionTarget(model, null, null, true)).toBeNull();
    expect(flowAttentionTarget(model, keyFor("working"), null, true)).toBeNull();
  });
});
