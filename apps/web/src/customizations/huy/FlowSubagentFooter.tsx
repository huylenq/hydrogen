import { formatSubagentDisplayTitle } from "@t3tools/client-runtime/state/subagent-display";
import { projectedSubagentsToRuntime } from "@t3tools/client-runtime/state/subagentRuntime";
import type {
  OrchestrationV2Subagent,
  ScopedThreadRef,
  ServerProvider,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import { AgentElapsed } from "../../components/chat/AgentElapsed";
import { ProviderInstanceIcon } from "../../components/chat/ProviderInstanceIcon";
import {
  subagentDetail,
  subagentStatusVisual,
  SubagentTimelineTooltip,
} from "../../components/chat/V2LifecycleRow";
import { ThreadHoverCardPopup } from "../../components/ThreadHoverCard";
import { Tooltip, TooltipTrigger } from "../../components/ui/tooltip";
import { cn } from "../../lib/utils";
import { observeVisibleAnimation } from "../../lib/visibleAnimation";
import { FLOW_CHECKOUT_STRIP_HEIGHT, FLOW_FOOTER_LINE_CLASS } from "./flowGridLayout";

/** Rows shown before the rest fold into "+N more", bounding how far one tile's footer grows. */
const MAX_SUBAGENT_ROWS = 3;

/** The chat's round provider avatar at footer scale; listed subagents are all working, so no status dot. */
function SubagentIcon({
  driver,
  provider,
}: {
  driver: OrchestrationV2Subagent["driver"];
  provider: ServerProvider | undefined;
}) {
  return (
    <span
      aria-hidden
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted ring-1 ring-background"
    >
      <ProviderInstanceIcon
        driverKind={driver}
        displayName={provider?.displayName ?? driver}
        acpRegistryIconUrl={provider?.iconUrl}
        className="z-auto"
        iconClassName="size-2.5"
      />
    </span>
  );
}

function FlowSubagentRow({
  agent,
  parentRef,
  providers,
  onOpenThread,
}: {
  agent: OrchestrationV2Subagent;
  parentRef: ScopedThreadRef;
  providers: ReadonlyArray<ServerProvider>;
  onOpenThread: (threadId: ThreadId) => void;
}) {
  const provider = providers.find((entry) => entry.instanceId === agent.providerInstanceId);
  const title = formatSubagentDisplayTitle(agent.title ?? "Subagent");
  const statusLabel = subagentStatusVisual(agent.status).label;
  const detail = subagentDetail(agent.status, agent.result?.trim(), agent.progress?.trim());
  // Shines like the tile's live tool row; queued and waiting work holds still.
  const live = agent.status === "running";
  const threadId = agent.childThreadId;
  const content = (
    <>
      <SubagentIcon driver={agent.driver} provider={provider} />
      <span className="min-w-0 max-w-[55%] shrink-0 truncate text-foreground/80">{title}</span>
      <span aria-hidden className="shrink-0 opacity-60">
        ·
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span
          ref={live ? observeVisibleAnimation : undefined}
          className={cn(live && "live-tool-shine")}
        >
          {detail ?? statusLabel}
        </span>
      </span>
      <span className="ml-auto shrink-0 pl-2 tabular-nums">
        <AgentElapsed
          agent={{
            status: agent.status,
            startedAt: agent.startedAt ? DateTime.formatIso(agent.startedAt) : null,
            completedAt: agent.completedAt ? DateTime.formatIso(agent.completedAt) : null,
          }}
        />
      </span>
    </>
  );
  const className = cn(FLOW_FOOTER_LINE_CLASS, "w-full gap-1.5 text-left");
  return (
    <Tooltip>
      <TooltipTrigger
        delay={200}
        render={
          threadId === null ? (
            <div
              aria-description={statusLabel}
              className={className}
              style={{ height: FLOW_CHECKOUT_STRIP_HEIGHT }}
            >
              {content}
            </div>
          ) : (
            <button
              type="button"
              aria-label={`Open ${title}`}
              aria-description={statusLabel}
              onClick={() => onOpenThread(threadId)}
              className={cn(
                className,
                "cursor-pointer rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
              )}
              style={{ height: FLOW_CHECKOUT_STRIP_HEIGHT }}
            >
              {content}
            </button>
          )
        }
      />
      <ThreadHoverCardPopup>
        <SubagentTimelineTooltip
          parentRef={parentRef}
          subagentId={agent.id}
          providerInstanceId={agent.providerInstanceId}
          origin={agent.origin}
          driver={agent.driver}
          provider={provider}
          providers={providers}
          title={title}
          result={agent.result}
          progress={agent.progress}
          status={agent.status}
          startedAt={agent.startedAt}
          completedAt={agent.completedAt}
          threadId={threadId}
          onOpenThread={onOpenThread}
          elapsed={<AgentElapsed agent={projectedSubagentsToRuntime([agent])[0]!} />}
          model={agent.model}
          modelSelection={agent.modelSelection}
        />
      </ThreadHoverCardPopup>
    </Tooltip>
  );
}

/**
 * Working subagents under a Flow tile, one strip-shaped line each, capped with a "+N more" line
 * that opens the session.
 */
export function FlowSubagentFooter({
  subagents,
  parentRef,
  providers,
  onOpenThread,
  onOpenSession,
}: {
  subagents: ReadonlyArray<OrchestrationV2Subagent>;
  parentRef: ScopedThreadRef;
  providers: ReadonlyArray<ServerProvider>;
  onOpenThread: (threadId: ThreadId) => void;
  onOpenSession: () => void;
}) {
  if (subagents.length === 0) return null;
  const hidden = subagents.length - MAX_SUBAGENT_ROWS;
  return (
    <div className="flex flex-col">
      {subagents.slice(0, MAX_SUBAGENT_ROWS).map((agent) => (
        <FlowSubagentRow
          key={agent.id}
          agent={agent}
          parentRef={parentRef}
          providers={providers}
          onOpenThread={onOpenThread}
        />
      ))}
      {hidden > 0 ? (
        <button
          type="button"
          onClick={onOpenSession}
          className={cn(
            FLOW_FOOTER_LINE_CLASS,
            "w-full gap-1.5 rounded-sm text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
          )}
          style={{ height: FLOW_CHECKOUT_STRIP_HEIGHT }}
        >
          {/* Keeps the label in the titles' column. */}
          <span aria-hidden className="size-4 shrink-0" />+{hidden} more{" "}
          {hidden === 1 ? "subagent" : "subagents"}
        </button>
      ) : null}
    </div>
  );
}
