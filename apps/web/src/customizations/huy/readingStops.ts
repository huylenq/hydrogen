import type { LegendListRef } from "@legendapp/list/react";
import type { MessagesTimelineRow } from "../../components/chat/MessagesTimeline.logic";

/**
 * Vim reading motions move the reading cursor between stops: `j`/`k` visit every stop, `[[`/`]]` the section
 * starts, and `J`/`K` the user messages. An answer's stops are its top-level markdown blocks,
 * with list items counted separately, then its changed-files card's header and each visible folder
 * and file; an expanded tool group's stops are its tool calls; every other timeline row is a
 * single stop.
 */
export interface ReadingStop {
  readonly key: string;
  readonly rowId: string;
  /** Identity among the row's stops (see RowReadingStop), stable while the row is unmounted. */
  readonly block: string;
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
/** `zt`/`zb` place a block nearer the edge than the band, leaving just a sliver of context. */
const PLACEMENT_MARGIN_FRACTION = 0.05;
/** Half a line: a block clipped by less still reads as fully visible. */
const VISIBLE_SLACK = 8;

/** The part of the readable area the cursor lives in, clear of the scroll margins. */
function readingBand(view: ReadingView): ReadingView {
  const margin = (view.bottom - view.top) * SCROLL_MARGIN_FRACTION;
  return { top: view.top + margin, bottom: view.bottom - margin };
}

/** Which edge of a block a landing aligns. */
export type ReadingEdge = "top" | "center" | "bottom";

/**
 * Vim `zt`/`zz`/`zb`: the line, as a scroll offset, that the cursor's block `edge` lands on.
 * `zt` and `zb` stop just short of the readable area's edges, outside the band.
 */
export function readingPlacementLine(view: ReadingView, edge: ReadingEdge): number {
  const margin = (view.bottom - view.top) * PLACEMENT_MARGIN_FRACTION;
  return edge === "top"
    ? view.top + margin
    : edge === "bottom"
      ? view.bottom - margin
      : (view.top + view.bottom) / 2;
}

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

/**
 * One of a row's stops. `block` identifies it among them: what can open, close, or scroll away
 * in place keeps an identity of its own (a changed file's path, a tool call's list index), and
 * everything else its position.
 */
export interface RowReadingStop {
  readonly element: HTMLElement;
  readonly section: boolean;
  readonly turn: boolean;
  readonly block: string;
}

/** The block of a row's first stop, where reading enters a row it has not measured yet. */
export const ROW_START_BLOCK = "0";

export function rowReadingStops(row: HTMLElement): RowReadingStop[] {
  const kind = row.dataset.timelineRowKind;
  const role = row.dataset.messageRole;
  if (!isReadableRow(kind, role)) return [];
  // An expanded tool group lists its calls in a virtualized list that recycles its rows, so each
  // call is known by its list index.
  const toolCalls =
    kind === "work" ? row.querySelector<HTMLElement>("[data-tool-group-scroll]") : null;
  if (toolCalls) {
    // Legend parks spare rows millions of pixels away, still holding their last entry.
    const listTop = toolCalls.getBoundingClientRect().top;
    const calls = [...toolCalls.querySelectorAll<HTMLElement>("[data-work-entry-index]")]
      .filter((element) => Math.abs(element.getBoundingClientRect().top - listTop) < 1e6)
      .map((element) => ({ element, index: Number(element.dataset.workEntryIndex) }))
      .toSorted((left, right) => left.index - right.index)
      .map(({ element, index }) => ({
        element,
        section: false,
        turn: false,
        block: toolCallBlock(index),
      }));
    if (calls.length > 0) return calls;
  }
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
    const section = kind === "message" || kind === "proposed-plan";
    return [{ element: row, section, turn, block: ROW_START_BLOCK }];
  }
  return [
    ...blocks.map((element, index) => ({
      element: element as HTMLElement,
      section: index === 0 || readingSectionMarker(element as HTMLElement) !== null,
      turn: false,
      block: String(index),
    })),
    ...changedFilesStops(row),
  ];
}

export const toolCallBlock = (index: number) => `call:${index}`;

/** The list index of a tool call stop, or null for any other stop. */
export function toolCallIndex(block: string): number | null {
  return block.startsWith("call:") ? Number(block.slice("call:".length)) : null;
}

/**
 * The turn's changed-files card closes an answer as its own section, read row by row. Folders
 * and files are known by path, so opening or closing a folder above the cursor keeps it in place.
 */
function changedFilesStops(row: HTMLElement): RowReadingStop[] {
  const card = row.querySelector<HTMLElement>("[data-changed-files-state]");
  if (!card) return [];
  return [
    ...card.querySelectorAll<HTMLElement>(
      "[data-changed-files-header], [data-changed-files-entry]",
    ),
  ].map((element) => {
    const path = element.dataset.changedFilesPath;
    return {
      element,
      section: path === undefined,
      turn: false,
      block: path === undefined ? "files" : `files:${path}`,
    };
  });
}

/** Rows that open and close as a whole: a turn fold, a tool group, a single tool call. */
const DISCLOSURE_ROW_KINDS = new Set(["turn-fold", "work-toggle", "work-live", "work"]);
/** Of those, the rows whose opened content follows as rows of its own. */
const GROUP_ROW_KINDS = new Set(["turn-fold", "work-toggle", "work-live"]);

/** The control that opens and closes `element`: its own, or its whole row's. */
function disclosureOf(element: HTMLElement): HTMLElement | null {
  if (element.matches("[data-work-entry-index]"))
    return element.querySelector<HTMLElement>("[aria-expanded]");
  const kind = element.dataset.timelineRowKind;
  return kind && DISCLOSURE_ROW_KINDS.has(kind)
    ? element.querySelector<HTMLElement>("[aria-expanded]")
    : null;
}

const isExpanded = (control: HTMLElement) => control.getAttribute("aria-expanded") === "true";

/**
 * The control Enter clicks on the cursor's stop: a changed file opens its diff, a folder toggles,
 * the card's header opens the turn's full diff, and a turn fold, tool group, or tool call toggles.
 */
export function readingStopControl(element: HTMLElement): HTMLElement | null {
  if (element.matches("[data-changed-files-entry]")) return element;
  if (element.matches("[data-changed-files-header]"))
    return element.querySelector<HTMLElement>("[data-changed-files-open]");
  return disclosureOf(element);
}

/**
 * Where `h`/`l` take the reading cursor: a click on a control, another stop (`element`, or the
 * start of row `rowId` when null), or the next stop.
 */
export type ReadingTreeMotion =
  | { kind: "click"; control: HTMLElement }
  | { kind: "move"; rowId: string; element: HTMLElement | null }
  | { kind: "next" }
  | { kind: "none" };

function rowIdOf(element: HTMLElement): string | null {
  return element.closest<HTMLElement>("[data-timeline-row-id]")?.dataset.timelineRowId ?? null;
}

const moveTo = (element: HTMLElement | null): ReadingTreeMotion => {
  const rowId = element ? rowIdOf(element) : null;
  return element && rowId ? { kind: "move", rowId, element } : { kind: "none" };
};

/**
 * Vim `h`/`l` on what folds, like a file tree. In a changed-files card `l` opens a file's diff or
 * the header's full diff, expands a folder, or steps into an expanded one; `h` collapses an
 * expanded folder or steps out to the enclosing folder, then the header. A turn fold ("Worked
 * for …") or tool group ("Ran 3 commands") expands with `l`, which then steps into what it
 * reveals, and collapses with `h`; a tool call opens and closes its output the same way, and `h`
 * on a closed one steps out to its group. `h` from anything an open turn fold reveals steps back
 * out to the fold. Null when `element` is in none of these.
 */
export function readingTreeMotion(
  element: HTMLElement,
  motion: "in" | "out",
): ReadingTreeMotion | null {
  const card = element.closest<HTMLElement>("[data-changed-files-state]");
  if (card) {
    const folder = element.dataset.changedFilesEntry === "directory";
    const expanded = folder && isExpanded(element);
    if (motion === "in") {
      if (!expanded) {
        const control = readingStopControl(element);
        return control ? { kind: "click", control } : { kind: "none" };
      }
      return moveTo(
        element.parentElement?.querySelector<HTMLElement>(
          ":scope > div [data-changed-files-entry]",
        ) ?? null,
      );
    }
    if (expanded) return { kind: "click", control: element };
    // From the header, step out of the turn fold the answer sits in, if any.
    if (!element.matches("[data-changed-files-entry]"))
      return turnFoldExit(element) ?? { kind: "none" };
    // A folder's own wrapper carries the folder marker, so look above it.
    const parent = (folder ? element.parentElement : element)?.parentElement?.closest(
      "[data-changed-files-folder]",
    );
    return moveTo(
      parent
        ? parent.querySelector<HTMLElement>(":scope > [data-changed-files-entry]")
        : card.querySelector<HTMLElement>("[data-changed-files-header]"),
    );
  }
  const control = disclosureOf(element);
  const toolCall = element.matches("[data-work-entry-index]");
  if (control) {
    const expanded = isExpanded(control);
    if (motion === "out") {
      if (expanded) return { kind: "click", control };
      return (toolCall ? toolGroupExit(element) : turnFoldExit(element)) ?? { kind: "none" };
    }
    if (!expanded) return { kind: "click", control };
    return GROUP_ROW_KINDS.has(element.dataset.timelineRowKind ?? "")
      ? { kind: "next" }
      : { kind: "none" };
  }
  // A tool call with nothing to open still steps out to its group.
  if (toolCall) return (motion === "out" ? toolGroupExit(element) : null) ?? { kind: "none" };
  return motion === "out" ? turnFoldExit(element) : null;
}

/** Back out of a tool call to its group's header row; the caller finds it. */
function toolGroupExit(element: HTMLElement): ReadingTreeMotion | null {
  const rowId = element.closest<HTMLElement>("[data-tool-group-header]")?.dataset.toolGroupHeader;
  return rowId ? { kind: "move", rowId, element: null } : null;
}

/** Back out to the turn fold row that revealed `element`'s row; the caller finds it. */
function turnFoldExit(element: HTMLElement): ReadingTreeMotion | null {
  const runId = element.closest<HTMLElement>("[data-turn-fold]")?.dataset.turnFold;
  return runId ? { kind: "move", rowId: `turn-fold:${runId}`, element: null } : null;
}

/**
 * Where a stop sits in the conversation. The changed-files header sticks while its card scrolls
 * past, so it measures from its card's top, where it sits unstuck.
 */
export function readingStopRect(element: HTMLElement): { top: number; height: number } {
  const { top, height } = element.getBoundingClientRect();
  const card = element.matches("[data-changed-files-header]")
    ? element.closest("[data-changed-files-state]")
    : null;
  return { top: card ? card.getBoundingClientRect().top : top, height };
}

/** Measures mounted rows, in list order; Legend positions rows absolutely, so DOM order is not. */
function measureRows(
  list: LegendListRef,
  node: HTMLElement,
  include: (rect: DOMRect) => boolean,
): { stops: Map<number, ReadingStop[]>; origin: number | null } {
  const state = list.getState();
  const nodeTop = node.getBoundingClientRect().top;
  const offset = (rect: { top: number }) => rect.top - nodeTop + node.scrollTop;
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
      rowReadingStops(element).flatMap((stop) => {
        const rect = readingStopRect(stop.element);
        if (rect.height === 0) return [];
        const top = offset(rect);
        return [
          {
            key: `${rowId}#${stop.block}`,
            rowId,
            block: stop.block,
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
 * at the list's estimated position so `[[`/`]]` and `J`/`K` can reach it; its inner sections appear
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
      key: `${row.id}#${ROW_START_BLOCK}`,
      rowId: row.id,
      block: ROW_START_BLOCK,
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

/**
 * The mounted stop `stop` names. A row entered at its start before it was measured resolves to
 * its first stop, whatever that is known by.
 */
export function findReadingStop(
  node: HTMLElement,
  stop: Pick<ReadingStop, "rowId" | "block">,
): RowReadingStop | null {
  const row = node.querySelector<HTMLElement>(`[data-timeline-row-id="${CSS.escape(stop.rowId)}"]`);
  const own = row ? rowReadingStops(row) : [];
  return (
    own.find((candidate) => candidate.block === stop.block) ??
    (stop.block === ROW_START_BLOCK ? (own[0] ?? null) : null)
  );
}

export function findReadingStopElement(
  node: HTMLElement,
  stop: Pick<ReadingStop, "rowId" | "block">,
): HTMLElement | null {
  return findReadingStop(node, stop)?.element ?? null;
}

/**
 * Where reading starts without a cursor: reading down, the first stop that begins on screen;
 * reading up, the last stop that ends on screen.
 */
export function readingAnchor(
  stops: ReadonlyArray<Pick<ReadingStop, "top" | "bottom">>,
  view: ReadingView,
  direction: ReadingDirection = "next",
): number {
  let covering = -1;
  if (direction === "previous") {
    for (let index = stops.length - 1; index >= 0; index -= 1) {
      const stop = stops[index]!;
      const bottom = stop.bottom ?? stop.top;
      if (bottom > view.bottom + 1) {
        covering = index;
        continue;
      }
      return bottom >= view.top || covering < 0 ? index : covering;
    }
    return covering;
  }
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
 * The row the latest answer starts at: the first assistant message after the last user message,
 * outside an open turn fold. -1 without one.
 */
export function latestAnswerRow(rows: readonly MessagesTimelineRow[]): number {
  let answer = -1;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]!;
    if (row.kind !== "message") continue;
    if (row.message.role === "user") break;
    if (row.message.role === "assistant" && !row.turnFoldRunId) answer = index;
  }
  return answer;
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
 * past the bottom edge. Without a cursor, `j`/`k` first show it where reading starts, except that
 * `j` starts an unread answer that has begun on screen or above it at the answer's beginning.
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
  /** Index of the first stop of an answer the cursor has not been on yet, or -1. */
  unreadAnswer?: number;
}):
  | { kind: "move"; index: number }
  | { kind: "land"; index: number; edge: "top" | "bottom"; line: number }
  | { kind: "page"; distance: number }
  | null {
  const { stops, granularity, direction, view } = input;
  const readable = view.bottom - view.top;
  const band = readingBand(view);
  let cursor = input.cursor;
  if (cursor < 0) {
    // Jumps go on from where reading starts.
    cursor = readingAnchor(stops, view, granularity === "block" ? direction : "next");
    if (cursor < 0) return null;
    const answer = input.unreadAnswer ?? -1;
    // An unread answer that has begun by the bottom of the screen is read from its beginning.
    if (
      granularity === "block" &&
      direction === "next" &&
      answer >= 0 &&
      stops[answer]!.top <= view.bottom
    )
      return stops[answer]!.top >= view.top - VISIBLE_SLACK
        ? { kind: "move", index: answer }
        : { kind: "land", index: answer, edge: "top", line: band.top };
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
