import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { useEffect, type ReactNode } from "react";
import { useMatches, useNavigate, useParams } from "@tanstack/react-router";
import { isElectron } from "../env";
import { useFlowStore } from "../flowStore";
import { useAllEnvironmentShellsBootstrapped } from "../state/entities";
import {
  buildThreadRouteParams,
  resolveThreadRouteRef,
  resolveThreadRouteTarget,
} from "../threadRoutes";
import {
  flowAttentionTarget,
  flowNavigationEntries,
  isFlowOverviewAvailable,
  isFlowSessionInspection,
  shouldReleaseFlowInspection,
} from "./Flow.logic";
import { useFlowModel } from "../hooks/useFlowModel";
import { FlowSessionPreview } from "./FlowSessionPreview";
import { FlowSnoozedRow } from "./FlowSnoozedRow";
import { ModalKeyboard } from "./ModalKeyboard";
import { WorkspacePageHeader } from "./WorkspacePageHeader";
import { SidebarInset } from "./ui/sidebar";
import { WorkingSessionGrid } from "../customizations/huy/BalancedWorkingSessions";

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

/** Keep chat effects and editing shortcuts unmounted while watching the working bench. */
export function FlowOverviewBoundary({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const routeParams = useParams({ strict: false });
  const routeTarget = resolveThreadRouteTarget(routeParams);
  const currentRef = resolveThreadRouteRef(routeParams);
  const currentKey = currentRef ? scopedThreadKey(currentRef) : null;
  // ChatView (and its vim handler) unmounts here. The index route already
  // hosts ModalKeyboard in the sidebar layout; thread/draft routes do not.
  const hostModalKeyboard = routeTarget !== null;
  const open = useFlowStore((state) => state.open);
  const inspectedThreadKey = useFlowStore((state) => state.inspectedThreadKey);
  const overviewOpen = useFlowStore((state) => state.overviewOpen);
  const routeId = useMatches({ select: (matches) => matches.at(-1)?.routeId });
  const bootstrapped = useAllEnvironmentShellsBootstrapped();
  const model = useFlowModel();
  const chatRoute =
    routeId === "/_chat/" ||
    routeId === "/_chat/$environmentId/$threadId" ||
    routeId === "/_chat/draft/$draftId";
  // A draft is the new-session composer. Flow may choose a working thread to
  // watch, but must not immediately replace an explicitly requested draft.
  const controlled = shouldControlFlowRoute({
    open,
    bootstrapped,
    chatRoute,
    draftRoute: routeTarget?.kind === "draft",
  });
  const target = controlled
    ? flowAttentionTarget(model, currentKey, inspectedThreadKey, overviewOpen)
    : null;
  const targetEnvironmentId = target?.environmentId;
  const targetThreadId = target?.id;
  useEffect(() => {
    if (!targetEnvironmentId || !targetThreadId) return;
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(targetEnvironmentId, targetThreadId)),
      replace: true,
    });
  }, [navigate, targetEnvironmentId, targetThreadId]);
  useEffect(() => {
    if (!shouldReleaseFlowInspection(model, currentKey, inspectedThreadKey)) return;
    useFlowStore.getState().inspectSession(null);
  }, [model, currentKey, inspectedThreadKey]);
  if (
    !controlled ||
    !isFlowOverviewAvailable(model, overviewOpen) ||
    isFlowSessionInspection(model, currentKey, inspectedThreadKey)
  )
    return children;
  // Waiting threads only appear while the overview is held open; they lead, as in the Flow bar.
  const entries = flowNavigationEntries(model);

  return (
    <SidebarInset className="relative h-svh min-h-0 overflow-hidden bg-background text-foreground md:h-dvh">
      {isElectron ? <WorkspacePageHeader electron className="absolute inset-x-0 top-0" /> : null}
      <main
        aria-label="Working session previews"
        className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 outline-none"
        data-modal-grid="working-sessions"
        data-modal-surface="conversation"
        tabIndex={-1}
      >
        <div className="flex min-h-full flex-col items-center gap-6">
          <div className="flex w-full flex-1 items-center justify-center">
            {entries.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No sessions are working right now.
              </p>
            ) : (
              <WorkingSessionGrid>
                {entries.map((entry) => (
                  <FlowSessionPreview
                    key={scopedThreadKey(
                      scopeThreadRef(entry.thread.environmentId, entry.thread.id),
                    )}
                    entry={entry}
                  />
                ))}
              </WorkingSessionGrid>
            )}
          </div>
          <FlowSnoozedRow threads={model.snoozed} />
        </div>
      </main>
      {hostModalKeyboard ? <ModalKeyboard hasThread={false} workingSessionGrid /> : null}
    </SidebarInset>
  );
}
