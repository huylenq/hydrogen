import { registerAppCommands } from "~/appCommands";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  type PreviewPanelInlineSize,
  usePreviewPanelInlineSize,
} from "~/hooks/usePreviewPanelInlineSize";
import { RESIZABLE_WIDTH_PROPERTY } from "~/hooks/useResizableWidth";
import { workspaceAreaProps } from "../../lib/workspaceFocus";
import { cn } from "~/lib/utils";

import { RightPanelResizeHandle } from "./RightPanelResizeHandle";

export type PreviewPanelMode = "inline" | "sheet" | "sidebar" | "embedded";

/** How far one `rightPanel.widen`/`rightPanel.narrow` press moves the divider; held keys repeat it. */
const KEYBOARD_RESIZE_STEP = 80;

/**
 * Shell for the preview panel. In inline mode the panel is user-resizable
 * via a drag handle on the left edge; width persists per browser. In
 * sheet/sidebar modes the parent owns the size.
 */
interface PreviewPanelShellProps {
  workspaceArea?: boolean;
  workspaceFocusKey?: string;
  workspaceLabel?: string;
  mode: PreviewPanelMode;
  modalSurface?: "rightPanel";
  maximized?: boolean;
  inlineSize?: PreviewPanelInlineSize;
  open?: boolean;
  /** Use a distinct key per surface to keep remembered widths independent. */
  widthStorageKey?: string;
  defaultWidth?: number;
  children: ReactNode;
}

export function PreviewPanelShell(props: PreviewPanelShellProps) {
  if (props.inlineSize) {
    return <PreviewPanelShellFrame {...props} inlineSize={props.inlineSize} />;
  }

  return <ResizablePreviewPanelShell {...props} />;
}

function ResizablePreviewPanelShell(props: PreviewPanelShellProps) {
  const inlineSize = usePreviewPanelInlineSize({
    enabled: props.mode === "inline" && !props.maximized,
    widthStorageKey: props.widthStorageKey,
    defaultWidth: props.defaultWidth,
  });
  return <PreviewPanelShellFrame {...props} inlineSize={inlineSize} />;
}

function PreviewPanelShellFrame(
  props: PreviewPanelShellProps & { inlineSize: PreviewPanelInlineSize },
) {
  const panelArea = workspaceAreaProps("panel", 4, props.workspaceLabel ?? "Workspace panel");
  const isInline = props.mode === "inline";
  const collapsible = isInline && props.open !== undefined;
  const open = props.open ?? true;
  const maximized = props.maximized ?? false;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const returnedFocus = useRef(false);
  const { width, handlers, observeRow, resizeBy } = props.inlineSize;
  const keyboardResizable = props.modalSurface === "rightPanel" && isInline && open && !maximized;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Registers resize shortcuts only while the mounted panel has a user-controlled inline width.
  useEffect(() => {
    if (!keyboardResizable) return;
    return registerAppCommands((command) => {
      if (command !== "rightPanel.widen" && command !== "rightPanel.narrow") return false;
      resizeBy(command === "rightPanel.widen" ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP);
      return true;
    });
  }, [keyboardResizable, resizeBy]);
  // Width animates only for an open or close. Any other width change disables
  // the transition in the same commit that changes the width, so the browser
  // never starts one; the next open or close re-enables it in its own commit,
  // so nothing waits for a paint.
  const [widthTransition, setWidthTransition] = useState(() => ({
    open,
    width,
    maximized,
    enabled: true,
  }));
  if (
    widthTransition.open !== open ||
    widthTransition.width !== width ||
    widthTransition.maximized !== maximized
  ) {
    setWidthTransition({
      open,
      width,
      maximized,
      enabled: widthTransition.open !== open,
    });
  }
  const suppressWidthTransition = collapsible && !widthTransition.enabled;
  const attachHost = (host: HTMLDivElement) => {
    hostRef.current = host;
    const stopObservingRow = observeRow(host);
    return () => {
      hostRef.current = null;
      stopObservingRow();
    };
  };
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- on unmount, returns DOM focus to the panel toggle if removal dropped it on the body
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !collapsible) return;
    return () => {
      if (!host.contains(host.ownerDocument.activeElement) && !returnedFocus.current) return;
      // Unmount moves the toggle; restore focus at its committed location if removal sent focus to body.
      queueMicrotask(() => {
        if (host.ownerDocument.activeElement === host.ownerDocument.body) {
          host.ownerDocument.querySelector<HTMLButtonElement>("[data-right-panel-toggle]")?.focus();
        }
      });
    };
  }, [collapsible, hostRef]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- moves focus to the toggle and sets inert on the host DOM node before a collapse paints
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const collapsed = collapsible && !open;
    if (!collapsed) returnedFocus.current = false;
    // Move focus before making its current owner inert, while the toggle is reachable.
    if (collapsed && host.contains(host.ownerDocument.activeElement)) {
      const toggle = host.ownerDocument.querySelector<HTMLButtonElement>(
        "[data-right-panel-toggle]",
      );
      toggle?.focus();
      returnedFocus.current = toggle !== null && host.ownerDocument.activeElement === toggle;
    }
    host.toggleAttribute("inert", collapsed);
  }, [collapsible, open, hostRef]);
  return (
    <div
      ref={attachHost}
      {...(props.workspaceArea ? panelArea : {})}
      data-workspace-focus-key={props.workspaceFocusKey}
      data-workspace-unavailable={collapsible && !open ? "true" : undefined}
      className={cn(
        "relative flex h-full min-h-0 min-w-0 max-w-full flex-col self-stretch bg-background",
        isInline
          ? maximized
            ? // Maximizing meets the sidebar border or window edge; omit the duplicate border.
              "flex-1"
            : "shrink-0 border-l border-border"
          : "w-full",
        collapsible &&
          "[[data-panel-animations=true]_&]:transition-[width] [[data-panel-animations=true]_&]:duration-(--panel-animation-duration) [[data-panel-animations=true]_&]:ease-out",
        collapsible && open && "[[data-panel-animations=true]_&]:starting:w-0!",
        collapsible && !open && "pointer-events-none",
      )}
      style={
        isInline
          ? ({
              [RESIZABLE_WIDTH_PROPERTY]: `${width}px`,
              width: maximized
                ? "100%"
                : collapsible && !open
                  ? "0px"
                  : `var(${RESIZABLE_WIDTH_PROPERTY})`,
              transitionDuration: suppressWidthTransition ? "0ms" : undefined,
            } as CSSProperties)
          : undefined
      }
      data-modal-surface={props.modalSurface}
      tabIndex={props.modalSurface ? -1 : undefined}
      aria-label={props.modalSurface ? "Right panel" : undefined}
      data-preview-panel-mode={props.mode}
      data-preview-panel-maximized={maximized ? "true" : "false"}
    >
      {isInline && !maximized ? <RightPanelResizeHandle handlers={handlers} /> : null}
      <div className={cn("h-full min-h-0 w-full", collapsible && "overflow-clip")}>
        <div
          className="flex h-full min-h-0 min-w-0 flex-col"
          style={
            collapsible && !maximized
              ? { width: `calc(var(${RESIZABLE_WIDTH_PROPERTY}) - 1px)` }
              : undefined
          }
        >
          {props.children}
        </div>
      </div>
    </div>
  );
}
