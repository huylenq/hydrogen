import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { GitBranchIcon } from "lucide-react";
import { memo } from "react";

import { useOpenLink } from "../../browser/useOpenLink";
import { resolvePullRequestState } from "../../components/pullRequest/pullRequestPresentation";
import { useSidebarRowSubscriptionLease } from "../../components/Sidebar.logic";
import {
  prStatusIndicator,
  PrStatusTooltipContent,
  ThreadWorktreeIndicator,
  useLinkedThreadPullRequest,
} from "../../components/ThreadStatusIndicators";
import { MiddleTruncate } from "../../components/ui/middle-truncate";
import { stackedThreadToast, toastManager } from "../../components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../components/ui/tooltip";
import { cn } from "../../lib/utils";
import { FLOW_CHECKOUT_STRIP_HEIGHT, FLOW_FOOTER_LINE_CLASS } from "./flowGridLayout";

/**
 * The caption under a Flow overview tile: the thread's branch (with a worktree marker when it
 * runs in one) and its pull request, which opens outside the app.
 */
export const FlowSessionCheckoutStrip = memo(function FlowSessionCheckoutStrip({
  thread,
}: {
  thread: EnvironmentThreadShell;
}) {
  const openLink = useOpenLink(null);
  // Like sidebar rows, only tiles near the viewport keep a live PR summary subscription.
  const { leaseLiveStatus, rowRef } = useSidebarRowSubscriptionLease(false);
  const linked = useLinkedThreadPullRequest(
    thread.environmentId,
    thread.linkedPullRequest,
    leaseLiveStatus,
    thread.pullRequests,
    thread.branchPullRequest,
  );
  const pr = linked?.pr ?? null;
  const prStatus = prStatusIndicator(pr, linked?.sourceControlProvider);

  return (
    <div
      ref={rowRef}
      className={cn(FLOW_FOOTER_LINE_CLASS, "gap-3")}
      style={{ height: FLOW_CHECKOUT_STRIP_HEIGHT }}
    >
      {thread.branch ? (
        <span className="flex min-w-0 items-center gap-1">
          <GitBranchIcon className="size-3 shrink-0" aria-hidden />
          <MiddleTruncate value={thread.branch} className="flex" />
          <ThreadWorktreeIndicator thread={thread} />
        </span>
      ) : null}
      {pr && prStatus ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <a
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                className="ml-auto flex shrink-0 items-center gap-1 hover:text-foreground"
                onClick={(event) => {
                  event.preventDefault();
                  openLink(pr.url, { event }).catch((error: unknown) => {
                    toastManager.add(
                      stackedThreadToast({
                        type: "error",
                        title: "Unable to open pull request link",
                        description: error instanceof Error ? error.message : "An error occurred.",
                      }),
                    );
                  });
                }}
              />
            }
          >
            <prStatus.Icon className={`size-3 ${prStatus.colorClass}`} aria-hidden />
            <span>#{pr.number}</span>
            <span className={prStatus.colorClass}>
              {resolvePullRequestState({ state: pr.state, isDraft: pr.isDraft === true }).label}
            </span>
          </TooltipTrigger>
          <TooltipPopup>
            <PrStatusTooltipContent status={prStatus} />
          </TooltipPopup>
        </Tooltip>
      ) : null}
    </div>
  );
});
