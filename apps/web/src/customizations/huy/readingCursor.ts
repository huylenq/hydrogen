import { create } from "zustand";
import { assistantTextRange } from "../../lib/assistantTextSelection";
import { readingSectionMarker } from "./readingStops";

const READING_LAMP_STORAGE_KEY = "t3code:reading-lamp:v1";

function readInitialReadingLamp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(READING_LAMP_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/** Vim `zi`: dim the conversation except the block being read. A per-client preference. */
export const useReadingLampStore = create<{ readonly on: boolean }>(() => ({
  on: readInitialReadingLamp(),
}));

export function toggleReadingLamp(): void {
  useReadingLampStore.setState((state) => ({ on: !state.on }));
}

useReadingLampStore.subscribe((state, previous) => {
  if (state.on === previous.on || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(READING_LAMP_STORAGE_KEY, String(state.on));
  } catch {
    // Storage failure must not make reading unusable.
  }
});

let markedRoot: HTMLElement | null = null;
// The cursor's element first, then its ancestors up to its timeline row.
let markedPath: HTMLElement[] = [];
let barFrame: HTMLElement | null = null;
const BAR_VARS = ["--reading-bar-top", "--reading-bar-height", "--reading-bar-left"] as const;
/** Gap between the bar and the text it marks. */
const BAR_GAP = 10;
// The bar follows its block as the block, or anything above it in its row, changes size, and as
// the row's frame resizes: a narrower chat recenters the text column without resizing it.
const barObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measureBar);

function measureBar(): void {
  const cursor = markedPath[0];
  if (!cursor || !barFrame) return;
  const frame = barFrame.getBoundingClientRect();
  const rect = cursor.getBoundingClientRect();
  // Answer blocks, list items included, share their text column's edge, and changed-files rows
  // their card's; any other row uses its own.
  const edge = (
    cursor.closest(".chat-markdown, [data-changed-files-state]") ?? cursor
  ).getBoundingClientRect().left;
  const [top, height, left] = BAR_VARS;
  barFrame.style.setProperty(top, `${rect.top - frame.top}px`);
  barFrame.style.setProperty(height, `${rect.height}px`);
  barFrame.style.setProperty(left, `${Math.max(0, edge - frame.left - BAR_GAP)}px`);
}

// The content lane clips anything left of the text, so the row's frame draws the bar. A user
// message's highlighted bubble border marks the cursor instead.
function placeBar(): void {
  const cursor = markedPath[0];
  const frame =
    cursor && !cursor.hasAttribute("data-user-message-bubble")
      ? cursor.closest<HTMLElement>(".messages-timeline-row-frame")
      : null;
  barObserver?.disconnect();
  if (barFrame && barFrame !== frame) {
    barFrame.removeAttribute("data-reading-bar");
    for (const name of BAR_VARS) barFrame.style.removeProperty(name);
  }
  barFrame = frame;
  if (!cursor || !frame) return;
  frame.setAttribute("data-reading-bar", "");
  measureBar();
  barObserver?.observe(cursor);
  barObserver?.observe(frame);
  const row = markedPath.at(-1);
  if (row && row !== cursor) barObserver?.observe(row);
}

/**
 * Shows the reading cursor inside `root`: a bar beside the cursor's block plus a faint tint, or
 * with the lamp, every row and sibling off its path dimmed. On a user message the cursor
 * highlights the bubble's border instead of drawing a bar. A null stop hides the cursor.
 */
export function markReadingCursor(
  root: HTMLElement | null,
  stop: HTMLElement | null,
  lamp: boolean,
): void {
  const cursor = stop?.querySelector<HTMLElement>("[data-user-message-bubble]") ?? stop;
  const path: HTMLElement[] = [];
  for (let node = root ? cursor : null; node && root?.contains(node); node = node.parentElement) {
    path.push(node);
    if (node.hasAttribute("data-timeline-row-id")) break;
  }
  if (markedRoot !== root || path.length === 0) markedRoot?.removeAttribute("data-reading");
  markedRoot = root;
  if (root && path.length > 0) root.dataset.reading = lamp ? "lamp" : "cursor";
  if (path.length === markedPath.length && path.every((node, index) => node === markedPath[index]))
    // The block can move without resizing, as when its tool group scrolls.
    return measureBar();
  // A marker flash belongs to the block it explains.
  endMarkerFlash();
  for (const node of markedPath) {
    node.removeAttribute("data-reading-cursor");
    node.removeAttribute("data-reading-path");
  }
  path.forEach((node, index) =>
    node.setAttribute(index === 0 ? "data-reading-cursor" : "data-reading-path", ""),
  );
  markedPath = path;
  placeBar();
}

/**
 * Briefly strengthens the cursor's tint, or flashes a user message's border, as a landing starts
 * so the eye can follow the block.
 */
export function pulseReadingCursor(): void {
  const cursor = markedPath[0];
  // The lamp already marks the block; a pulse it cannot show would never end.
  if (!cursor || markedRoot?.dataset.reading === "lamp") return;
  cursor.removeAttribute("data-reading-landed");
  void cursor.offsetWidth; // Restart the animation when landing on the same block again.
  cursor.setAttribute("data-reading-landed", "");
  const settle = () => {
    cursor.removeAttribute("data-reading-landed");
    cursor.removeEventListener("animationend", settle);
    cursor.removeEventListener("animationcancel", settle);
  };
  // Turning the lamp on cancels the pulse instead of ending it.
  cursor.addEventListener("animationend", settle);
  cursor.addEventListener("animationcancel", settle);
}

const MARKER_HIGHLIGHT = "t3-reading-marker";
const MARKER_OPACITY = "--reading-marker-opacity";
let markerFlash: Animation | null = null;

function endMarkerFlash(): void {
  markerFlash?.cancel();
  markerFlash = null;
  if (typeof CSS !== "undefined") CSS.highlights?.delete(MARKER_HIGHLIGHT);
}

/**
 * Shows why `[[`/`]]` stopped on the cursor's block: its heading or bold lead highlights briefly,
 * like a cited quote. A user message flashes its border, and a plain message start pulses.
 */
export function flashReadingMarker(): void {
  const cursor = markedPath[0];
  const marker = cursor ? readingSectionMarker(cursor) : null;
  const range = marker ? assistantTextRange(marker) : null;
  const registry = typeof CSS !== "undefined" ? CSS.highlights : undefined;
  if (!markedRoot || !range || !registry || typeof Highlight === "undefined")
    return pulseReadingCursor();
  endMarkerFlash();
  registry.set(MARKER_HIGHLIGHT, new Highlight(range));
  // The highlight reads its strength from an inherited property the root animates.
  const flash = markedRoot.animate(
    [
      { [MARKER_OPACITY]: 0 },
      { offset: 0.15, [MARKER_OPACITY]: 0.4 },
      { offset: 0.6, [MARKER_OPACITY]: 0.4 },
      { [MARKER_OPACITY]: 0 },
    ],
    { duration: 1200, easing: "ease-in-out" },
  );
  markerFlash = flash;
  void flash.finished.then(
    () => {
      if (markerFlash === flash) endMarkerFlash();
    },
    () => {},
  );
}
