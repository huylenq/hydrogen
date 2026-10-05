import "./workspace.css";
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { CrewPanel } from "../../components/CrewPanel";
import { ModalKeyboard } from "../../components/ModalKeyboard";
import { GrokBotToggle } from "../../components/chat/PanelLayoutControls";
import { useSidebar } from "../../components/ui/sidebar";
import { useCrewStore } from "../../crewStore";
import { useFlowStore } from "../../flowStore";
import { useFlowJumpCancellation } from "../../hooks/useFlowAutoJump";
import { registerAppCommands, runAppCommand } from "../../appCommands";
import { resolveShortcutCommand } from "../../keybindings";
import { isTerminalFocused } from "../../lib/terminalFocus";
import { cn } from "../../lib/utils";
import { toggleFlowMode, toggleFlowOverview } from "./toggleFlowMode";

export function useHuyWorkspace({
  flowAvailable,
  viewportWidth,
  isMacosDesktop,
  isWindowFullscreen,
}: {
  flowAvailable: boolean;
  viewportWidth: number;
  isMacosDesktop: boolean;
  isWindowFullscreen: boolean;
}) {
  useFlowJumpCancellation();
  const flowOpen = useFlowStore((state) => state.open);
  const crewOpen = useCrewStore((state) => state.open);
  const crewChatOpen = useCrewStore((state) => state.chatOpen);
  const hideWindowButtons =
    isMacosDesktop &&
    flowAvailable &&
    flowOpen &&
    typeof window.desktopBridge?.setWindowButtonVisibility === "function";

  useEffect(() => {
    if (!isMacosDesktop) return;
    const setVisible = window.desktopBridge?.setWindowButtonVisibility;
    if (typeof setVisible !== "function") return;
    const update = (visible: boolean) => {
      void setVisible(visible).catch((error) => {
        console.error("Could not update window button visibility.", error);
      });
    };
    update(!hideWindowButtons);
    return () => update(true);
  }, [isMacosDesktop, hideWindowButtons, isWindowFullscreen]);

  const workspaceStyle = {
    "--crew-rail-width": "56px",
    "--crew-chat-width":
      viewportWidth < 768 ? "calc(100vw - var(--crew-rail-width))" : "clamp(18rem, 30vw, 26rem)",
    "--crew-panel-inline-inset": crewOpen
      ? crewChatOpen
        ? "calc(var(--crew-rail-width) + var(--crew-chat-width))"
        : "var(--crew-rail-width)"
      : "0px",
  } as CSSProperties;
  return { flowOpen, hideWindowButtons, workspaceStyle };
}

/** Custom workspace chrome has one mount independent of upstream sidebar markup. */
export function HuyWorkspace({
  children,
  hasThread,
  pathname,
  viewportWidth,
}: {
  children: ReactNode;
  hasThread: boolean;
  pathname: string;
  viewportWidth: number;
}) {
  const crewOpen = useCrewStore((state) => state.open);
  const crewChatOpen = useCrewStore((state) => state.chatOpen);
  const crewChatFocused = crewOpen && crewChatOpen && viewportWidth < 768;
  return (
    <>
      {!hasThread ? <ModalKeyboard hasThread={false} /> : null}
      <div
        data-workspace-content=""
        className={cn("flex min-h-0 min-w-0 flex-1", crewChatFocused && "hidden")}
      >
        {children}
      </div>
      <CrewPanel />
      {crewChatFocused || (!hasThread && pathname !== "/pull-requests") ? (
        <div
          data-panel-layout-controls
          className="fixed top-[var(--workspace-controls-top)] right-[var(--workspace-controls-right)] z-70 mr-px flex h-[var(--workspace-topbar-height)] items-center [-webkit-app-region:no-drag]"
        >
          <GrokBotToggle />
        </div>
      ) : null}
    </>
  );
}

export function useHuyWorkspaceCommands(
  keybindings: ResolvedKeybindingsConfig,
  flowAvailable: boolean,
) {
  const sidebar = useSidebar();
  const sidebarRef = useRef(sidebar);
  useLayoutEffect(() => {
    sidebarRef.current = sidebar;
  });
  useEffect(
    () =>
      registerAppCommands((command) => {
        if (command === "crew.toggle") {
          useCrewStore.getState().toggle();
          return true;
        }
        if (command === "flow.toggle" && flowAvailable) {
          toggleFlowMode(sidebarRef.current);
          return true;
        }
        if (command === "flow.overview.toggle" && flowAvailable) {
          toggleFlowOverview(sidebarRef.current);
          return true;
        }
        return false;
      }),
    [flowAvailable],
  );
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        (event.target instanceof HTMLElement && event.target.closest("[data-keybinding-capture]"))
      )
        return;
      const command = resolveShortcutCommand(event, keybindings, {
        context: { terminalFocus: isTerminalFocused() },
      });
      if (
        (command === "crew.toggle" ||
          command === "flow.toggle" ||
          command === "flow.overview.toggle") &&
        runAppCommand(command)
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [keybindings]);
}
