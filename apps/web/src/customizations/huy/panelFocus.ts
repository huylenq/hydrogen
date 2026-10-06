/**
 * Keyboard focus for right-panel content whose target mounts late: a lazily loaded surface, a
 * viewer that waits for data, or one that remounts. Surfaces register focus anchors; the deepest
 * anchor is the best target (a diff's viewer inside the diff panel).
 *
 * Two states keep focus where the reader asked for it:
 * - An entry intent (`w l`, `r`) lasts until an anchor in the entered content takes focus, the
 *   reader clicks, or focus moves out of that content.
 * - Once an anchor has focus its outermost anchor owns focus: if the focused element unmounts,
 *   focus returns to the best remaining anchor and moves on to a better one when it mounts.
 *
 * Only the modal keyboard enters panels, and surfaces register anchors only while it is on.
 */
const anchors = new Set<HTMLElement>();
let pendingEntry: HTMLElement | null = null;
let owner: HTMLElement | null = null;
let listening = false;

function outermostAnchor(node: Node): HTMLElement | null {
  let found: HTMLElement | null = null;
  for (const anchor of anchors) {
    if (anchor.contains(node) && (!found || anchor.contains(found))) found = anchor;
  }
  return found;
}

function bestAnchor(container: HTMLElement): HTMLElement | null {
  let best: HTMLElement | null = null;
  for (const anchor of anchors) {
    if (!anchor.isConnected || !container.contains(anchor)) continue;
    if (!best || best.contains(anchor)) best = anchor;
  }
  return best;
}

function focusAnchor(anchor: HTMLElement): HTMLElement | null {
  anchor.focus({ preventScroll: true });
  if (document.activeElement !== anchor) return null;
  owner = outermostAnchor(anchor);
  pendingEntry = null;
  return anchor;
}

function reconcile(): void {
  if (pendingEntry && !pendingEntry.isConnected) pendingEntry = null;
  if (owner && !owner.isConnected) owner = null;
  const container = pendingEntry ?? owner;
  if (!container) return;
  const best = bestAnchor(container);
  const active = document.activeElement;
  if (!best || active === best) return;
  const idle = !active || active === document.body;
  const onWeakerAnchor =
    active instanceof HTMLElement && anchors.has(active) && container.contains(active);
  if (pendingEntry || idle || onWeakerAnchor) focusAnchor(best);
}

function onFocusIn(event: FocusEvent): void {
  const target = event.target;
  if (!(target instanceof Node) || target === document.body) return;
  const scope = outermostAnchor(target);
  owner = scope;
  if (pendingEntry && !pendingEntry.contains(target)) pendingEntry = null;
  if (scope) pendingEntry = null;
}

/** A click ends a pending entry; one outside the owner also ends its claim on focus. */
function onPointerDown(event: PointerEvent): void {
  pendingEntry = null;
  if (owner && !(event.target instanceof Node && owner.contains(event.target))) owner = null;
}

function listen(): void {
  if (listening) return;
  listening = true;
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("pointerdown", onPointerDown, true);
}

/** Registers a focus target; a pending entry or an owner whose focus was lost claims it. */
export function registerPanelFocusAnchor(element: HTMLElement): () => void {
  listen();
  anchors.add(element);
  reconcile();
  return () => {
    anchors.delete(element);
    // Unmounting drops focus to the page; hand it to what remains of the owner.
    queueMicrotask(reconcile);
  };
}

/**
 * Enters right-panel content: focuses its best anchor, or `fallback` now and the first anchor
 * that mounts in it later. Returns the element that took focus, if any.
 */
export function enterPanelContent(
  content: HTMLElement,
  fallback: () => HTMLElement,
): HTMLElement | null {
  listen();
  pendingEntry = content;
  const anchor = bestAnchor(content);
  if (anchor) return focusAnchor(anchor);
  const target = fallback();
  target.focus({ preventScroll: true });
  // Our own focusin keeps the entry pending: it landed inside the content.
  return document.activeElement === target ? target : null;
}
