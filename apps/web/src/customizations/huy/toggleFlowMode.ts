import { useFlowStore } from "../../flowStore";

export type FlowSidebarControls = {
  isMobile: boolean;
  open: boolean;
  openMobile: boolean;
  setOpen: (open: boolean) => void;
  setOpenMobile: (open: boolean) => void;
};

function hideVisibleSidebar(sidebar: FlowSidebarControls) {
  if (sidebar.isMobile) {
    if (sidebar.openMobile) sidebar.setOpenMobile(false);
    return;
  }
  if (sidebar.open) sidebar.setOpen(false);
}

/** Toggle Flow. Enabling hides the left sidebar when it is showing. */
export function toggleFlowMode(sidebar: FlowSidebarControls): boolean {
  const enabling = !useFlowStore.getState().open;
  useFlowStore.getState().setOpen(enabling);
  if (enabling) hideVisibleSidebar(sidebar);
  return enabling;
}
