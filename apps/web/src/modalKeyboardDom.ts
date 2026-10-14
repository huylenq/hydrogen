import { runAppCommand } from "./appCommands";
import { enterPanelContent } from "./customizations/huy/panelFocus";
import {
  modalReturnIndex,
  modalTargetIndex,
  type ModalMotion,
} from "@t3tools/client-runtime/keyboard";

import {
  rememberModalSurface,
  requestModalFocus,
  useModalKeyboardStore,
  type ModalSurface,
} from "./modalKeyboardStore";

type GridMotion = Extract<ModalMotion, "left" | "right" | "next" | "previous">;
type GridRect = Pick<DOMRect, "bottom" | "left" | "right" | "top">;

/** Follow the rendered grid rather than assuming a column count across responsive wraps. */
export function modalGridTargetIndex(
  rects: ReadonlyArray<GridRect>,
  current: number,
  motion: GridMotion,
): number | null {
  const origin = rects[current];
  if (!origin) return null;
  const originX = (origin.left + origin.right) / 2;
  const originY = (origin.top + origin.bottom) / 2;
  const horizontal = motion === "left" || motion === "right";
  const candidates = rects.flatMap((rect, index) => {
    if (index === current) return [];
    const x = (rect.left + rect.right) / 2;
    const y = (rect.top + rect.bottom) / 2;
    const deltaX = x - originX;
    const deltaY = y - originY;
    const sameRow = rect.top < origin.bottom && rect.bottom > origin.top;
    const inDirection =
      motion === "left"
        ? sameRow && deltaX < 0
        : motion === "right"
          ? sameRow && deltaX > 0
          : motion === "previous"
            ? rect.bottom <= origin.top
            : rect.top >= origin.bottom;
    if (!inDirection) return [];
    return [
      {
        index,
        primary: Math.abs(horizontal ? deltaX : deltaY),
        secondary: Math.abs(horizontal ? deltaY : deltaX),
      },
    ];
  });
  candidates.sort(
    (left, right) =>
      left.primary - right.primary || left.secondary - right.secondary || left.index - right.index,
  );
  return candidates[0]?.index ?? null;
}

const EDITABLE =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], diffs-container:not([data-diff-vim] diffs-container), iframe';
const OVERLAY =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [data-slot="select-popup"], [role="listbox"], [data-slot="popover-popup"], [data-slot="combobox-popup"], [data-slot="autocomplete-popup"], [data-command-palette]';

export function modalEventIsEmbedded(event: Event): boolean {
  return event
    .composedPath()
    .some(
      (target) =>
        target instanceof Element &&
        target.closest(
          "diffs-container, iframe, webview, [data-right-panel-surface-content], [data-crew-panel]",
        ),
    );
}

/** Question controls own their keys until focus leaves the expanded panel. */
export function modalEventIsQuestion(event: Event): boolean {
  return event
    .composedPath()
    .some(
      (target) =>
        target instanceof Element && target.closest('[data-modal-question-panel="active"]'),
    );
}

export function modalEventIsEditable(event: Event): boolean {
  return event
    .composedPath()
    .some((target) => target instanceof Element && target.closest(EDITABLE));
}

export function modalOverlayOpen(): boolean {
  return [...document.querySelectorAll<HTMLElement>(OVERLAY)].some(
    (node) =>
      !node.hasAttribute("data-modal-right-panel-sheet") &&
      !node.hasAttribute("data-modal-keyboard-nonblocking") &&
      node.dataset.modalSurface !== "sidebar" &&
      node.getClientRects().length > 0,
  );
}

export function modalSurfaceRoot(surface: ModalSurface): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-modal-surface="${surface}"]`);
}

/** Flow actions target the focused session; ordinary conversation actions use the open thread. */
export function flowSessionActionTarget(openThread: { key: string; title: string } | null) {
  const focused = document.activeElement;
  const session = focused?.closest<HTMLElement>("[data-flow-session-key]");
  const key = session?.dataset.flowSessionKey;
  if (key) return { key, title: session.dataset.flowSessionName ?? "Session" };
  // A grid root or the bench's +N control does not stand for the hidden route's thread.
  if (focused?.closest('[data-modal-surface="flow"], [data-modal-grid="working-sessions"]'))
    return null;
  return openThread;
}

export function modalSurfaceItems(surface: ModalSurface): HTMLElement[] {
  const root = modalSurfaceRoot(surface);
  if (!root) return [];
  const selector =
    surface === "flow"
      ? "[data-flow-card]"
      : surface === "rightPanel"
        ? "[data-modal-panel-tab]"
        : surface === "sidebar"
          ? '[data-thread-item] [role="button"][tabindex="0"], [data-testid="sidebar-draft-row"], a[href^="/settings"]'
          : "[data-modal-item]";
  return [...root.querySelectorAll<HTMLElement>(selector)].filter(
    (node) =>
      !node.matches(":disabled") &&
      !node.closest("[inert], [hidden]") &&
      node.getClientRects().length > 0,
  );
}

function itemKey(node: HTMLElement, index: number): string {
  return (
    node.dataset.modalKey ??
    node.closest<HTMLElement>("[data-modal-key]")?.dataset.modalKey ??
    node.getAttribute("href") ??
    String(index)
  );
}

export function rememberModalFocus(node: HTMLElement): void {
  const root = node.closest<HTMLElement>("[data-modal-surface]");
  const surface = root?.dataset.modalSurface;
  if (
    surface !== "flow" &&
    surface !== "sidebar" &&
    surface !== "conversation" &&
    surface !== "rightPanel" &&
    surface !== "question"
  )
    return;
  const items = modalSurfaceItems(surface);
  const index = items.findIndex((item) => item === node || item.contains(node));
  rememberModalSurface(surface);
  const state = useModalKeyboardStore.getState();
  if (index >= 0) {
    useModalKeyboardStore.setState({
      bookmarks: {
        ...state.bookmarks,
        [surface]: { key: itemKey(items[index]!, index), index },
      },
    });
  }
}

export function focusModalSurface(surface: ModalSurface, focusRightPanelTabs = false): boolean {
  const root = modalSurfaceRoot(surface);
  if (!root || root.getClientRects().length === 0) return false;
  if (surface === "rightPanel" && !focusRightPanelTabs) {
    if (runAppCommand("rightPanel.enter")) return true;
    // Newly mounted panels may not have registered their command handler yet.
    const content = root.querySelector<HTMLElement>("[data-right-panel-surface-content]");
    if (!content) return false;
    const target = enterPanelContent(
      content,
      () =>
        content.querySelector<HTMLElement>(
          '[data-right-panel-launcher], iframe, webview, diffs-container, input:not([disabled]), textarea, [contenteditable="true"], button:not([disabled]), [tabindex="0"]',
        ) ?? content,
    );
    if (!target) return false;
    rememberModalFocus(target);
    return true;
  }
  const items = modalSurfaceItems(surface);
  const index = modalReturnIndex(
    items.map(itemKey),
    useModalKeyboardStore.getState().bookmarks[surface] ?? null,
  );
  const target =
    surface === "rightPanel"
      ? (items.find((item) => item.getAttribute("aria-selected") === "true") ?? root)
      : index === null
        ? root
        : items[index];
  if (!target) return false;
  target.focus({ preventScroll: true });
  if (target !== root)
    target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
  if (document.activeElement !== target) return false;
  rememberModalFocus(target);
  if (
    surface === "rightPanel" &&
    target.hasAttribute("data-modal-panel-tab") &&
    target.getAttribute("aria-selected") !== "true"
  )
    target.click();
  return true;
}

export function moveModalFocus(motion: ModalMotion): void {
  const { surface } = useModalKeyboardStore.getState();
  const root = modalSurfaceRoot(surface);
  const items = modalSurfaceItems(surface);
  const current = items.findIndex(
    (item) => item === document.activeElement || item.contains(document.activeElement),
  );
  if (
    surface === "conversation" &&
    root?.dataset?.modalGrid === "working-sessions" &&
    (motion === "left" || motion === "right" || motion === "next" || motion === "previous")
  ) {
    // Focus can leave the cards (a preview remounts, a route change or app
    // switch leaves it on the grid root or body). The first motion then lands
    // on the remembered card instead of being dropped.
    if (current < 0) {
      focusModalSurface("conversation");
      return;
    }
    const index = modalGridTargetIndex(
      items.map((item) => item.getBoundingClientRect()),
      current,
      motion,
    );
    // Grid edges are hard stops; the sidebar is reachable only via its own binding.
    if (index === null) return;
    const target = items[index];
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
    return;
  }
  // h/l move within an area; `w h` / `w l` (moveModalArea) change areas.
  if (
    (motion === "left" || motion === "right") &&
    (surface === "conversation" || surface === "question" || surface === "sidebar")
  )
    return;
  const index = modalTargetIndex(items.length, current, motion);
  if (index === null) return;
  const target = items[index];
  target?.focus({ preventScroll: true });
  if (surface === "rightPanel") target?.click();
  target?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
}

/** Steps between the sidebar, the main area, and the right panel, stopping at the outer edges. */
export function moveModalArea(direction: "left" | "right"): void {
  const { surface, threadContext } = useModalKeyboardStore.getState();
  if (direction === "left") {
    if (surface === "rightPanel") requestModalFocus("conversation");
    else if (surface !== "sidebar") requestModalFocus("sidebar");
  } else if (surface === "sidebar") requestModalFocus("conversation");
  else if (surface !== "rightPanel" && threadContext) requestModalFocus("rightPanel");
}

/** Only explicit flow/sidebar activation changes the route; movement never does. */
export function activateModalItem(): void {
  const { surface } = useModalKeyboardStore.getState();
  const active = document.activeElement;
  const target = modalSurfaceItems(surface).find((item) => item === active);
  if (!target) {
    // A control tabbed to inside the surface, such as a Flow tile's subagent line or PR link,
    // keeps Enter as its click.
    if (
      active instanceof HTMLElement &&
      active.matches("button, a[href]") &&
      modalSurfaceRoot(surface)?.contains(active)
    )
      active.click();
    return;
  }
  const gridPreview =
    surface === "conversation" &&
    modalSurfaceRoot("conversation")?.dataset.modalGrid === "working-sessions";
  rememberModalFocus(target);
  target.click();
  requestModalFocus(gridPreview ? "conversation" : "sidebar");
}

let returnFocus: { node: HTMLElement; path: string } | null = null;

const COMPOSER_PICKER_TRIGGER =
  'button[data-composer-shortcut], button[data-chat-provider-model-picker="true"]';

function isModalEditable(node: HTMLElement): boolean {
  return node.matches(EDITABLE) || node.closest(EDITABLE) !== null;
}

/** Keep the exact control for transient pickers; disconnected controls use stable surface bookmarks. */
export function captureModalReturnFocus(node: EventTarget | null = document.activeElement): void {
  if (!(node instanceof HTMLElement) || node === document.body || node.closest(OVERLAY)) return;
  // Opening a composer picker focuses its trigger. Keep the control captured before that.
  if (
    node.matches(COMPOSER_PICKER_TRIGGER) &&
    returnFocus?.path === window.location.pathname &&
    returnFocus.node.isConnected &&
    !returnFocus.node.closest("[hidden]")
  ) {
    return;
  }
  rememberModalFocus(node);
  returnFocus = {
    node,
    path: window.location.pathname,
  };
}

function modalReturnFocusTarget(): HTMLElement | null {
  if (!returnFocus || returnFocus.path !== window.location.pathname) return null;
  return returnFocus.node.isConnected && !returnFocus.node.closest("[hidden]")
    ? returnFocus.node
    : null;
}

/** Restore after the popup releases its focus trap, including non-tabbable panel roots. */
export function restoreModalReturnFocus(): boolean {
  const target = modalReturnFocusTarget();
  if (!target) return false;
  if (!isModalEditable(target)) {
    useModalKeyboardStore.setState({ mode: "normal" });
  }
  queueMicrotask(() => {
    if (modalReturnFocusTarget() === target) target.focus({ preventScroll: true });
  });
  return true;
}

/**
 * Vim navigation: closing a model or effort picker returns to the control you
 * left. `false` tells the popup not to move focus. `null` leaves the caller's
 * usual focus in place.
 */
export function modalPickerFinalFocus(modalKeyboardEnabled: boolean): false | null {
  if (!modalKeyboardEnabled) return null;
  if (!restoreModalReturnFocus()) {
    useModalKeyboardStore.setState({ mode: "normal" });
  }
  return false;
}

export function modalEmbeddedReturnSurface(): ModalSurface {
  return document.activeElement instanceof Element &&
    document.activeElement.closest('[data-modal-surface="rightPanel"]')
    ? "rightPanel"
    : "conversation";
}
