import {
  scopeProjectRef,
  scopedThreadKey,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import { presentPendingBackgroundWork } from "@t3tools/client-runtime/state/thread-execution";
import type { OrchestrationV2PendingBackgroundTask, ScopedThreadRef } from "@t3tools/contracts";
import { shouldPreserveAssistantLineBreaks } from "@t3tools/shared/markdownPipeline";
import { useNavigate } from "@tanstack/react-router";
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { deriveTimelineEntriesFromVisibleTurnItems } from "../session-logic";
import { useTheme } from "../hooks/useTheme";
import { useFlowStore } from "../flowStore";
import { useEnvironments } from "../state/environments";
import { useProject, useServerConfigs, useThreadVisibleTurnItems } from "../state/entities";
import { getProviderInstanceEntry } from "../providerInstances";
import { ProviderInstanceIcon } from "./chat/ProviderInstanceIcon";
import { ToolActivityIconCtx, type WorkEntryIconName } from "./chat/MessagesTimeline";
import {
  getTriggerDisplayModelLabel,
  stripIconRedundantModelPrefix,
} from "./chat/providerIconUtils";
import { buildThreadRouteParams } from "../threadRoutes";
import type { FlowAttentionEntry, FlowBenchEntry } from "./Flow.logic";
import { FLOW_STATUS_CLASS } from "./FlowBar";
import { ProjectFavicon } from "./ProjectFavicon";
import {
  LiveStatusPreview,
  WorkEntryPreview,
  type LiveStatus,
} from "../customizations/huy/WorkEntryPreview";
import { FlowSessionCheckoutStrip } from "../customizations/huy/FlowSessionCheckoutStrip";
import { deriveMessagesTimelineRows } from "./chat/MessagesTimeline.logic";
import ChatMarkdown from "./ChatMarkdown";
import { cn } from "../lib/utils";

const PREVIEW_MESSAGE_CHARS = 2000;

// Matches the chat's icons for background-work notifications (`workEntryIconName`).
const BACKGROUND_WORK_ICON = {
  subagent: "bot",
  command: "terminal",
  monitor: "eye",
  background_task: "zap",
} as const satisfies Record<OrchestrationV2PendingBackgroundTask["kind"], WorkEntryIconName>;

const THINKING_STATUS: LiveStatus = { label: "Thinking", iconName: "brain", sweeping: true };

/** Work a finished turn left running, titled as in the chat's composer banner; only work that will wake the agent sweeps. */
function backgroundWorkStatus(
  tasks: ReadonlyArray<OrchestrationV2PendingBackgroundTask>,
): LiveStatus | null {
  const work = presentPendingBackgroundWork(tasks);
  if (work === null) return null;
  return {
    label: work.title,
    iconName: BACKGROUND_WORK_ICON[work.items[0]!.kind],
    sweeping: work.waiting,
  };
}

/** Keeps a message's tail for the tile, cut at a line start and reopening a code fence the cut lands inside. */
function previewMarkdownTail(text: string): string {
  if (text.length <= PREVIEW_MESSAGE_CHARS) return text;
  const cut = text.indexOf("\n", text.length - PREVIEW_MESSAGE_CHARS);
  if (cut === -1) return text.slice(-PREVIEW_MESSAGE_CHARS);
  const fencesBefore = text.slice(0, cut).match(/^ {0,3}(```|~~~)/gm)?.length ?? 0;
  return `${fencesBefore % 2 === 1 ? "```\n" : ""}${text.slice(cut + 1)}`;
}

const PROMPT_FADE_MASK = "linear-gradient(to bottom, black calc(100% - 0.875rem), transparent)";

/** The tile's latest user message: a long one collapses to two lines and fades out; its shadow softens the replies' cut beneath it. */
function PromptBubble({
  text,
  cwd,
  threadRef,
}: {
  text: string;
  cwd: string | undefined;
  threadRef: ScopedThreadRef;
}) {
  const clipRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  useLayoutEffect(() => {
    const clip = clipRef.current;
    const content = contentRef.current;
    if (!clip || !content) return;
    // The content's height follows both the text and the tile's width.
    const observer = new ResizeObserver(() => {
      setCollapsed(clip.scrollHeight > clip.clientHeight);
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="relative z-10 max-w-full shrink-0 self-end rounded-2xl bg-message p-3 text-message-foreground shadow-lg shadow-black/30">
      {/* Two lines of the text-xs + leading-relaxed markdown below. */}
      <div
        ref={clipRef}
        className="max-h-10 overflow-hidden"
        style={
          collapsed ? { WebkitMaskImage: PROMPT_FADE_MASK, maskImage: PROMPT_FADE_MASK } : undefined
        }
      >
        <div ref={contentRef}>
          <ChatMarkdown
            text={text.slice(0, PREVIEW_MESSAGE_CHARS)}
            cwd={cwd}
            threadRef={threadRef}
            lineBreaks
            parseRawHtml={false}
            className="text-xs leading-relaxed"
          />
        </div>
      </div>
    </div>
  );
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
  const status = entry.kind === "bench" ? entry.status : null;
  const working = status === "Working";
  const latestRun = thread.latestRun;
  const runningRunId = thread.runtime?.activeRunId ?? null;
  const loaded = visibleTurnItems.length > 0;
  const { prompt, messages, activities, liveToolId, thinking } = useMemo(() => {
    const entries = deriveTimelineEntriesFromVisibleTurnItems({
      visibleTurnItems,
      optimisticMessages: [],
    });
    // The chat's own row derivation decides which tool row is live, or that
    // the session is thinking.
    const rows =
      working && entries.length > 0
        ? deriveMessagesTimelineRows({
            timelineEntries: entries,
            latestRun,
            runningRunId,
            isWorking: true,
            turnDiffSummaries: [],
            supportsConversationRollback: false,
          })
        : [];
    const liveRow = rows.findLast((row) => row.kind === "work-live" && row.active);
    const allMessages = entries.flatMap((entry) =>
      entry.kind === "message" ? [entry.message] : [],
    );
    // Found before blank messages are dropped, so an attachment-only prompt still splits the turn.
    const promptIndex = allMessages.findLastIndex((message) => message.role === "user");
    const latestUserMessage = allMessages[promptIndex];
    return {
      liveToolId: liveRow?.kind === "work-live" ? liveRow.entry.id : null,
      thinking: rows.some((row) => row.kind === "thinking"),
      // The latest user message heads the tile; only its replies scroll below it.
      prompt: latestUserMessage?.text.trim() ? latestUserMessage : null,
      messages: allMessages
        .slice(promptIndex + 1)
        .filter((message) => message.text.trim())
        .slice(-3),
      activities: entries
        .flatMap((entry) => (entry.kind === "work" ? [entry.entry] : []))
        .slice(-3),
    };
  }, [visibleTurnItems, working, latestRun, runningRunId]);
  const liveStatus = thinking
    ? THINKING_STATUS
    : status === "Monitoring"
      ? backgroundWorkStatus(thread.pendingBackgroundTasks)
      : null;
  const iconContext = useMemo(
    () => ({ activeThreadEnvironmentId: thread.environmentId, resolvedTheme }),
    [thread.environmentId, resolvedTheme],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  useLayoutEffect(() => {
    if (followLatest.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    // The live status row can appear without new turn items.
  }, [visibleTurnItems, liveStatus?.label]);

  const flowCardPeer = entry.kind === "attention" ? "" : undefined;
  const openSession = () => {
    useFlowStore.getState().inspectSession(scopedThreadKey(ref));
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(ref),
    });
  };

  return (
    // The checkout strip sits under the tile, outside its frame and click target.
    <div className="flex w-full min-w-0 max-w-lg flex-col gap-1">
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
        className="flex h-96 w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card/40 outline-hidden hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <header className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3">
          {/* Waiting sessions have a Flow bar card; their favicon and title morph into it
            (flowOverviewTransition). */}
          {project ? (
            <span data-flow-session-icon={flowCardPeer} className="flex shrink-0">
              <ProjectFavicon project={project} className="size-8" />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-2">
              <h2
                data-flow-session-title={flowCardPeer}
                className="min-w-0 flex-1 truncate text-sm font-medium"
              >
                {thread.title}
              </h2>
              {entry.kind === "attention" ? (
                <span
                  className={cn("shrink-0 text-xs font-medium", FLOW_STATUS_CLASS[entry.status])}
                >
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
          {prompt ? (
            <PromptBubble
              key={prompt.id}
              text={prompt.text}
              cwd={thread.worktreePath ?? project?.workspaceRoot}
              threadRef={ref}
            />
          ) : null}
          <div
            ref={scrollRef}
            onScroll={(event) => {
              const element = event.currentTarget;
              followLatest.current =
                element.scrollHeight - element.scrollTop - element.clientHeight < 32;
            }}
            // Starts at the prompt bubble's edge, so replies vanish there; the padding is
            // the gap below it at rest.
            className={cn(
              "overflow-y-auto text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              prompt && "pt-1.5",
            )}
          >
            {messages.map((message) => (
              <div key={message.id} className="mb-3">
                <ChatMarkdown
                  text={previewMarkdownTail(message.text)}
                  cwd={thread.worktreePath ?? project?.workspaceRoot}
                  threadRef={ref}
                  isStreaming={Boolean(message.streaming)}
                  lineBreaks={shouldPreserveAssistantLineBreaks(message.text)}
                  parseRawHtml
                  className="text-xs"
                />
              </div>
            ))}
            {activities.length > 0 || liveStatus ? (
              <ToolActivityIconCtx value={iconContext}>
                <ul className="space-y-0.5 border-t border-border/50 pt-2">
                  {activities.map((activity) => (
                    <li key={activity.id}>
                      <WorkEntryPreview
                        entry={activity}
                        workspaceRoot={thread.worktreePath ?? project?.workspaceRoot}
                        active={activity.id === liveToolId}
                      />
                    </li>
                  ))}
                  {liveStatus ? (
                    <li>
                      <LiveStatusPreview {...liveStatus} />
                    </li>
                  ) : null}
                </ul>
              </ToolActivityIconCtx>
            ) : null}
            {!prompt && messages.length === 0 && activities.length === 0 && !liveStatus ? (
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
      <FlowSessionCheckoutStrip thread={thread} />
    </div>
  );
});
