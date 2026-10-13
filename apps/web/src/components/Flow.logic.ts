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
  /** Off the conveyor; the overview lists them, soonest wake first. */
  readonly snoozed: ReadonlyArray<EnvironmentThreadShell>;
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
  const snoozed: EnvironmentThreadShell[] = [];

  for (const thread of threads) {
    if (thread.archivedAt !== null || thread.settledOverride === "settled") continue;
    // Subagent threads have no run of their own (they would always read as
    // Review); their parent carries the activity, as in the sidebar.
    if (thread.lineage.relationshipToParent === "subagent") continue;
    if (effectiveSnoozed(thread, options)) {
      snoozed.push(thread);
      continue;
    }

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
  // Activity timestamps change during a run; keep working previews in place.
  bench.sort(
    (left, right) =>
      Date.parse(right.thread.createdAt) - Date.parse(left.thread.createdAt) ||
      flowThreadKey(left.thread).localeCompare(flowThreadKey(right.thread)),
  );

  snoozed.sort(
    (left, right) =>
      Date.parse(left.snoozedUntil ?? "") - Date.parse(right.snoozedUntil ?? "") ||
      flowThreadKey(left).localeCompare(flowThreadKey(right)),
  );

  return { attention, bench, snoozed };
}

/** Stay on a queued session, on a session the user opened themselves, or on
 * the held overview. Otherwise enter the oldest waiting session (empty
 * overview, or unpinned working session) so autojump still drives the conveyor. */
export function flowAttentionTarget(
  model: FlowModel,
  currentThreadKey: string | null,
  inspectedThreadKey: string | null = null,
  overviewOpen = false,
): EnvironmentThreadShell | null {
  if (overviewOpen || inspectedThreadKey !== null) return null;
  if (isFlowAttentionSession(model, currentThreadKey)) return null;
  return model.attention[0]?.thread ?? null;
}

/** The overview shows while the attention queue is empty or the user holds it open. */
export function isFlowOverviewAvailable(model: FlowModel, overviewOpen: boolean): boolean {
  return overviewOpen || model.attention.length === 0;
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

export function shouldControlFlowRoute({
  open,
  bootstrapped,
  chatRoute,
  draftRoute,
}: {
  open: boolean;
  bootstrapped: boolean;
  chatRoute: boolean;
  draftRoute: boolean;
}) {
  return open && bootstrapped && chatRoute && !draftRoute;
}

export const FLOW_BENCH_ROWS = 3;
export const FLOW_BENCH_COLUMN_WIDTH = 300;
export const FLOW_BENCH_COLUMN_GAP = 4;

/** Content widths of the three-row columns, capped so long titles truncate. */
export function flowBenchColumnWidths(count: number, itemWidths: readonly number[] = []): number[] {
  const columns: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const column = Math.floor(index / FLOW_BENCH_ROWS);
    columns[column] = Math.max(
      columns[column] ?? 0,
      Math.min(FLOW_BENCH_COLUMN_WIDTH, itemWidths[index] ?? FLOW_BENCH_COLUMN_WIDTH),
    );
  }
  return columns;
}

/** Width the bench asks for so every session gets a cell; the Flow bar may cap it. */
export function flowBenchRequestedWidth(count: number, itemWidths: readonly number[] = []): number {
  const columns = flowBenchColumnWidths(count, itemWidths);
  return (
    columns.reduce((sum, width) => sum + width, 0) +
    Math.max(0, columns.length - 1) * FLOW_BENCH_COLUMN_GAP
  );
}

/**
 * How many working sessions get a chip in the bench's column-major grid at the
 * given width. When they don't all fit, the last cell becomes "+N more".
 */
export function flowBenchCapacity(
  count: number,
  width: number,
  itemWidths: readonly number[] = [],
  moreWidth = FLOW_BENCH_COLUMN_WIDTH,
): { readonly shown: number; readonly hidden: number } {
  if (count <= FLOW_BENCH_ROWS || flowBenchRequestedWidth(count, itemWidths) <= width) {
    return { shown: count, hidden: 0 };
  }
  const overflowWidth = Math.min(FLOW_BENCH_COLUMN_WIDTH, moreWidth);
  let usedWidth = 0;
  let columnWidth = 0;
  let shown = 0;
  for (let index = 0; index < count; index += 1) {
    const startsColumn = index % FLOW_BENCH_ROWS === 0;
    const gap = startsColumn && index > 0 ? FLOW_BENCH_COLUMN_GAP : 0;
    const withMore = startsColumn
      ? usedWidth + gap + overflowWidth
      : usedWidth + Math.max(0, overflowWidth - columnWidth);
    // Always keep one column; its tracks can shrink in a very narrow bar.
    if (withMore <= width || index < FLOW_BENCH_ROWS) shown = index;
    const itemWidth = Math.min(
      FLOW_BENCH_COLUMN_WIDTH,
      itemWidths[index] ?? FLOW_BENCH_COLUMN_WIDTH,
    );
    if (startsColumn) {
      columnWidth = itemWidth;
      usedWidth += gap + itemWidth;
    } else {
      usedWidth += Math.max(0, itemWidth - columnWidth);
      columnWidth = Math.max(columnWidth, itemWidth);
    }
  }
  return { shown, hidden: count - shown };
}
