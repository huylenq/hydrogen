import type {
  ExpansionDirections,
  FileDiffMetadata,
  HunkExpansionRegion,
  SelectedLineRange,
  SelectionSide,
} from "@pierre/diffs";

export type DiffVimStyle = "unified" | "split";

interface DiffRowLine {
  readonly lineNumber: number;
  /** Index into the side's `deletionLines` / `additionLines`. */
  readonly lineIndex: number;
}

/**
 * One rendered row, laid out the way Pierre's `iterateOverDiff` lays them out. Unified change rows
 * carry one side; split rows pair a deletion with an addition. Context rows carry both.
 */
export interface DiffRow {
  /** Expanded context above hunk `i` carries `i`; context after the last hunk carries the count. */
  readonly hunk: number;
  readonly kind: "context" | "change" | "expanded";
  /** First row of a hunk's own content: where section and sibling motions stop. */
  readonly start: boolean;
  readonly deletion?: DiffRowLine;
  readonly addition?: DiffRowLine;
}

/** Pierre's default: a collapsed gap this small renders in full. */
const COLLAPSED_CONTEXT_THRESHOLD = 1;

function leadingRegion(
  fileDiff: FileDiffMetadata,
  rangeSize: number,
  region: HunkExpansionRegion | undefined,
) {
  const size = Math.max(rangeSize, 0);
  if (size === 0 || fileDiff.isPartial) return { size, fromStart: 0, fromEnd: 0 };
  if (size <= COLLAPSED_CONTEXT_THRESHOLD) return { size, fromStart: size, fromEnd: 0 };
  const fromStart = Math.min(Math.max(region?.fromStart ?? 0, 0), size);
  const fromEnd = Math.min(Math.max(region?.fromEnd ?? 0, 0), size);
  return fromStart + fromEnd >= size
    ? { size, fromStart: size, fromEnd: 0 }
    : { size, fromStart, fromEnd };
}

function trailingSize(fileDiff: FileDiffMetadata): number {
  const last = fileDiff.hunks.at(-1);
  if (
    !last ||
    fileDiff.isPartial ||
    fileDiff.additionLines.length === 0 ||
    fileDiff.deletionLines.length === 0
  )
    return 0;
  const additions = fileDiff.additionLines.length - (last.additionLineIndex + last.additionCount);
  const deletions = fileDiff.deletionLines.length - (last.deletionLineIndex + last.deletionCount);
  // Pierre refuses mismatched trailing context, so it renders none.
  return additions > 0 && additions === deletions ? additions : 0;
}

/** The rows a file renders under its current context expansions. */
export function diffRows(
  fileDiff: FileDiffMetadata,
  style: DiffVimStyle,
  expanded: ReadonlyMap<number, HunkExpansionRegion>,
): DiffRow[] {
  const rows: DiffRow[] = [];
  const pushContext = (
    hunk: number,
    deletion: DiffRowLine,
    addition: DiffRowLine,
    count: number,
    kind: "context" | "expanded",
    startsHunk: boolean,
  ) => {
    for (let index = 0; index < count; index++) {
      rows.push({
        hunk,
        kind,
        start: startsHunk && index === 0,
        deletion: {
          lineNumber: deletion.lineNumber + index,
          lineIndex: deletion.lineIndex + index,
        },
        addition: {
          lineNumber: addition.lineNumber + index,
          lineIndex: addition.lineIndex + index,
        },
      });
    }
  };
  for (const [hunkIndex, hunk] of fileDiff.hunks.entries()) {
    const leading = leadingRegion(fileDiff, hunk.collapsedBefore, expanded.get(hunkIndex));
    const above = (offset: number) => ({
      deletion: {
        lineNumber: hunk.deletionStart - offset,
        lineIndex: hunk.deletionLineIndex - offset,
      },
      addition: {
        lineNumber: hunk.additionStart - offset,
        lineIndex: hunk.additionLineIndex - offset,
      },
    });
    const top = above(leading.size);
    pushContext(hunkIndex, top.deletion, top.addition, leading.fromStart, "expanded", false);
    const bottom = above(leading.fromEnd);
    pushContext(hunkIndex, bottom.deletion, bottom.addition, leading.fromEnd, "expanded", false);

    let deletion = { lineNumber: hunk.deletionStart, lineIndex: hunk.deletionLineIndex };
    let addition = { lineNumber: hunk.additionStart, lineIndex: hunk.additionLineIndex };
    let first = true;
    for (const content of hunk.hunkContent) {
      if (content.type === "context") {
        pushContext(hunkIndex, deletion, addition, content.lines, "context", first);
        deletion = {
          lineNumber: deletion.lineNumber + content.lines,
          lineIndex: deletion.lineIndex + content.lines,
        };
        addition = {
          lineNumber: addition.lineNumber + content.lines,
          lineIndex: addition.lineIndex + content.lines,
        };
      } else {
        const deletionAt = (index: number) =>
          index < content.deletions
            ? { lineNumber: deletion.lineNumber + index, lineIndex: deletion.lineIndex + index }
            : undefined;
        const additionAt = (index: number) =>
          index < content.additions
            ? { lineNumber: addition.lineNumber + index, lineIndex: addition.lineIndex + index }
            : undefined;
        const changeRows =
          style === "split"
            ? Array.from(
                { length: Math.max(content.deletions, content.additions) },
                (_, index) => ({
                  deletion: deletionAt(index),
                  addition: additionAt(index),
                }),
              )
            : [
                ...Array.from({ length: content.deletions }, (_, index) => ({
                  deletion: deletionAt(index),
                  addition: undefined,
                })),
                ...Array.from({ length: content.additions }, (_, index) => ({
                  deletion: undefined,
                  addition: additionAt(index),
                })),
              ];
        for (const line of changeRows) {
          rows.push({
            hunk: hunkIndex,
            kind: "change",
            start: first,
            ...(line.deletion ? { deletion: line.deletion } : {}),
            ...(line.addition ? { addition: line.addition } : {}),
          });
          first = false;
        }
        deletion = {
          lineNumber: deletion.lineNumber + content.deletions,
          lineIndex: deletion.lineIndex + content.deletions,
        };
        addition = {
          lineNumber: addition.lineNumber + content.additions,
          lineIndex: addition.lineIndex + content.additions,
        };
      }
      if (contentRows(content) > 0) first = false;
    }
    if (hunkIndex === fileDiff.hunks.length - 1) {
      const size = trailingSize(fileDiff);
      const region = expanded.get(fileDiff.hunks.length);
      const count =
        size <= COLLAPSED_CONTEXT_THRESHOLD
          ? size
          : Math.min(Math.max(region?.fromStart ?? 0, 0), size);
      pushContext(fileDiff.hunks.length, deletion, addition, count, "expanded", false);
    }
  }
  return rows;
}

function contentRows(content: FileDiffMetadata["hunks"][number]["hunkContent"][number]): number {
  return content.type === "context" ? content.lines : content.deletions + content.additions;
}

/** Context expansions that grow every gap around a file's hunks, as magit's `+` does. */
export function moreContextExpansions(
  fileDiff: FileDiffMetadata,
): Array<readonly [hunkIndex: number, direction: ExpansionDirections]> {
  const expansions: Array<readonly [number, ExpansionDirections]> = [];
  for (const [index, hunk] of fileDiff.hunks.entries()) {
    // Above the first hunk only the lines next to it count as its context. Gaps at or under the
    // threshold already render in full.
    if (hunk.collapsedBefore > COLLAPSED_CONTEXT_THRESHOLD)
      expansions.push([index, index === 0 ? "down" : "both"]);
  }
  if (trailingSize(fileDiff) > COLLAPSED_CONTEXT_THRESHOLD)
    expansions.push([fileDiff.hunks.length, "up"]);
  return expansions;
}

export type DiffCursor =
  | { readonly fileKey: string; readonly kind: "header" }
  | {
      readonly fileKey: string;
      readonly kind: "line";
      readonly side: SelectionSide;
      readonly lineNumber: number;
    };

export interface DiffNavFile {
  readonly fileKey: string;
  readonly filePath: string;
  readonly fileDiff: FileDiffMetadata;
  /** Collapsed files show only their header; loading placeholders count as collapsed. */
  readonly collapsed: boolean;
  /** The file's rows, even while collapsed (search looks inside collapsed files). */
  rows(): readonly DiffRow[];
}

/** A cursor position: a file's header (`row` -1) or one of its rows. */
export interface DiffStop {
  readonly file: number;
  readonly row: number;
}

const visibleRows = (file: DiffNavFile) => (file.collapsed ? 0 : file.rows().length);

/** Where a cursor sits, or null when its file or line no longer renders. */
export function stopOf(files: readonly DiffNavFile[], cursor: DiffCursor): DiffStop | null {
  const file = files.findIndex((candidate) => candidate.fileKey === cursor.fileKey);
  const nav = files[file];
  if (!nav) return null;
  if (cursor.kind === "header") return { file, row: -1 };
  if (nav.collapsed) return null;
  const row = nav
    .rows()
    .findIndex(
      (candidate) =>
        (cursor.side === "deletions" ? candidate.deletion : candidate.addition)?.lineNumber ===
        cursor.lineNumber,
    );
  return row < 0 ? null : { file, row };
}

/**
 * The cursor for a stop. A row with both sides takes `side`: unified context rows always read
 * the new file, while split rows keep the column the reader chose.
 */
export function cursorAt(
  files: readonly DiffNavFile[],
  stop: DiffStop,
  side: SelectionSide,
  style: DiffVimStyle,
): DiffCursor {
  const file = files[stop.file]!;
  if (stop.row < 0) return { fileKey: file.fileKey, kind: "header" };
  const row = file.rows()[stop.row]!;
  const preferred = style === "unified" ? "additions" : side;
  const line =
    (preferred === "additions" ? row.addition : row.deletion) ?? row.addition ?? row.deletion!;
  return {
    fileKey: file.fileKey,
    kind: "line",
    side: line === row.addition ? "additions" : "deletions",
    lineNumber: line.lineNumber,
  };
}

/** Steps `count` stops through headers and expanded rows, stopping at either end. */
export function stepStop(files: readonly DiffNavFile[], from: DiffStop, count: number): DiffStop {
  let { file, row } = from;
  let remaining = Math.abs(count);
  if (count > 0) {
    while (remaining > 0) {
      const room = visibleRows(files[file]!) - 1 - row;
      if (remaining <= room) return { file, row: row + remaining };
      if (file === files.length - 1) return { file, row: row + room };
      remaining -= room + 1;
      file += 1;
      row = -1;
    }
  } else {
    while (remaining > 0) {
      if (remaining <= row + 1) return { file, row: row - remaining };
      if (file === 0) return { file, row: -1 };
      remaining -= row + 2;
      file -= 1;
      row = visibleRows(files[file]!) - 1;
    }
  }
  return { file, row };
}

export function lastStop(files: readonly DiffNavFile[]): DiffStop {
  const file = files.length - 1;
  return { file, row: visibleRows(files[file]!) - 1 };
}

const isSection = (files: readonly DiffNavFile[], stop: DiffStop) =>
  stop.row < 0 || files[stop.file]!.rows()[stop.row]!.start;

const sameStop = (left: DiffStop, right: DiffStop) =>
  left.file === right.file && left.row === right.row;

/** Next or previous file header or hunk start (magit's `C-j` / `C-k`). */
export function sectionStop(
  files: readonly DiffNavFile[],
  from: DiffStop,
  direction: 1 | -1,
): DiffStop | null {
  let stop = from;
  for (;;) {
    const next = stepStop(files, stop, direction);
    if (sameStop(next, stop)) return null;
    if (isSection(files, next)) return next;
    stop = next;
  }
}

/**
 * Next or previous sibling (magit's `]` / `[`): file to file from a header, hunk to hunk from a
 * line. Past the last hunk `]` moves on to the next file; before the first `[` returns to the
 * file's header.
 */
export function siblingStop(
  files: readonly DiffNavFile[],
  from: DiffStop,
  direction: 1 | -1,
): DiffStop | null {
  if (from.row < 0) {
    const file = from.file + direction;
    return file >= 0 && file < files.length ? { file, row: -1 } : null;
  }
  const rows = files[from.file]!.rows();
  if (direction === 1) {
    const next = rows.findIndex((row, index) => index > from.row && row.start);
    if (next >= 0) return { file: from.file, row: next };
    return from.file + 1 < files.length ? { file: from.file + 1, row: -1 } : null;
  }
  const current = rows[from.row]!;
  // Inside a hunk `[` leaves it for the previous one; from context between hunks it takes the
  // hunk above.
  const before =
    current.kind === "expanded"
      ? from.row
      : rows.findIndex((row) => row.hunk === current.hunk && row.start);
  const previous = rows.findLastIndex((row, index) => index < before && row.start);
  return { file: from.file, row: previous };
}

export function rowText(fileDiff: FileDiffMetadata, line: DiffRowLine, side: SelectionSide) {
  const text = (side === "additions" ? fileDiff.additionLines : fileDiff.deletionLines)[
    line.lineIndex
  ];
  return (text ?? "").replace(/\r?\n$/, "");
}

export interface DiffSearchHit {
  readonly stop: DiffStop;
  readonly side: SelectionSide;
}

/**
 * The next match after `from`, wrapping like Vim. Smartcase: an all-lowercase query ignores case.
 * Headers match their path; collapsed files are searched too, and the caller expands the hit.
 */
export function searchStop(
  files: readonly DiffNavFile[],
  from: DiffStop,
  query: string,
  direction: 1 | -1,
): DiffSearchHit | null {
  if (!query || files.length === 0) return null;
  const fold = query === query.toLowerCase();
  const needle = fold ? query.toLowerCase() : query;
  const matches = (text: string) => (fold ? text.toLowerCase() : text).includes(needle);
  const stopsIn = (file: number) => files[file]!.rows().length + 1;
  const total = files.reduce((sum, _, index) => sum + stopsIn(index), 0);
  let file = from.file;
  let row = from.row;
  for (let visited = 0; visited < total; visited++) {
    row += direction;
    if (row >= stopsIn(file) - 1) {
      file = (file + 1) % files.length;
      row = -1;
    } else if (row < -1) {
      file = (file - 1 + files.length) % files.length;
      row = stopsIn(file) - 2;
    }
    const nav = files[file]!;
    if (row < 0) {
      if (matches(nav.filePath)) return { stop: { file, row }, side: "additions" };
      continue;
    }
    const candidate = nav.rows()[row]!;
    if (candidate.addition && matches(rowText(nav.fileDiff, candidate.addition, "additions")))
      return { stop: { file, row }, side: "additions" };
    if (candidate.deletion && matches(rowText(nav.fileDiff, candidate.deletion, "deletions")))
      return { stop: { file, row }, side: "deletions" };
  }
  return null;
}

/** The new-file line to open for a row: its own, else the nearest in its hunk. */
export function visitLine(rows: readonly DiffRow[], row: number): number | null {
  const hunk = rows[row]?.hunk;
  for (let index = row; index < rows.length && rows[index]!.hunk === hunk; index++) {
    const addition = rows[index]!.addition;
    if (addition) return addition.lineNumber;
  }
  for (let index = row - 1; index >= 0 && rows[index]!.hunk === hunk; index--) {
    const addition = rows[index]!.addition;
    if (addition) return addition.lineNumber;
  }
  return null;
}

/** A Vim line-wise selection between two rows of one file, in reading order. */
export function rangeBetween(
  rows: readonly DiffRow[],
  anchor: Extract<DiffCursor, { kind: "line" }>,
  cursor: Extract<DiffCursor, { kind: "line" }>,
): SelectedLineRange {
  const index = (point: typeof anchor) =>
    rows.findIndex(
      (row) =>
        (point.side === "deletions" ? row.deletion : row.addition)?.lineNumber === point.lineNumber,
    );
  const [start, end] = index(anchor) <= index(cursor) ? [anchor, cursor] : [cursor, anchor];
  return { start: start.lineNumber, side: start.side, end: end.lineNumber, endSide: end.side };
}

/** The text of rows, one line per side shown (split change rows give both). */
export function rowsText(fileDiff: FileDiffMetadata, rows: readonly DiffRow[]): string {
  return rows
    .flatMap((row) =>
      row.kind === "change"
        ? [
            ...(row.deletion ? [rowText(fileDiff, row.deletion, "deletions")] : []),
            ...(row.addition ? [rowText(fileDiff, row.addition, "additions")] : []),
          ]
        : [rowText(fileDiff, row.addition!, "additions")],
    )
    .join("\n");
}

/** A hunk as unified diff text, header included (magit's `ys` on a hunk). */
export function hunkText(fileDiff: FileDiffMetadata, hunkIndex: number): string {
  const hunk = fileDiff.hunks[hunkIndex];
  if (!hunk) return "";
  const header =
    hunk.hunkSpecs?.trim() ??
    `@@ -${hunk.deletionStart},${hunk.deletionCount} +${hunk.additionStart},${hunk.additionCount} @@`;
  const body: string[] = [];
  let deletion = hunk.deletionLineIndex;
  let addition = hunk.additionLineIndex;
  const line = (side: SelectionSide, lineIndex: number) =>
    rowText(fileDiff, { lineNumber: 0, lineIndex }, side);
  for (const content of hunk.hunkContent) {
    if (content.type === "context") {
      for (let index = 0; index < content.lines; index++)
        body.push(` ${line("additions", addition + index)}`);
      deletion += content.lines;
      addition += content.lines;
    } else {
      for (let index = 0; index < content.deletions; index++)
        body.push(`-${line("deletions", deletion + index)}`);
      for (let index = 0; index < content.additions; index++)
        body.push(`+${line("additions", addition + index)}`);
      deletion += content.deletions;
      addition += content.additions;
    }
  }
  return [header, ...body].join("\n");
}
