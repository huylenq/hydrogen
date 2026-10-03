import type { LegendListRef } from "@legendapp/list/react";
import type { MessagesTimelineRow } from "../../components/chat/MessagesTimeline.logic";

/**
 * Vim reading motions move the reading cursor between stops: `j`/`k` visit every stop, `h`/`l` the section
 * starts, and `J`/`K` the user messages. An answer's stops are its top-level markdown blocks,
 * with list items counted separately; every other timeline row is a single stop.
 */
export interface ReadingStop {
  readonly key: string;
  readonly rowId: string;
  /** Position among the row's stops, stable while the row is unmounted. */
  readonly block: number;
  /** List index of the row. */
  readonly row: number;
  /** Scroll offsets of the stop's edges. An unmounted row's bottom is unknown. */
  readonly top: number;
  readonly bottom: number | null;
  readonly section: boolean;
  readonly turn: boolean;
}

export type ReadingGranularity = "block" | "section" | "turn";
export type ReadingDirection = "next" | "previous";

/** The comfortably readable part of the viewport, as scroll offsets. */
export interface ReadingView {
  readonly top: number;
  readonly bottom: number;
}

// Clear of the title bar's scroll fade above and the composer below.
const VIEW_TOP_INSET = 24;
const VIEW_BOTTOM_INSET = 8;
/**
 * Like Vim's `scrolloff`: the cursor stays out of the outer fifth at each end of the readable
 * area, so it never rides the edge, and scrolls stay a little under half a screen.
 */
const SCROLL_MARGIN_FRACTION = 0.2;
/** Half a line: a block clipped by less still reads as fully visible. */
const VISIBLE_SLACK = 8;

export function readingView(
  scrollTop: number,
  viewportHeight: number,
  composerInset: number,
): ReadingView {
  return {
    top: scrollTop + VIEW_TOP_INSET,
    bottom: scrollTop + viewportHeight - composerInset - VIEW_BOTTOM_INSET,
  };
}

/** Row elements and the list model both decide readability, so a row counts the same either way. */
function isReadableRow(kind: string | undefined, role: string | undefined): boolean {
  return (
    kind !== "assistant-meta" && (kind !== "message" || role === "user" || role === "assistant")
  );
}

// Agent answers rarely use markdown headings; a paragraph or list item opening in bold
// (`**Root cause:** ...`) is their usual section heading.
function leadingBold(element: Element): HTMLElement | null {
  for (const node of element.childNodes) {
    if (node.nodeType === 3 && !node.textContent?.trim()) continue;
    if (!(node instanceof HTMLElement)) return null;
    if (node.matches("strong, b")) return node;
    return node.matches("p") ? leadingBold(node) : null;
  }
  return null;
}

/** What makes an answer block a section start: its heading or its leading bold text. */
export function readingSectionMarker(block: HTMLElement): HTMLElement | null {
  return block.matches("h1, h2, h3, h4, h5, h6") ? block : leadingBold(block);
}

export function rowReadingStops(
  row: HTMLElement,
): Array<{ element: HTMLElement; section: boolean; turn: boolean }> {
  const kind = row.dataset.timelineRowKind;
  const role = row.dataset.messageRole;
  if (!isReadableRow(kind, role)) return [];
  const markdown =
    kind === "message" && role === "assistant"
      ? row.querySelector<HTMLElement>(".chat-markdown")
      : null;
  const blocks = markdown
    ? [...markdown.children].flatMap((child) =>
        child.matches("ul, ol") ? [...child.children] : [child],
      )
    : [];
  if (blocks.length === 0) {
    const turn = kind === "message" && role === "user";
    return [{ element: row, section: kind === "message" || kind === "proposed-plan", turn }];
  }
  return blocks.map((element, index) => ({
    element: element as HTMLElement,
    section: index === 0 || readingSectionMarker(element as HTMLElement) !== null,
    turn: false,
  }));
}

/** Measures mounted rows, in list order; Legend positions rows absolutely, so DOM order is not. */
function measureRows(
  list: LegendListRef,
  node: HTMLElement,
  include: (rect: DOMRect) => boolean,
): { stops: Map<number, ReadingStop[]>; origin: number | null } {
  const state = list.getState();
  const nodeTop = node.getBoundingClientRect().top;
  const offset = (rect: DOMRect) => rect.top - nodeTop + node.scrollTop;
  const stops = new Map<number, ReadingStop[]>();
  // Scroll offset of list position 0, which includes Legend's header and padding.
  let origin: number | null = null;
  for (const element of node.querySelectorAll<HTMLElement>("[data-timeline-row-id]")) {
    const rowId = element.dataset.timelineRowId ?? "";
    const index = state.indexByKey(rowId);
    if (index === undefined) continue;
    const rowRect = element.getBoundingClientRect();
    const position = state.positionAtIndex(index);
    if (position !== undefined) origin ??= offset(rowRect) - position;
    if (!include(rowRect)) continue;
    stops.set(
      index,
      rowReadingStops(element).flatMap((stop, block) => {
        const rect = stop.element.getBoundingClientRect();
        if (rect.height === 0) return [];
        const top = offset(rect);
        return [
          {
            key: `${rowId}#${block}`,
            rowId,
            block,
            row: index,
            top,
            bottom: top + rect.height,
            section: stop.section,
            turn: stop.turn,
          },
        ];
      }),
    );
  }
  return { stops, origin };
}

/**
 * Mounted rows contribute measured blocks. With `unmounted`, every other row contributes one stop
 * at the list's estimated position so `h`/`l` and `J`/`K` can reach it; its inner sections appear
 * once mounted.
 */
export function collectReadingStops(
  list: LegendListRef,
  node: HTMLElement,
  unmounted: boolean,
): { stops: ReadingStop[]; origin: number | null } {
  const state = list.getState();
  const rows = state.data as readonly MessagesTimelineRow[];
  const { stops: mounted, origin } = measureRows(list, node, (rect) => rect.height > 0);
  if (!unmounted)
    return {
      stops: [...mounted.entries()]
        .sort(([left], [right]) => left - right)
        .flatMap(([, own]) => own),
      origin,
    };
  const stops: ReadingStop[] = [];
  rows.forEach((row, index) => {
    const own = mounted.get(index);
    if (own) {
      stops.push(...own);
      return;
    }
    const position = state.positionAtIndex(index);
    const role = row.kind === "message" ? row.message.role : undefined;
    if (origin === null || position === undefined || !isReadableRow(row.kind, role)) return;
    stops.push({
      key: `${row.id}#0`,
      rowId: row.id,
      block: 0,
      row: index,
      top: origin + position,
      bottom: null,
      section: row.kind === "message" || row.kind === "proposed-plan",
      turn: role === "user",
    });
  });
  return { stops, origin };
}

/** Only the rows on screen, for following scrolls cheaply. */
export function visibleReadingStops(
  list: LegendListRef,
  node: HTMLElement,
  viewportTop: number,
  viewportBottom: number,
): ReadingStop[] {
  const { stops } = measureRows(
    list,
    node,
    (rect) => rect.height > 0 && rect.bottom > viewportTop && rect.top < viewportBottom,
  );
  return [...stops.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([, rowStops]) => rowStops);
}

export function findReadingStopElement(
  node: HTMLElement,
  stop: Pick<ReadingStop, "rowId" | "block">,
): HTMLElement | null {
  const row = node.querySelector<HTMLElement>(`[data-timeline-row-id="${CSS.escape(stop.rowId)}"]`);
  return row ? (rowReadingStops(row)[stop.block]?.element ?? null) : null;
}

/** Where reading starts without a cursor: the first stop that begins on screen. */
export function readingAnchor(
  stops: ReadonlyArray<Pick<ReadingStop, "top">>,
  view: ReadingView,
): number {
  let covering = -1;
  for (const [index, stop] of stops.entries()) {
    if (stop.top < view.top - 1) {
      covering = index;
      continue;
    }
    // A block taller than the screen covers it until the next one begins.
    return stop.top <= view.bottom || covering < 0 ? index : covering;
  }
  return covering;
}

/**
 * Picks the stop a reading motion moves the cursor to. Moving back from partway
 * through an eligible stop returns to its start first.
 */
export function readingJumpIndex(
  eligible: readonly boolean[],
  current: number,
  aligned: boolean,
  direction: ReadingDirection,
): number | null {
  if (direction === "previous" && !aligned && eligible[current]) return current;
  const step = direction === "next" ? 1 : -1;
  for (let index = current + step; index >= 0 && index < eligible.length; index += step)
    if (eligible[index]) return index;
  return null;
}

/**
 * The cursor lives in a band clear of both edges (see SCROLL_MARGIN_FRACTION), and the page stays
 * still while it moves within the band, so most steps do not scroll. A step that would leave the
 * band on the side it is heading scrolls toward where reading is going: stepping on down lands
 * the target's top on the band's top line, and stepping on up lands its bottom on the band's
 * bottom line, so the next several steps need no scroll. A step that reverses direction only
 * brings its target into the band, keeping the block just left in view. Jumps read on from their
 * target, so they land it like a step down. `j` pages half a screen through a block that runs
 * past the bottom edge. Without a cursor, `j`/`k` first show it where reading starts.
 *
 * A landing puts the target's `edge` at `line`, a scroll offset in the same view.
 */
export function resolveReadingStep(input: {
  stops: ReadonlyArray<Pick<ReadingStop, "top" | "bottom" | "section" | "turn">>;
  /** Index of the cursor's stop, or -1. */
  cursor: number;
  granularity: ReadingGranularity;
  direction: ReadingDirection;
  view: ReadingView;
  /** Direction of the previous block step; null after a jump, a scroll, or at the start. */
  trajectory: ReadingDirection | null;
}):
  | { kind: "move"; index: number }
  | { kind: "land"; index: number; edge: "top" | "bottom"; line: number }
  | { kind: "page"; distance: number }
  | null {
  const { stops, granularity, direction, view } = input;
  const readable = view.bottom - view.top;
  const margin = readable * SCROLL_MARGIN_FRACTION;
  const band = { top: view.top + margin, bottom: view.bottom - margin };
  let cursor = input.cursor;
  if (cursor < 0) {
    cursor = readingAnchor(stops, view);
    if (cursor < 0) return null;
    if (granularity === "block") return { kind: "move", index: cursor };
  }
  const current = stops[cursor]!;
  if (
    granularity === "block" &&
    direction === "next" &&
    current.bottom !== null &&
    current.bottom > view.bottom + VISIBLE_SLACK
  )
    return { kind: "page", distance: Math.max(80, readable / 2) };
  const eligible = stops.map(
    (stop) => granularity === "block" || (granularity === "section" ? stop.section : stop.turn),
  );
  const aligned = current.top >= view.top - VISIBLE_SLACK;
  const index = readingJumpIndex(eligible, cursor, aligned, direction);
  if (index === null) return null;
  const target = stops[index]!;
  // Only the band edge being approached matters; the far side may still show the margin.
  const settled =
    target.bottom !== null &&
    (direction === "next"
      ? target.top >= view.top - VISIBLE_SLACK && target.bottom <= band.bottom + VISIBLE_SLACK
      : target.top >= band.top - VISIBLE_SLACK && target.bottom <= view.bottom + VISIBLE_SLACK);
  if (settled) return { kind: "move", index };
  const land = (edge: "top" | "bottom", line: number) =>
    ({ kind: "land", index, edge, line }) as const;
  // A block taller than the band is read from its top.
  const fits = target.bottom !== null && target.bottom - target.top <= band.bottom - band.top;
  if (granularity !== "block" || !fits) return land("top", band.top);
  const reversing = input.trajectory !== null && input.trajectory !== direction;
  return (direction === "next") !== reversing ? land("top", band.top) : land("bottom", band.bottom);
}
