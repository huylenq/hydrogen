import {
  scopeProjectRef,
  scopeThreadRef,
  scopedThreadKey,
} from "@t3tools/client-runtime/environment";
import {
  type EnvironmentThreadShell,
  threadRuntimeIsActive,
} from "@t3tools/client-runtime/state/models";
import { useNavigate } from "@tanstack/react-router";
import { memo, useState } from "react";

import { useFlowStore } from "../flowStore";
import { useNowMinute } from "../hooks/useNowMinute";
import { useProject } from "../state/entities";
import { buildThreadRouteParams } from "../threadRoutes";
import { clusterSnoozedByProject, flowThreadKey, type FlowSnoozedCluster } from "./Flow.logic";
import { snoozeWakeLabel } from "./Sidebar.snooze";
import { ProjectFavicon } from "./ProjectFavicon";
import { cn } from "../lib/utils";
import {
  IMPORTANT_SESSION_SURFACE_CLASS,
  IMPORTANT_SESSION_TITLE_CLASS,
  useSessionImportanceStore,
} from "../customizations/huy/sessionImportance";

// A cluster longer than this shows its first few chips and a +N control.
const CLUSTER_COLLAPSE_AFTER = 4;
const CLUSTER_PREVIEW = 3;

/** Snoozed threads under the Flow overview grid, clustered by project; clusters wrap onto further lines. */
export function FlowSnoozedRow({ threads }: { threads: ReadonlyArray<EnvironmentThreadShell> }) {
  const nowMinute = useNowMinute();
  if (threads.length === 0) return null;
  const now = `${nowMinute}:00.000Z`;

  return (
    <ul
      aria-label="Snoozed sessions"
      className="flex w-full min-w-0 flex-wrap items-center justify-center gap-1.5 p-0.5 text-xs text-muted-foreground"
    >
      {clusterSnoozedByProject(threads).map((cluster) => (
        <SnoozedCluster key={cluster.key} cluster={cluster} now={now} />
      ))}
    </ul>
  );
}

function SnoozedCluster({ cluster, now }: { cluster: FlowSnoozedCluster; now: string }) {
  const project = useProject(scopeProjectRef(cluster.environmentId, cluster.projectId));
  const [expanded, setExpanded] = useState(false);
  const collapsed = !expanded && cluster.threads.length > CLUSTER_COLLAPSE_AFTER;
  const shown = collapsed ? cluster.threads.slice(0, CLUSTER_PREVIEW) : cluster.threads;
  const hidden = cluster.threads.length - CLUSTER_PREVIEW;
  const name = project?.title ?? "Unknown project";

  return (
    <li
      aria-label={`${name} · ${cluster.threads.length} snoozed`}
      className="flex min-w-0 flex-wrap items-center gap-1 rounded-lg border border-border/50 bg-foreground/[0.04] py-0.5 pr-0.5 pl-2"
    >
      <span className="flex min-w-0 items-center gap-1.5 pr-0.5 font-medium text-foreground">
        {project ? <ProjectFavicon project={project} className="size-3.5 shrink-0" /> : null}
        <span className="max-w-40 truncate">{name}</span>
      </span>
      <ul className="contents">
        {shown.map((thread) => (
          <SnoozedChip key={flowThreadKey(thread)} thread={thread} now={now} />
        ))}
        {collapsed ? (
          <li className="flex">
            <button
              type="button"
              data-modal-item=""
              aria-label={`Show ${hidden} more snoozed in ${name}`}
              className="rounded-md border border-dashed border-border/60 px-2 py-1 outline-hidden hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              onClick={() => setExpanded(true)}
            >
              +{hidden}
            </button>
          </li>
        ) : null}
      </ul>
    </li>
  );
}

const SnoozedChip = memo(function SnoozedChip({
  thread,
  now,
}: {
  thread: EnvironmentThreadShell;
  now: string;
}) {
  const navigate = useNavigate();
  const running = threadRuntimeIsActive(thread.runtime);

  // Same as opening the thread from the sidebar while Flow is on.
  const ref = scopeThreadRef(thread.environmentId, thread.id);
  const important = useSessionImportanceStore((state) => state.keys.has(scopedThreadKey(ref)));
  const open = () => {
    useFlowStore.getState().inspectSession(scopedThreadKey(ref));
    void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
  };

  return (
    // Titles truncate first; a chip never shrinks below its countdown.
    <li className="flex">
      <button
        type="button"
        // Grid motions (h/j/k/l) reach chips like preview tiles; Enter opens.
        data-modal-item=""
        data-modal-key={scopedThreadKey(ref)}
        data-flow-session-key={scopedThreadKey(ref)}
        data-flow-session-name={thread.title}
        aria-label={important ? `${thread.title} · Important` : undefined}
        className={cn(
          "flex max-w-64 items-center gap-1.5 rounded-md border border-transparent bg-background/70 px-2 py-1 opacity-70 outline-hidden hover:bg-accent hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          important && IMPORTANT_SESSION_SURFACE_CLASS,
        )}
        onClick={open}
      >
        <span
          className={cn(
            "min-w-0 truncate text-foreground",
            important && IMPORTANT_SESSION_TITLE_CLASS,
          )}
        >
          {thread.title}
        </span>
        {running ? (
          <span aria-label="Working" className="size-1.5 shrink-0 rounded-full bg-info" />
        ) : null}
        {thread.snoozedUntil ? (
          <span className="shrink-0 tabular-nums text-info-foreground">
            {snoozeWakeLabel(thread.snoozedUntil, { now })}
          </span>
        ) : null}
      </button>
    </li>
  );
});
