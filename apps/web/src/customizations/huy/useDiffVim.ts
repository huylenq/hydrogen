import type {
  FileDiffMetadata,
  HunkExpansionRegion,
  SelectedLineRange,
  SelectionSide,
} from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useClientSettings } from "~/hooks/useSettings";
import { showModalFeedback } from "~/modalKeyboardStore";

import { registerDiffVimScope, registerDiffVimViewer, type DiffVimCommand } from "./diffVim";
import { registerPanelFocusAnchor } from "./panelFocus";
import {
  cursorAt,
  diffRows,
  hunkText,
  lastStop,
  moreContextExpansions,
  rangeBetween,
  rowsText,
  rowText,
  searchStop,
  sectionStop,
  siblingStop,
  stepStop,
  stopOf,
  visitLine,
  type DiffCursor,
  type DiffNavFile,
  type DiffRow,
  type DiffStop,
  type DiffVimStyle,
} from "./diffVimRows";

type LineCursor = Extract<DiffCursor, { kind: "line" }>;
type Selection = { id: string; range: SelectedLineRange };
type Reveal = "nearest" | "top" | "center" | "bottom";

/** Pierre's default row height: page overlap and the on-screen test measure with it. */
const LINE_HEIGHT = 20;
/** `diffHeaderHeight` in StyledDiffCodeView: the sticky file header covering the top. */
const HEADER_HEIGHT = 32;
/** Lines `+` reveals on each side of every gap in the file. */
const CONTEXT_STEP = 5;
const EMPTY_EXPANSIONS: ReadonlyMap<number, HunkExpansionRegion> = new Map();

export interface DiffVimFile {
  readonly fileKey: string;
  readonly filePath: string;
  readonly fileDiff: FileDiffMetadata;
  readonly collapsed: boolean;
}

interface UseDiffVimInput<LAnnotation> {
  viewer: CodeViewHandle<LAnnotation, undefined> | null;
  root: HTMLElement | null;
  files: ReadonlyArray<DiffVimFile>;
  style: DiffVimStyle;
  setSelectedLines: (selection: Selection | null) => void;
  /** A draft comment is open; it owns the selection until it closes. */
  commentOpen: boolean;
  beginComment: (fileKey: string, range: SelectedLineRange) => void;
  toggleFile?: (filePath: string) => void;
  setAllCollapsed?: (collapsed: boolean) => void;
  openFile?: (filePath: string, line: number | null) => void;
  refresh?: () => void;
  /** Opens the diff's key cheatsheet. */
  showKeys?: () => void;
}

/**
 * Makes a diff panel a Vim scope and a focus anchor: its keys work from anywhere in it, and it
 * takes focus on entry until its viewer mounts and takes over. Registered during layout so a
 * panel mounting in the same commit as a focus request is already there for it.
 */
export function useDiffVimScope(element: HTMLElement | null) {
  const enabled = useClientSettings((settings) => settings.modalKeyboardEnabled);
  useLayoutEffect(() => {
    if (!enabled || !element) return;
    const unregisterScope = registerDiffVimScope(element);
    const unregisterAnchor = registerPanelFocusAnchor(element);
    return () => {
      unregisterAnchor();
      unregisterScope();
    };
  }, [enabled, element]);
}

/**
 * Drives a diff viewer from the modal keyboard: a line cursor drawn as Pierre's line selection, a
 * file-header cursor, magit-style folding and section motions, search, and comments.
 */
export function useDiffVim<LAnnotation>(input: UseDiffVimInput<LAnnotation>) {
  const enabled = useClientSettings((settings) => settings.modalKeyboardEnabled);
  const [cursor, setCursor] = useState<DiffCursor | null>(null);
  const [anchor, setAnchor] = useState<LineCursor | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const lastSearch = useRef<{ query: string; direction: 1 | -1 } | null>(null);
  // The split-view column the reader chose, kept across rows that lack it.
  const wantSide = useRef<SelectionSide>("additions");
  const pendingReveal = useRef<Reveal | null>(null);
  // Key handlers run outside render; they read the committed inputs and cursor through these.
  const latest = useRef(input);
  const state = useRef({ cursor, anchor });

  const rowsCache = useRef(
    new Map<string, { fileDiff: FileDiffMetadata; signature: string; rows: DiffRow[] }>(),
  );
  const rowsFor = useCallback((file: DiffVimFile, style: DiffVimStyle): DiffRow[] => {
    const expanded = expansionsOf(latest.current.viewer, file.fileKey);
    const signature = [
      style,
      file.fileDiff.isPartial,
      file.fileDiff.additionLines.length,
      file.fileDiff.deletionLines.length,
      ...[...expanded].map(([hunk, region]) => `${hunk}:${region.fromStart}:${region.fromEnd}`),
    ].join("|");
    const cached = rowsCache.current.get(file.fileKey);
    if (cached?.fileDiff === file.fileDiff && cached.signature === signature) return cached.rows;
    const rows = diffRows(file.fileDiff, style, expanded);
    rowsCache.current.set(file.fileKey, { fileDiff: file.fileDiff, signature, rows });
    return rows;
  }, []);

  const files = useMemo<DiffNavFile[]>(
    () =>
      input.files.map((file) => ({
        ...file,
        rows: () => rowsFor(file, input.style),
      })),
    [input.files, input.style, rowsFor],
  );
  const filesRef = useRef(files);
  useLayoutEffect(() => {
    latest.current = input;
    state.current = { cursor, anchor };
    filesRef.current = files;
  });

  const apply = useCallback(
    (next: DiffCursor | null, nextAnchor: LineCursor | null, reveal: Reveal | null) => {
      const { setSelectedLines } = latest.current;
      setCursor(next);
      setAnchor(nextAnchor);
      if (next?.kind === "line") {
        const file = filesRef.current.find((candidate) => candidate.fileKey === next.fileKey);
        const range =
          nextAnchor && file
            ? rangeBetween(file.rows(), nextAnchor, next)
            : { start: next.lineNumber, side: next.side, end: next.lineNumber, endSide: next.side };
        setSelectedLines({ id: next.fileKey, range });
      } else setSelectedLines(null);
      pendingReveal.current = reveal;
    },
    [],
  );

  const scrollState = useCallback(() => {
    const instance = latest.current.viewer?.getInstance();
    return instance
      ? { instance, top: instance.getScrollTop(), height: instance.getHeight() }
      : null;
  }, []);

  /** Absolute top of a stop, when Pierre can place it (headers always; rows once rendered). */
  const stopTop = useCallback(
    (stop: DiffStop): number | undefined => {
      const view = scrollState();
      const file = filesRef.current[stop.file];
      if (!view || !file) return;
      const itemTop = view.instance.getTopForItem(file.fileKey);
      if (itemTop === undefined || stop.row < 0) return itemTop;
      const rendered = view.instance.getRenderedItems().find((item) => item.id === file.fileKey);
      if (rendered?.type !== "diff") return;
      const row = file.rows()[stop.row];
      const line = row?.addition ?? row?.deletion;
      if (!row || !line) return;
      const position = rendered.instance.getLinePosition(
        line.lineNumber,
        row.addition ? "additions" : "deletions",
      );
      return position ? itemTop + position.top : undefined;
    },
    [scrollState],
  );

  /** The first stop starting on screen: where the first motion shows the cursor. */
  const firstStopOnScreen = useCallback((): DiffStop | null => {
    const view = scrollState();
    const navFiles = filesRef.current;
    if (navFiles.length === 0) return null;
    if (!view) return { file: 0, row: -1 };
    for (const [index, file] of navFiles.entries()) {
      const top = view.instance.getTopForItem(file.fileKey);
      if (top === undefined) continue;
      const nextFile = navFiles[index + 1];
      const bottom =
        (nextFile && view.instance.getTopForItem(nextFile.fileKey)) ??
        view.instance.getScrollHeight();
      if (bottom <= view.top + HEADER_HEIGHT) continue;
      if (top >= view.top || file.collapsed) return { file: index, row: -1 };
      const rows = file.rows();
      const target = view.top + HEADER_HEIGHT;
      let low = 0;
      let high = rows.length - 1;
      let found = -1;
      while (low <= high) {
        const middle = (low + high) >> 1;
        const rowTop = stopTop({ file: index, row: middle });
        if (rowTop === undefined) return { file: index, row: -1 };
        if (rowTop >= target) {
          found = middle;
          high = middle - 1;
        } else low = middle + 1;
      }
      if (found >= 0) return { file: index, row: found };
    }
    return { file: navFiles.length - 1, row: -1 };
  }, [scrollState, stopTop]);

  const onScreen = useCallback(
    (stop: DiffStop) => {
      const view = scrollState();
      const top = stopTop(stop);
      if (!view || top === undefined) return false;
      const covered = stop.row < 0 ? 0 : HEADER_HEIGHT;
      return top + LINE_HEIGHT > view.top + covered && top < view.top + view.height;
    },
    [scrollState, stopTop],
  );

  const flushReveal = useCallback(() => {
    const reveal = pendingReveal.current;
    const current = state.current.cursor;
    const view = scrollState();
    if (!reveal || !current || !view) return;
    pendingReveal.current = null;
    // Like Vim's scrolloff, and like the conversation's reading band: a fifth at each end.
    const margin = view.height / 5;
    if (current.kind === "line") {
      view.instance.scrollTo({
        type: "line",
        id: current.fileKey,
        lineNumber: current.lineNumber,
        side: current.side,
        align:
          reveal === "nearest"
            ? "nearest"
            : reveal === "top"
              ? "start"
              : reveal === "center"
                ? "center"
                : "end",
        offset: reveal === "nearest" ? margin : reveal === "center" ? 0 : view.height / 20,
        behavior: "smooth-auto",
      });
      return;
    }
    const top = view.instance.getTopForItem(current.fileKey);
    if (top === undefined) return;
    let position: number | null = null;
    if (reveal === "top") position = top;
    else if (reveal === "center") position = top - view.height / 2;
    else if (reveal === "bottom") position = top + HEADER_HEIGHT - view.height + view.height / 20;
    else if (top < view.top + margin) position = top - margin;
    else if (top + HEADER_HEIGHT > view.top + view.height - margin)
      position = top + HEADER_HEIGHT - view.height + margin;
    if (position === null) return;
    // Pierre lowers unclamped position targets by the sticky header; add it back.
    view.instance.scrollTo({
      type: "position",
      position: position + HEADER_HEIGHT,
      behavior: "smooth-auto",
    });
  }, [scrollState]);

  // Reveal after React commits, so collapses and remounts have laid out first.
  useLayoutEffect(() => {
    flushReveal();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Each of these changes layout or the cursor a pending reveal targets.
  }, [cursor, anchor, input.files, input.viewer, flushReveal]);

  const moveTo = useCallback(
    (stop: DiffStop, reveal: Reveal = "nearest") => {
      const navFiles = filesRef.current;
      const currentAnchor = anchorIn(navFiles, state.current.anchor);
      let target = stop;
      if (currentAnchor) {
        // A selection stays within its file and off the header.
        const anchorFile = navFiles.findIndex((file) => file.fileKey === currentAnchor.fileKey);
        const lastRow = navFiles[anchorFile]!.rows().length - 1;
        target =
          target.file < anchorFile || (target.file === anchorFile && target.row < 0)
            ? { file: anchorFile, row: 0 }
            : target.file > anchorFile
              ? { file: anchorFile, row: lastRow }
              : target;
      }
      apply(
        cursorAt(navFiles, target, wantSide.current, latest.current.style),
        currentAnchor,
        reveal,
      );
    },
    [apply],
  );

  const toggleFileAndFollow = useCallback(
    (file: DiffNavFile, next: DiffCursor | null) => {
      latest.current.toggleFile?.(file.filePath);
      // Drop the row cache: a collapse can remount the file.
      rowsCache.current.delete(file.fileKey);
      apply(next, null, "nearest");
    },
    [apply],
  );

  const runSearch = useCallback(
    (query: string, direction: 1 | -1, from: DiffStop | null) => {
      const navFiles = snapshotRows(filesRef.current);
      // Without a cursor, search from the edge so the first file's header can match.
      const start = from ?? (direction === 1 ? lastStop(navFiles) : { file: 0, row: -1 });
      const hit = searchStop(navFiles, start, query, direction);
      if (!hit) {
        showModalFeedback(`Pattern not found: ${query}`);
        return;
      }
      const file = navFiles[hit.stop.file]!;
      const next = cursorAt(navFiles, hit.stop, hit.side, "split");
      if (file.collapsed && hit.stop.row >= 0) toggleFileAndFollow(file, next);
      else apply(next, null, "center");
    },
    [apply, toggleFileAndFollow],
  );

  const copy = useCallback((text: string, what: string) => {
    void navigator.clipboard.writeText(text).then(
      () => showModalFeedback(`Copied ${what}`),
      () => showModalFeedback("Copying failed"),
    );
  }, []);

  const run = useCallback(
    (command: DiffVimCommand): boolean => {
      const navFiles = snapshotRows(filesRef.current);
      const current = state.current.cursor;
      const currentAnchor = anchorIn(navFiles, state.current.anchor);
      const { style } = latest.current;
      if (command === "diff.escape") {
        if (!currentAnchor) return false;
        apply(current, null, null);
        return true;
      }
      if (command === "diff.search") {
        setSearchOpen(true);
        return true;
      }
      if (command === "diff.help") {
        if (latest.current.showKeys) latest.current.showKeys();
        else showModalFeedback("No key list for this diff");
        return true;
      }
      if (command === "diff.refresh") {
        if (latest.current.refresh) latest.current.refresh();
        else showModalFeedback("This diff refreshes on its own");
        return true;
      }
      if (navFiles.length === 0) {
        showModalFeedback("No files in this diff");
        return true;
      }
      const at = current ? stopOf(navFiles, current) : null;
      const motion = [
        "diff.next",
        "diff.previous",
        "diff.section.next",
        "diff.section.previous",
        "diff.sibling.next",
        "diff.sibling.previous",
      ].includes(command);
      // The first motion, or one after the cursor scrolled away, shows it on screen first.
      if (motion && (!at || !onScreen(at))) {
        const first = firstStopOnScreen();
        if (first) moveTo(first);
        return true;
      }
      const from = at ?? firstStopOnScreen() ?? { file: 0, row: -1 };
      const file = navFiles[from.file]!;
      const row = from.row >= 0 ? file.rows()[from.row] : undefined;
      const lineCursor = current?.kind === "line" ? current : null;
      switch (command) {
        case "diff.next":
        case "diff.previous":
          moveTo(stepStop(navFiles, from, command === "diff.next" ? 1 : -1));
          return true;
        case "diff.first":
          moveTo({ file: 0, row: -1 });
          return true;
        case "diff.last":
          moveTo(lastStop(navFiles));
          return true;
        case "diff.section.next":
        case "diff.section.previous": {
          const next = sectionStop(navFiles, from, command === "diff.section.next" ? 1 : -1);
          if (next) moveTo(next);
          return true;
        }
        case "diff.sibling.next":
        case "diff.sibling.previous": {
          const next = siblingStop(navFiles, from, command === "diff.sibling.next" ? 1 : -1);
          if (next) moveTo(next);
          return true;
        }
        case "diff.parent":
          if (from.row >= 0) apply({ fileKey: file.fileKey, kind: "header" }, null, "nearest");
          return true;
        case "diff.page.down":
        case "diff.page.up":
        case "diff.half.down":
        case "diff.half.up": {
          const view = scrollState();
          if (!view) return true;
          const down = command === "diff.page.down" || command === "diff.half.down";
          const page = command.startsWith("diff.page")
            ? view.height - 2 * LINE_HEIGHT
            : view.height / 2;
          const delta = down ? page : -page;
          view.instance.scrollTo({
            type: "position",
            position: view.top + delta + HEADER_HEIGHT,
            behavior: "smooth-auto",
          });
          // Like Emacs scrolling, the cursor stays put; if it scrolled away, the next motion picks
          // it up on screen. Rows wrap, so a row count cannot follow a screen offset.
          return true;
        }
        case "diff.left":
          if (from.row < 0) {
            if (!file.collapsed)
              toggleFileAndFollow(file, { fileKey: file.fileKey, kind: "header" });
          } else if (style === "split" && lineCursor?.side === "additions" && row?.deletion) {
            wantSide.current = "deletions";
            moveTo(from);
          } else apply({ fileKey: file.fileKey, kind: "header" }, null, "nearest");
          return true;
        case "diff.right":
          if (from.row < 0) {
            if (file.collapsed)
              toggleFileAndFollow(file, { fileKey: file.fileKey, kind: "header" });
            else if (file.rows().length > 0) moveTo({ file: from.file, row: 0 });
          } else if (style === "split" && lineCursor?.side === "deletions" && row?.addition) {
            wantSide.current = "additions";
            moveTo(from);
          }
          return true;
        case "diff.fold.toggle":
        case "diff.level.hide":
        case "diff.level.show": {
          const header: DiffCursor = { fileKey: file.fileKey, kind: "header" };
          const shown = command === "diff.level.show";
          // Level 1 rests on the header, like magit; showing an open file changes nothing.
          if (command !== "diff.fold.toggle" && file.collapsed !== shown) {
            if (!shown) apply(header, null, "nearest");
            return true;
          }
          if (file.fileDiff.cacheKey?.endsWith(":pending")) {
            showModalFeedback("This file is still loading");
            return true;
          }
          toggleFileAndFollow(file, header);
          return true;
        }
        case "diff.fold.all":
        case "diff.level.files":
        case "diff.level.all": {
          const collapse =
            command === "diff.level.files" ||
            (command === "diff.fold.all" && navFiles.some((candidate) => !candidate.collapsed));
          latest.current.setAllCollapsed?.(collapse);
          rowsCache.current.clear();
          apply(
            collapse || !current ? { fileKey: file.fileKey, kind: "header" } : current,
            null,
            "nearest",
          );
          return true;
        }
        case "diff.view.top":
        case "diff.view.center":
        case "diff.view.bottom":
          if (!current) apply(cursorAt(navFiles, from, wantSide.current, style), null, null);
          pendingReveal.current =
            command === "diff.view.top"
              ? "top"
              : command === "diff.view.center"
                ? "center"
                : "bottom";
          flushReveal();
          return true;
        case "diff.context.more": {
          const rendered = latest.current.viewer
            ?.getInstance()
            ?.getRenderedItems()
            .find((item) => item.id === file.fileKey);
          const expansions = moreContextExpansions(file.fileDiff);
          if (rendered?.type !== "diff" || file.collapsed || expansions.length === 0) {
            showModalFeedback("No hidden context in this file");
            return true;
          }
          for (const [hunk, direction] of expansions)
            rendered.instance.expandHunk(hunk, direction, CONTEXT_STEP);
          return true;
        }
        case "diff.visual":
          if (currentAnchor) apply(current, null, null);
          else if (lineCursor) apply(lineCursor, lineCursor, null);
          else showModalFeedback("Move to a line to select");
          return true;
        case "diff.yank.selection": {
          if (!currentAnchor || !lineCursor) return true;
          const rows = file.rows();
          const range = rangeBetween(rows, currentAnchor, lineCursor);
          const first = stopOf(navFiles, {
            fileKey: file.fileKey,
            kind: "line",
            side: range.side ?? "additions",
            lineNumber: range.start,
          });
          const last = stopOf(navFiles, {
            fileKey: file.fileKey,
            kind: "line",
            side: range.endSide ?? range.side ?? "additions",
            lineNumber: range.end,
          });
          if (first && last) {
            copy(
              rowsText(file.fileDiff, rows.slice(first.row, last.row + 1)),
              `${last.row - first.row + 1} lines`,
            );
          }
          apply(lineCursor, null, null);
          return true;
        }
        case "diff.yank.line":
          if (!row || !lineCursor) copy(file.filePath, "file path");
          else {
            const line = lineCursor.side === "additions" ? row.addition : row.deletion;
            if (line) copy(rowText(file.fileDiff, line, lineCursor.side), "line");
          }
          return true;
        case "diff.yank.section":
          if (!row) copy(file.filePath, "file path");
          else if (row.kind === "expanded") showModalFeedback("Not inside a hunk");
          else copy(hunkText(file.fileDiff, row.hunk), "hunk");
          return true;
        case "diff.comment": {
          if (latest.current.commentOpen) {
            showModalFeedback("Finish the open comment first");
            return true;
          }
          if (!lineCursor) {
            showModalFeedback("Move to a line to comment");
            return true;
          }
          const range = currentAnchor
            ? rangeBetween(file.rows(), currentAnchor, lineCursor)
            : {
                start: lineCursor.lineNumber,
                side: lineCursor.side,
                end: lineCursor.lineNumber,
                endSide: lineCursor.side,
              };
          setAnchor(null);
          latest.current.beginComment(file.fileKey, range);
          return true;
        }
        case "diff.search.next":
        case "diff.search.previous": {
          const search = lastSearch.current;
          if (!search) {
            showModalFeedback("No previous search");
            return true;
          }
          const direction =
            command === "diff.search.next" ? search.direction : (-search.direction as 1 | -1);
          runSearch(search.query, direction, at);
          return true;
        }
        case "diff.visit":
          latest.current.openFile?.(file.filePath, row ? visitLine(file.rows(), from.row) : null);
          return true;
        default:
          return false;
      }
    },
    [
      apply,
      copy,
      firstStopOnScreen,
      flushReveal,
      moveTo,
      onScreen,
      runSearch,
      scrollState,
      toggleFileAndFollow,
    ],
  );

  useEffect(() => {
    const root = input.root;
    if (!enabled || !root) return;
    const unregisterViewer = registerDiffVimViewer({
      root,
      available: (command) => command !== "diff.yank.selection" || state.current.anchor !== null,
      run,
    });
    // The viewer is its panel's best focus target; a remount hands focus to the new root.
    const unregisterAnchor = registerPanelFocusAnchor(root);
    return () => {
      unregisterAnchor();
      unregisterViewer();
    };
  }, [enabled, input.root, run]);

  /** Pierre reports selections made with the pointer; the cursor follows them. */
  const onPointerSelection = useCallback((selection: Selection | null) => {
    if (!selection) {
      setCursor(null);
      setAnchor(null);
      return;
    }
    const { range } = selection;
    setCursor({
      fileKey: selection.id,
      kind: "line",
      side: range.endSide ?? range.side ?? "additions",
      lineNumber: range.end,
    });
    setAnchor(null);
  }, []);

  /** After a comment closes, the cursor rests on the line it was written on. */
  const settleAfterComment = useCallback(
    (selection: Selection | null): Selection | null => {
      if (!enabled || !selection) return null;
      const { range } = selection;
      const side = range.endSide ?? range.side ?? "additions";
      const next: LineCursor = { fileKey: selection.id, kind: "line", side, lineNumber: range.end };
      setCursor(next);
      setAnchor(null);
      // The draft's textarea is about to unmount; keep focus in the diff instead of losing it.
      const root = latest.current.root;
      const active = document.activeElement;
      if (root && (!active || active === document.body || root.contains(active)))
        root.focus({ preventScroll: true });
      return { id: selection.id, range: { start: range.end, side, end: range.end, endSide: side } };
    },
    [enabled],
  );

  /** Enter and Escape return to the diff; leaving by pointer or Tab goes where the reader went. */
  const closeSearch = useCallback(
    (query: string | null, refocus: boolean) => {
      setSearchOpen(false);
      if (refocus) latest.current.root?.focus({ preventScroll: true });
      if (!query) return;
      lastSearch.current = { query, direction: 1 };
      const current = state.current.cursor;
      runSearch(query, 1, current ? stopOf(filesRef.current, current) : null);
    },
    [runSearch],
  );

  return {
    enabled,
    headerCursorKey: enabled && cursor?.kind === "header" ? cursor.fileKey : null,
    /** The file the cursor is in, highlighted as a whole (diffFileCards.css). */
    activeFileKey: enabled && cursor ? cursor.fileKey : null,
    searchOpen: enabled && searchOpen,
    closeSearch,
    onPointerSelection,
    settleAfterComment,
  };
}

/** The selection anchor, or null once a refresh removed its file. */
function anchorIn(files: ReadonlyArray<DiffNavFile>, anchor: LineCursor | null): LineCursor | null {
  return anchor && files.some((file) => file.fileKey === anchor.fileKey) ? anchor : null;
}

/**
 * The files with each one's rows built at most once, so a command walking many rows (search, section
 * jumps) pays the cache check per file rather than per row.
 */
function snapshotRows(files: ReadonlyArray<DiffNavFile>): DiffNavFile[] {
  return files.map((file) => {
    let rows: ReadonlyArray<DiffRow> | undefined;
    return { ...file, rows: () => (rows ??= file.rows()) };
  });
}

interface PierreItemRecord {
  readonly type: "diff" | "file";
  readonly instance: {
    hunksRenderer?: { getExpandedHunksMap?: () => ReadonlyMap<number, HunkExpansionRegion> };
  };
}

/**
 * A file's context expansions, including a file scrolled out of the window: Pierre keeps the item
 * and its expansions while virtualization detaches it. Both live on protected fields with no
 * public accessor; fail loudly if an upgrade moves them, rather than letting the cursor skip lines.
 */
function expansionsOf<LAnnotation>(
  viewer: CodeViewHandle<LAnnotation, undefined> | null,
  fileKey: string,
): ReadonlyMap<number, HunkExpansionRegion> {
  const codeView = viewer?.getInstance();
  if (!codeView) return EMPTY_EXPANSIONS;
  const records = (codeView as unknown as { idToItem?: Map<string, PierreItemRecord> }).idToItem;
  if (!(records instanceof Map))
    throw new Error("Pierre no longer exposes CodeView.idToItem; update useDiffVim");
  const record = records.get(fileKey);
  if (record?.type !== "diff") return EMPTY_EXPANSIONS;
  const renderer = record.instance.hunksRenderer;
  if (typeof renderer?.getExpandedHunksMap !== "function")
    throw new Error(
      "Pierre no longer exposes hunksRenderer.getExpandedHunksMap; update useDiffVim",
    );
  return renderer.getExpandedHunksMap();
}
