import { useLayoutEffect } from "react";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useSidebar } from "../../components/ui/sidebar";
import { getClientSettings } from "../../hooks/useSettings";
import { useFlowStore } from "../../flowStore";
import { useModalKeyboardStore } from "../../modalKeyboardStore";
import { focusModalSurface } from "../../modalKeyboardDom";
import { useRightPanelStore } from "../../rightPanelStore";

type ChatFocusHost = {
  activeThreadRef: ScopedThreadRef | null;
  rightPanelOpen: boolean;
  rightPanelPresent: boolean;
  shouldUseRightPanelSheet: boolean;
  rightPanelMaximized: boolean;
  revealConversation: () => void;
};

/** Reveal the requested surface before focusing it, including sheets and mobile drawers. */
export function useHuyChatFocus({
  activeThreadRef,
  rightPanelOpen,
  rightPanelPresent,
  shouldUseRightPanelSheet,
  rightPanelMaximized,
  revealConversation,
}: ChatFocusHost) {
  const modalFocusRequest = useModalKeyboardStore((state) => state.focusRequest);
  const {
    open: modalSidebarOpen,
    setOpen: setModalSidebarOpen,
    isMobile: modalSidebarIsMobile,
    openMobile: modalSidebarOpenMobile,
    setOpenMobile: setModalSidebarOpenMobile,
  } = useSidebar();
  const flowOpen = useFlowStore((state) => state.open);
  // The thread view reveals panels before fulfilling focus, after their DOM commits.
  useLayoutEffect(() => {
    if (!modalFocusRequest || !getClientSettings().modalKeyboardEnabled) return;
    if (modalFocusRequest !== "sidebar" && modalSidebarIsMobile && modalSidebarOpenMobile) {
      setModalSidebarOpenMobile(false);
      return;
    }
    if (modalFocusRequest === "rightPanel") {
      if (!activeThreadRef) {
        useModalKeyboardStore.setState({ focusRequest: null });
        return;
      }
      if (!rightPanelOpen) {
        useRightPanelStore.getState().show(activeThreadRef);
        return;
      }
      if (!rightPanelPresent) return;
    } else {
      if (shouldUseRightPanelSheet && rightPanelPresent) {
        if (rightPanelOpen && activeThreadRef) useRightPanelStore.getState().close(activeThreadRef);
        return;
      }
      if (
        (modalFocusRequest === "conversation" || modalFocusRequest === "question") &&
        rightPanelMaximized
      ) {
        revealConversation();
        return;
      }
      if (modalFocusRequest === "sidebar") {
        if (modalSidebarIsMobile && !modalSidebarOpenMobile) {
          setModalSidebarOpenMobile(true);
          return;
        }
        if (!modalSidebarIsMobile && !modalSidebarOpen) {
          setModalSidebarOpen(true);
          return;
        }
      }
      if (modalFocusRequest === "flow" && !flowOpen) {
        useFlowStore.getState().setOpen(true);
        return;
      }
    }
    if (
      focusModalSurface(modalFocusRequest, useModalKeyboardStore.getState().focusRightPanelTabs)
    ) {
      useModalKeyboardStore.setState({ focusRequest: null });
    }
  });
}
