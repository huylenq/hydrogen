import { observeResize } from "~/lib/observeResize";
import { useStableCallback } from "~/hooks/useStableCallback";
import { useLayoutEffect, useState } from "react";
import { useCrewStore } from "../../crewStore";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY } from "../../rightPanelLayout";

/** Measure available chat space, including space occupied by the Crew rail and chat. */
export function useHuyWorkspaceGeometry() {
  const compactViewport = useMediaQuery(RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY);
  const mobileViewport = useMediaQuery("max-md");
  const grokBotOpen = useCrewStore((state) => state.open);
  const grokBotChatOpen = useCrewStore((state) => state.chatOpen);
  const [workspace, setWorkspace] = useState<HTMLDivElement | null>(null);
  const workspaceRef = useStableCallback((node: HTMLDivElement | null) => setWorkspace(node));
  const [workspaceLayout, setWorkspaceLayout] = useState<{
    width: number;
    rightInset: number;
  } | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Observes the workspace DOM bounds and window size to keep the right panel usable beside Crew.
  useLayoutEffect(() => {
    if (!workspace) return;
    const measure = () => {
      const bounds = workspace.getBoundingClientRect();
      if (bounds.width === 0) return;
      const width = Math.round(bounds.width);
      const rightInset = Math.max(0, Math.round(window.innerWidth - bounds.right));
      setWorkspaceLayout((current) =>
        current?.width === width && current.rightInset === rightInset
          ? current
          : { width, rightInset },
      );
    };
    measure();
    const stopObserving = observeResize(workspace, measure);
    window.addEventListener("resize", measure);
    return () => {
      stopObserving();
      window.removeEventListener("resize", measure);
    };
  }, [workspace]);
  return {
    workspaceRef,
    workspaceLayout,
    grokBotOpen,
    grokBotChatOpen,
    grokBotFocused: grokBotOpen && grokBotChatOpen && mobileViewport,
    // PreviewPanelShell requires 360px for each of its two columns.
    shouldUseRightPanelSheet:
      compactViewport || (workspaceLayout !== null && workspaceLayout.width < 720),
  };
}
