import {
  scopeProjectRef,
  scopedThreadKey,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import { useNavigate } from "@tanstack/react-router";
import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { deriveTimelineEntriesFromVisibleTurnItems } from "../session-logic";
import { useTheme } from "../hooks/useTheme";
import { useFlowStore } from "../flowStore";
import { useEnvironments } from "../state/environments";
import { useProject, useThreadVisibleTurnItems } from "../state/entities";
import { buildThreadRouteParams } from "../threadRoutes";
import type { FlowBenchEntry } from "./Flow.logic";
import { ProjectFavicon } from "./ProjectFavicon";
import { WorkEntryPreview } from "./chat/ToolActivity";

export const FlowSessionPreview = memo(function FlowSessionPreview({
  entry,
}: {
  entry: FlowBenchEntry;
}) {
  const { thread } = entry;
  const { resolvedTheme } = useTheme();
  const navigate = useNavigate();
  const ref = useMemo(
    () => scopeThreadRef(thread.environmentId, thread.id),
    [thread.environmentId, thread.id],
  );
  // Each tile uses the existing environment-scoped, live detail subscription.
  const visibleTurnItems = useThreadVisibleTurnItems(ref);
  const project = useProject(scopeProjectRef(thread.environmentId, thread.projectId));
  const { environments } = useEnvironments();
  const environment = environments.find((item) => item.environmentId === thread.environmentId);
  const disconnected = environment?.connection.phase !== "connected";
  const { messages, activities } = useMemo(() => {
    const entries = deriveTimelineEntriesFromVisibleTurnItems({
      visibleTurnItems,
      optimisticMessages: [],
    });
    return {
      messages: entries
        .flatMap((entry) =>
          entry.kind === "message" && entry.message.text.trim() ? [entry.message] : [],
        )
        .slice(-3),
      activities: entries.flatMap((entry) => (entry.kind === "work" ? [entry.entry] : [])).slice(-3),
    };
  }, [visibleTurnItems]);
  const loaded = visibleTurnItems.length > 0;
  const scrollRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  useLayoutEffect(() => {
    if (followLatest.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleTurnItems]);

  const openSession = () => {
    useFlowStore.getState().inspectSession(scopedThreadKey(ref));
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(ref),
    });
  };

  return (
    <section
      role="button"
      tabIndex={0}
      data-modal-item=""
      data-modal-key={scopedThreadKey(ref)}
      aria-label={`Open ${thread.title}`}
      onClick={() => {
        if (window.getSelection()?.isCollapsed === false) return;
        openSession();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        openSession();
      }}
      className="flex h-96 w-full min-w-0 max-w-lg cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card/40 outline-hidden hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <header className="flex items-start gap-2 border-b border-border/60 px-4 py-3">
        {project ? <ProjectFavicon project={project} className="mt-0.5 size-4 shrink-0" /> : null}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium">{thread.title}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {environments.length > 1 ? `${environment?.label ?? "Unknown environment"} · ` : ""}
            {project?.title ?? "Unknown project"}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {thread.modelSelection.model} ·{" "}
            {String(
              thread.modelSelection.options?.find((option) =>
                ["reasoningEffort", "effort", "reasoning", "variant"].includes(option.id),
              )?.value ?? "Default effort",
            )}
            {disconnected ? " · Disconnected" : ""}
          </p>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-4 py-3">
        <div
          ref={scrollRef}
          onScroll={(event) => {
            const element = event.currentTarget;
            followLatest.current =
              element.scrollHeight - element.scrollTop - element.clientHeight < 32;
          }}
          className="overflow-y-auto text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {messages.map((message) => (
            <div key={message.id} className="mb-3">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {message.role === "user"
                  ? "You"
                  : message.role === "assistant"
                    ? "Agent"
                    : "System"}
              </p>
              <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                {message.text.slice(-2000)}
              </p>
            </div>
          ))}
          {activities.length > 0 ? (
            <ul className="space-y-0.5 border-t border-border/50 pt-2">
              {activities.map((activity) => (
                <li key={activity.id}>
                  <WorkEntryPreview
                    entry={activity}
                    environmentId={thread.environmentId}
                    resolvedTheme={resolvedTheme}
                    workspaceRoot={thread.worktreePath ?? project?.workspaceRoot}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          {messages.length === 0 && activities.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {disconnected
                ? "Waiting for connection…"
                : loaded
                  ? "Waiting for agent activity…"
                  : "Loading session…"}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
});
