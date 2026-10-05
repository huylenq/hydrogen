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
import { useProject, useServerConfigs, useThreadVisibleTurnItems } from "../state/entities";
import { getProviderInstanceEntry } from "../providerInstances";
import { ProviderInstanceIcon } from "./chat/ProviderInstanceIcon";
import {
  getTriggerDisplayModelLabel,
  stripIconRedundantModelPrefix,
} from "./chat/providerIconUtils";
import { buildThreadRouteParams } from "../threadRoutes";
import type { FlowAttentionEntry, FlowBenchEntry } from "./Flow.logic";
import { FLOW_STATUS_CLASS } from "./FlowBar";
import { ProjectFavicon } from "./ProjectFavicon";
import { WorkEntryPreview } from "../customizations/huy/WorkEntryPreview";
import { shouldPreserveAssistantLineBreaks } from "./chat/MessagesTimeline.logic";
import ChatMarkdown from "./ChatMarkdown";
import { cn } from "../lib/utils";

const PREVIEW_MESSAGE_CHARS = 2000;

/** Keeps a message's tail for the tile, cut at a line start and reopening a code fence the cut lands inside. */
function previewMarkdownTail(text: string): string {
  if (text.length <= PREVIEW_MESSAGE_CHARS) return text;
  const cut = text.indexOf("\n", text.length - PREVIEW_MESSAGE_CHARS);
  if (cut === -1) return text.slice(-PREVIEW_MESSAGE_CHARS);
  const fencesBefore = text.slice(0, cut).match(/^ {0,3}(```|~~~)/gm)?.length ?? 0;
  return `${fencesBefore % 2 === 1 ? "```\n" : ""}${text.slice(cut + 1)}`;
}

export const FlowSessionPreview = memo(function FlowSessionPreview({
  entry,
}: {
  entry: FlowAttentionEntry | FlowBenchEntry;
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
  const providers = useServerConfigs().get(thread.environmentId)?.providers;
  const instanceId = thread.runtime?.providerInstanceId ?? thread.modelSelection.instanceId;
  const providerEntry = useMemo(
    () => (providers ? getProviderInstanceEntry(providers, instanceId) : undefined),
    [providers, instanceId],
  );
  const selectedModel = providerEntry?.models.find(
    (model) => model.slug === thread.modelSelection.model,
  );
  const rawModelLabel = selectedModel
    ? getTriggerDisplayModelLabel(selectedModel)
    : thread.modelSelection.model;
  const modelLabel = providerEntry
    ? stripIconRedundantModelPrefix(rawModelLabel, providerEntry.driverKind)
    : rawModelLabel;
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
      activities: entries
        .flatMap((entry) => (entry.kind === "work" ? [entry.entry] : []))
        .slice(-3),
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
      onClick={(event) => {
        if (window.getSelection()?.isCollapsed === false) return;
        // Markdown links and code-block controls keep their own action.
        if ((event.target as Element).closest("a, button")) return;
        openSession();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        openSession();
      }}
      className="flex h-96 w-full min-w-0 max-w-lg cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card/40 outline-hidden hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <header className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3">
        {project ? <ProjectFavicon project={project} className="size-8 shrink-0" /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{thread.title}</h2>
            {entry.kind === "attention" ? (
              <span className={cn("shrink-0 text-xs font-medium", FLOW_STATUS_CLASS[entry.status])}>
                {entry.status}
              </span>
            ) : null}
          </div>
          <p className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
            <span className="min-w-0 shrink truncate">
              {environments.length > 1 ? `${environment?.label ?? "Unknown environment"} · ` : ""}
              {project?.title ?? "Unknown project"}
            </span>
            <span className="ml-auto flex min-w-0 shrink-[2] items-center gap-1">
              {providerEntry ? (
                <ProviderInstanceIcon
                  driverKind={providerEntry.driverKind}
                  displayName={providerEntry.displayName}
                  acpRegistryAgentId={providerEntry.acpRegistryAgentId}
                  acpRegistryIconUrl={providerEntry.acpRegistryIconUrl}
                  iconClassName="size-3 shrink-0"
                />
              ) : null}
              <span className="min-w-0 truncate">
                {modelLabel} ·{" "}
                {String(
                  thread.modelSelection.options?.find((option) =>
                    ["reasoningEffort", "effort", "reasoning", "variant"].includes(option.id),
                  )?.value ?? "Default effort",
                )}
                {disconnected ? " · Disconnected" : ""}
              </span>
            </span>
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
            <div
              key={message.id}
              className={
                message.role === "user"
                  ? "mb-3 ml-auto w-fit max-w-[80%] rounded-2xl bg-message p-3 text-message-foreground"
                  : "mb-3"
              }
            >
              <ChatMarkdown
                text={previewMarkdownTail(message.text)}
                cwd={thread.worktreePath ?? project?.workspaceRoot}
                threadRef={ref}
                isStreaming={Boolean(message.streaming)}
                lineBreaks={
                  message.role === "user" || shouldPreserveAssistantLineBreaks(message.text)
                }
                parseRawHtml={message.role !== "user"}
                className="text-xs"
              />
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
