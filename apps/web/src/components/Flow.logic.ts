import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import {
  type EnvironmentThreadShell,
  threadRuntimeIsActive,
} from "@t3tools/client-runtime/state/models";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentId } from "@t3tools/contracts";

export type FlowAttentionStatus = "Approval" | "Input" | "Failed" | "Plan ready" | "Review";
export type FlowBenchStatus = "Connecting" | "Working" | "Monitoring";

export interface FlowAttentionEntry {
  readonly kind: "attention";
  readonly status: FlowAttentionStatus;
  readonly timestamp: string;
  readonly thread: EnvironmentThreadShell;
}

export interface FlowBenchEntry {
  readonly kind: "bench";
  readonly status: FlowBenchStatus;
  readonly timestamp: string;
  readonly thread: EnvironmentThreadShell;
}

export interface FlowModel {
  readonly attention: ReadonlyArray<FlowAttentionEntry>;
  readonly bench: ReadonlyArray<FlowBenchEntry>;
}

/** The keyboard conveyor follows the visual order: attention, then working sessions. */
export function flowNavigationEntries(
  model: FlowModel,
): ReadonlyArray<FlowAttentionEntry | FlowBenchEntry> {
  return [...model.attention, ...model.bench];
}

export function flowThreadKey(
  thread: Pick<EnvironmentThreadShell, "environmentId" | "id">,
): string {
  return scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
}

export function flowNavigationTarget(
  model: FlowModel,
  currentThreadKey: string | null,
  direction: "previous" | "next",
): EnvironmentThreadShell | null {
  const entries = flowNavigationEntries(model);
  if (entries.length === 0) return null;

  const currentIndex = entries.findIndex(
    ({ thread }) => flowThreadKey(thread) === currentThreadKey,
  );
  // Off the conveyor (sidebar, settled, draft): both brackets re-enter at the
  // oldest queued session, then step through working sessions on the right.
  const targetIndex =
    direction === "previous"
      ? Math.max(0, currentIndex <= 0 ? 0 : currentIndex - 1)
      : Math.min(entries.length - 1, currentIndex < 0 ? 0 : currentIndex + 1);
  return entries[targetIndex]?.thread ?? null;
}

export function isFlowAttentionSession(model: FlowModel, threadKey: string | null): boolean {
  return (
    threadKey !== null && model.attention.some(({ thread }) => flowThreadKey(thread) === threadKey)
  );
}

/** Drop the pin only after landing on the chosen queued session. Clearing it
 * while still on the queue lets the overview yank a working-session click. */
export function shouldReleaseFlowInspection(
  model: FlowModel,
  currentThreadKey: string | null,
  inspectedThreadKey: string | null,
): boolean {
  return (
    inspectedThreadKey !== null &&
    currentThreadKey === inspectedThreadKey &&
    isFlowAttentionSession(model, currentThreadKey)
  );
}

export function nextFlowThread(
  model: FlowModel,
  currentThreadKey: string | null,
  connectedEnvironmentIds: ReadonlySet<EnvironmentId>,
  excludedThreadKeys?: ReadonlySet<string>,
): EnvironmentThreadShell | null {
  if (currentThreadKey === null) return null;
  return (
    model.attention.find(({ thread }) => {
      const key = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
      return (
        key !== currentThreadKey &&
        !excludedThreadKeys?.has(key) &&
        connectedEnvironmentIds.has(thread.environmentId)
      );
    })?.thread ?? null
  );
}

function validTimestamp(...candidates: ReadonlyArray<string | null | undefined>): string {
  for (const candidate of candidates) {
    if (candidate != null && Number.isFinite(Date.parse(candidate))) return candidate;
  }
  return new Date(0).toISOString();
}

function attentionTimestamp(thread: EnvironmentThreadShell): string {
  return validTimestamp(
    thread.latestRun?.completedAt,
    thread.runtime?.updatedAt,
    thread.latestRun?.startedAt,
    thread.updatedAt,
    thread.createdAt,
  );
}

function hasFailed(thread: EnvironmentThreadShell): boolean {
  return thread.latestRun?.status === "failed" && !threadRuntimeIsActive(thread.runtime);
}

/** Same precedence as the sidebar status pill, so a card never disagrees with it. */
function benchStatus(thread: EnvironmentThreadShell): FlowBenchStatus | null {
  const status = thread.runtime?.status;
  if (status === "running" || status === "waiting") return "Working";
  if (status === "preparing" || status === "starting" || status === "queued") return "Connecting";
  // A failed run must not be hidden by background work that died with it.
  if (hasFailed(thread)) return null;
  if (thread.pendingBackgroundTasks.length > 0) return "Monitoring";
  return null;
}

function attentionStatus(thread: EnvironmentThreadShell): FlowAttentionStatus {
  if (thread.hasPendingApprovals) return "Approval";
  if (thread.hasPendingUserInput) return "Input";
  if (hasFailed(thread)) return "Failed";
  if (thread.interactionMode === "plan" && thread.hasActionableProposedPlan) return "Plan ready";
  return "Review";
}

/**
 * Derives the conveyor from durable thread-shell state. The attention side is
 * FIFO (oldest waiting first); active agent work is compacted onto the bench.
 */
export function deriveFlow(
  threads: ReadonlyArray<EnvironmentThreadShell>,
  options: { readonly now: string },
): FlowModel {
  const attention: FlowAttentionEntry[] = [];
  const bench: FlowBenchEntry[] = [];

  for (const thread of threads) {
    if (thread.archivedAt !== null || thread.settledOverride === "settled") continue;
    if (effectiveSnoozed(thread, options)) continue;

    const timestamp = attentionTimestamp(thread);
    const workingStatus = benchStatus(thread);
    if (workingStatus !== null && !thread.hasPendingApprovals && !thread.hasPendingUserInput) {
      bench.push({ kind: "bench", status: workingStatus, thread, timestamp });
      continue;
    }
    attention.push({
      kind: "attention",
      status: attentionStatus(thread),
      thread,
      timestamp,
    });
  }

  attention.sort(
    (left, right) =>
      Date.parse(left.timestamp) - Date.parse(right.timestamp) ||
      left.thread.id.localeCompare(right.thread.id),
  );
  bench.sort(
    (left, right) =>
      Date.parse(right.timestamp) - Date.parse(left.timestamp) ||
      left.thread.id.localeCompare(right.thread.id),
  );

  return { attention, bench };
}

/** Stay on a queued session, or on a session the user opened themselves.
 * Otherwise enter the oldest waiting session (empty overview, or unpinned
 * working session) so autojump still drives the conveyor. */
export function flowAttentionTarget(
  model: FlowModel,
  currentThreadKey: string | null,
  inspectedThreadKey: string | null = null,
): EnvironmentThreadShell | null {
  if (inspectedThreadKey !== null) return null;
  if (isFlowAttentionSession(model, currentThreadKey)) return null;
  return model.attention[0]?.thread ?? null;
}

/** An explicit selection opens chat while the attention queue is empty. */
export function isFlowSessionInspection(
  model: FlowModel,
  currentThreadKey: string | null,
  inspectedThreadKey: string | null,
): boolean {
  return (
    model.attention.length === 0 &&
    currentThreadKey !== null &&
    currentThreadKey === inspectedThreadKey
  );
}
