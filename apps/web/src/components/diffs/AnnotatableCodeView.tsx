import type {
  AnnotationSide,
  CodeViewDiffItem,
  CodeViewItem,
  DiffLineAnnotation,
  FileDiffMetadata,
  SelectedLineRange,
} from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { DiffVimSearchBar } from "~/customizations/huy/DiffVimSearchBar";
import { useDiffVim } from "~/customizations/huy/useDiffVim";

import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { fnv1a32, resolveFileDiffPath } from "~/lib/diffRendering";
import {
  buildDiffReviewComment,
  restoreDiffReviewCommentRange,
  type ReviewCommentContext,
} from "~/reviewCommentContext";

import { nextFileCommentId } from "../files/fileCommentAnnotations";
import { DiffCommentAnnotation } from "./DiffCommentAnnotation";
import { StyledDiffCodeView, type StyledDiffCodeViewOptions } from "./StyledDiffCodeView";

interface DiffCommentAnnotationEntry {
  id: string;
  kind: "draft" | "comment";
  range: SelectedLineRange;
  rangeLabel: string;
  text: string;
}

interface DiffCommentAnnotationGroup {
  entries: DiffCommentAnnotationEntry[];
}

type DiffCommentLineAnnotation = DiffLineAnnotation<DiffCommentAnnotationGroup>;
export type AnnotatableCodeViewHandle = CodeViewHandle<DiffCommentAnnotationGroup, undefined>;
const EMPTY_REVIEW_COMMENTS: ReadonlyArray<ReviewCommentContext> = [];

function annotationSide(range: SelectedLineRange): AnnotationSide {
  return (range.endSide ?? range.side) === "deletions" ? "deletions" : "additions";
}

function appendAnnotationEntry(
  annotations: ReadonlyArray<DiffCommentLineAnnotation>,
  range: SelectedLineRange,
  entry: DiffCommentAnnotationEntry,
): DiffCommentLineAnnotation[] {
  const side = annotationSide(range);
  const annotationIndex = annotations.findIndex(
    (annotation) => annotation.side === side && annotation.lineNumber === range.end,
  );
  if (annotationIndex < 0) {
    return [
      ...annotations,
      {
        side,
        lineNumber: range.end,
        metadata: { entries: [entry] },
      },
    ];
  }
  return annotations.map((annotation, index) =>
    index === annotationIndex
      ? {
          ...annotation,
          metadata: { entries: [...annotation.metadata.entries, entry] },
        }
      : annotation,
  );
}

interface AnnotatableCodeViewProps {
  codeViewKey: string;
  files: ReadonlyArray<{
    fileDiff: FileDiffMetadata;
    filePath: string;
    fileKey: string;
    fileVersion: number;
    collapsed: boolean;
  }>;
  sectionId: string;
  sectionTitle: string;
  composerDraftTarget: ScopedThreadRef | DraftId;
  options: StyledDiffCodeViewOptions<DiffCommentAnnotationGroup>;
  viewerRef?: (handle: AnnotatableCodeViewHandle | null) => void;
  className?: string;
  renderCodeViewFooter?: () => ReactNode;
  unsafeCSSExtra?: string;
  renderHeaderMetadata?: (fileDiff: FileDiffMetadata) => ReactNode;
  renderHeaderFilenameSuffix: (fileDiff: FileDiffMetadata) => ReactNode;
  renderHeaderPrefix: (
    fileDiff: FileDiffMetadata,
    fileKey: string,
    collapsed: boolean,
  ) => ReactNode;
  /** Vim navigation folds, opens, refreshes, and shows its keys through these. */
  onToggleFileCollapsed?: (filePath: string) => void;
  onSetAllFilesCollapsed?: (collapsed: boolean) => void;
  onOpenFile?: (filePath: string, line: number | null) => void;
  onRefresh?: () => void;
  onShowKeys?: () => void;
  /** Unfold a collapsed file that holds the find match being navigated to. */
  onRevealSearchMatch: (filePath: string) => void;
}

interface DiffSelectionContext {
  item: CodeViewItem<DiffCommentAnnotationGroup>;
}

export function AnnotatableCodeView({
  codeViewKey,
  files,
  sectionId,
  sectionTitle,
  composerDraftTarget,
  options,
  viewerRef,
  className,
  renderCodeViewFooter,
  unsafeCSSExtra,
  renderHeaderMetadata,
  renderHeaderFilenameSuffix,
  renderHeaderPrefix,
  onToggleFileCollapsed,
  onSetAllFilesCollapsed,
  onOpenFile,
  onRefresh,
  onShowKeys,
  onRevealSearchMatch,
}: AnnotatableCodeViewProps) {
  const addReviewComment = useComposerDraftStore((store) => store.addReviewComment);
  const removeReviewComment = useComposerDraftStore((store) => store.removeReviewComment);
  const reviewComments = useComposerDraftStore(
    (store) => store.getComposerDraft(composerDraftTarget)?.reviewComments ?? EMPTY_REVIEW_COMMENTS,
  );
  const [selectedLines, setSelectedLines] = useState<{
    id: string;
    range: SelectedLineRange;
  } | null>(null);
  const [draft, setDraft] = useState<{
    fileKey: string;
    annotation: DiffCommentLineAnnotation;
  } | null>(null);
  const [draftText, setDraftText] = useState("");

  const filesByKey = useMemo(() => new Map(files.map((file) => [file.fileKey, file])), [files]);
  const items = useMemo<CodeViewDiffItem<DiffCommentAnnotationGroup>[]>(
    () =>
      files.map(({ fileDiff, filePath, fileKey, fileVersion, collapsed }) => {
        const persisted = reviewComments
          .filter(
            (comment) =>
              comment.sectionId === sectionId &&
              comment.filePath === filePath &&
              (comment.fenceLanguage ?? "diff") === "diff",
          )
          .reduce<DiffCommentLineAnnotation[]>((annotations, comment) => {
            const range = restoreDiffReviewCommentRange(fileDiff, comment);
            if (!range) return annotations;
            return appendAnnotationEntry(annotations, range, {
              id: comment.id,
              kind: "comment",
              range,
              rangeLabel: comment.rangeLabel,
              text: comment.text,
            });
          }, []);
        const annotations =
          draft?.fileKey === fileKey ? [...persisted, draft.annotation] : persisted;
        return {
          id: fileKey,
          type: "diff",
          fileDiff,
          annotations,
          collapsed,
          version: fnv1a32(
            `${fileVersion}:${collapsed ? "1" : "0"}:${annotations
              .flatMap((annotation) =>
                annotation.metadata.entries.map(
                  (entry) => `${entry.id}:${entry.rangeLabel}:${entry.text}`,
                ),
              )
              .join(":")}`,
          ),
        };
      }),
    [draft, files, reviewComments, sectionId],
  );

  const startDraft = useCallback(
    (fileKey: string, filePath: string, fileDiff: FileDiffMetadata, range: SelectedLineRange) => {
      const id = nextFileCommentId();
      const comment = buildDiffReviewComment({
        id,
        sectionId,
        sectionTitle,
        filePath,
        fileDiff,
        range,
        text: "",
      });
      if (!comment) return;
      setDraftText("");
      setDraft({
        fileKey,
        annotation: {
          side: annotationSide(range),
          lineNumber: range.end,
          metadata: {
            entries: [{ id, kind: "draft", range, rangeLabel: comment.rangeLabel, text: "" }],
          },
        },
      });
    },
    [sectionId, sectionTitle],
  );
  const beginComment = useCallback(
    (fileKey: string, range: SelectedLineRange) => {
      const file = filesByKey.get(fileKey);
      if (file) startDraft(fileKey, file.filePath, file.fileDiff, range);
    },
    [filesByKey, startDraft],
  );
  const beginGutterComment = useCallback(
    (range: SelectedLineRange | null, context: DiffSelectionContext) => {
      if (!range) return;
      const item = context.item;
      if (item.type !== "diff") return;
      // Read from the item, not the file list, so this callback keeps its identity as
      // patches arrive; the viewer re-applies its options whenever it changes.
      startDraft(item.id, resolveFileDiffPath(item.fileDiff), item.fileDiff, range);
    },
    [startDraft],
  );

  const hasOpenComment = draft !== null;
  const [viewer, setViewer] = useState<AnnotatableCodeViewHandle | null>(null);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const attachViewer = useCallback(
    (handle: AnnotatableCodeViewHandle | null) => {
      setViewer(handle);
      viewerRef?.(handle);
    },
    [viewerRef],
  );
  const vim = useDiffVim({
    viewer,
    root,
    files,
    style: (options.diffStyle ?? "split") === "split" ? "split" : "unified",
    setSelectedLines,
    commentOpen: hasOpenComment,
    beginComment,
    ...(onToggleFileCollapsed ? { toggleFile: onToggleFileCollapsed } : {}),
    ...(onSetAllFilesCollapsed ? { setAllCollapsed: onSetAllFilesCollapsed } : {}),
    ...(onOpenFile ? { openFile: onOpenFile } : {}),
    ...(onRefresh ? { refresh: onRefresh } : {}),
    ...(onShowKeys ? { showKeys: onShowKeys } : {}),
  });
  const { settleAfterComment } = vim;

  const removeEntry = useCallback(
    (entryId: string) => {
      const draftEntry = draft?.annotation.metadata.entries.find((entry) => entry.id === entryId);
      setSelectedLines(
        draft && draftEntry
          ? settleAfterComment({ id: draft.fileKey, range: draftEntry.range })
          : null,
      );
      if (draftEntry) {
        setDraft(null);
        setDraftText("");
      } else {
        removeReviewComment(composerDraftTarget, entryId);
      }
    },
    [composerDraftTarget, draft, removeReviewComment, settleAfterComment],
  );

  const submitEntry = useCallback(
    (entryId: string, text: string) => {
      const entry = draft?.annotation.metadata.entries.find(
        (candidate) => candidate.id === entryId,
      );
      const file = draft ? filesByKey.get(draft.fileKey) : undefined;
      if (!entry || !file) return;
      const comment = buildDiffReviewComment({
        id: entry.id,
        sectionId,
        sectionTitle,
        filePath: file.filePath,
        fileDiff: file.fileDiff,
        range: entry.range,
        text,
      });
      if (comment) addReviewComment(composerDraftTarget, comment);
      setSelectedLines(settleAfterComment({ id: file.fileKey, range: entry.range }));
      setDraft(null);
      setDraftText("");
    },
    [
      addReviewComment,
      composerDraftTarget,
      draft,
      filesByKey,
      sectionId,
      sectionTitle,
      settleAfterComment,
    ],
  );
  return (
    <div className="relative h-full min-h-0">
      <StyledDiffCodeView<DiffCommentAnnotationGroup>
        key={codeViewKey}
        viewerRef={attachViewer}
        containerRef={setRoot}
        {...(className ? { className } : {})}
        {...(unsafeCSSExtra ? { unsafeCSSExtra } : {})}
        {...(renderHeaderMetadata
          ? {
              renderHeaderMetadata: (item: CodeViewItem<DiffCommentAnnotationGroup>) =>
                item.type === "diff" ? renderHeaderMetadata(item.fileDiff) : null,
            }
          : {})}
        {...(renderCodeViewFooter ? { renderCodeViewFooter } : {})}
        items={items}
        selectedLines={selectedLines}
        onSelectedLinesChange={(selection) => {
          setSelectedLines(selection);
          vim.onPointerSelection(selection);
        }}
        onRevealSearchMatch={(item) => {
          // Folding is keyed by path; see DiffPanel's CollapsedDiffFilesState.
          if (item.type === "diff") onRevealSearchMatch(resolveFileDiffPath(item.fileDiff));
        }}
        options={{
          ...options,
          enableGutterUtility: !hasOpenComment,
          enableLineSelection: !hasOpenComment,
          onGutterUtilityClick: beginGutterComment,
        }}
        renderHeaderFilenameSuffix={(item) =>
          item.type === "diff" ? renderHeaderFilenameSuffix(item.fileDiff) : null
        }
        renderHeaderPrefix={(item) =>
          item.type === "diff" ? (
            <>
              {vim.activeFileKey === item.id ? <span hidden data-diff-active-file /> : null}
              {vim.headerCursorKey === item.id ? (
                // The header's Vim cursor: the line cursor's gutter bar, against the sticky header.
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-(--diffs-modified-base)"
                />
              ) : null}
              {renderHeaderPrefix(item.fileDiff, item.id, item.collapsed === true)}
            </>
          ) : null
        }
        renderAnnotation={(annotation) => {
          const hasDraft = annotation.metadata.entries.some((entry) => entry.kind === "draft");
          return (
            <div
              className={hasDraft ? "py-1" : "divide-y divide-border/30 border-y border-border/30"}
            >
              {annotation.metadata.entries.map((entry) => (
                <DiffCommentAnnotation
                  key={entry.id}
                  kind={entry.kind}
                  rangeLabel={entry.rangeLabel}
                  text={entry.kind === "draft" ? draftText : entry.text}
                  onTextChange={setDraftText}
                  onCancel={() => removeEntry(entry.id)}
                  onComment={(text) => submitEntry(entry.id, text)}
                  onDelete={() => removeEntry(entry.id)}
                />
              ))}
            </div>
          );
        }}
      />
      {/* The viewer's rows and sticky headers paint over its own focus outline; see workspace.css. */}
      <div
        aria-hidden
        data-focus-ring-overlay
        className="pointer-events-none absolute inset-0 z-20"
      />
      {vim.searchOpen ? <DiffVimSearchBar onClose={vim.closeSearch} /> : null}
    </div>
  );
}
