import { useParams } from "@tanstack/react-router";

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { SidebarInset } from "./ui/sidebar";
import { isElectron } from "../env";
import { WorkspacePageHeader } from "./WorkspacePageHeader";
import { GrokBotToggle } from "./chat/PanelLayoutControls";
import { resolveThreadRouteTarget } from "../threadRoutes";

export function NoActiveThreadState() {
  const hasThreadRoute = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params) !== null,
  });
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <WorkspacePageHeader electron={isElectron} className="border-b border-border">
          {hasThreadRoute ? (
            <div
              data-panel-layout-controls
              className="fixed top-[var(--workspace-controls-top)] right-[var(--workspace-controls-right)] z-70 mr-px flex h-[var(--workspace-topbar-height)] items-center [-webkit-app-region:no-drag]"
            >
              <GrokBotToggle />
            </div>
          ) : null}
          {isElectron ? (
            <span className="text-xs text-muted-foreground/50">No active thread</span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground md:text-muted-foreground/60">
                No active thread
              </span>
            </div>
          )}
        </WorkspacePageHeader>

        <Empty className="flex-1">
          <div className="w-full max-w-lg px-8 py-12">
            <EmptyHeader className="max-w-none">
              <EmptyTitle>Pick a thread to continue</EmptyTitle>
              <EmptyDescription>
                Select an existing thread or create a new one to get started.
              </EmptyDescription>
            </EmptyHeader>
          </div>
        </Empty>
      </div>
    </SidebarInset>
  );
}
