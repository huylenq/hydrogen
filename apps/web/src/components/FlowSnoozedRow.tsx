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
import { memo } from "react";

import { useFlowStore } from "../flowStore";
import { useNowMinute } from "../hooks/useNowMinute";
import { useProject } from "../state/entities";
import { buildThreadRouteParams } from "../threadRoutes";
import { snoozeWakeLabel } from "./Sidebar.snooze";
import { ProjectFavicon } from "./ProjectFavicon";
import { cn } from "../lib/utils";
import {
  IMPORTANT_SESSION_SURFACE_CLASS,
  IMPORTANT_SESSION_TITLE_CLASS,
  useSessionImportanceStore,
} from "../customizations/huy/sessionImportance";

/** One flat line of snoozed threads under the Flow overview grid; chips shrink rather than wrap. */
export function FlowSnoozedRow({ threads }: { threads: ReadonlyArray<EnvironmentThreadShell> }) {
  const nowMinute = useNowMinute();
  if (threads.length === 0) return null;
  const now = `${nowMinute}:00.000Z`;

  return (
    <ul
      aria-label="Snoozed sessions"
      className="flex w-full min-w-0 items-center justify-center-safe gap-1.5 overflow-x-auto p-0.5 text-xs text-muted-foreground"
    >
      {threads.map((thread) => (
        <SnoozedChip key={`${thread.environmentId}:${thread.id}`} thread={thread} now={now} />
      ))}
    </ul>
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
  const project = useProject(scopeProjectRef(thread.environmentId, thread.projectId));
  const running = threadRuntimeIsActive(thread.runtime);

  // Same as opening the thread from the sidebar while Flow is on.
  const ref = scopeThreadRef(thread.environmentId, thread.id);
  const important = useSessionImportanceStore((state) => state.keys.has(scopedThreadKey(ref)));
  const open = () => {
    useFlowStore.getState().inspectSession(scopedThreadKey(ref));
    void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
  };

  return (
    // Titles truncate first; a chip never shrinks below its icon and countdown.
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
          "flex max-w-64 items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 opacity-70 outline-hidden hover:bg-accent hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          important && IMPORTANT_SESSION_SURFACE_CLASS,
        )}
        onClick={open}
      >
        {project ? <ProjectFavicon project={project} className="size-3.5 shrink-0" /> : null}
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
