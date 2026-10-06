import "./diffFileCards.css";

/**
 * Each file in a diff reads as its own card: a gap between files, a raised header band, and a
 * hairline ring (diffFileCards.css). Kept out of the shared viewer so upstream changes to its
 * styling merge cleanly; StyledDiffCodeView only plugs these in.
 */

/**
 * Space between files and around the list, in place of upstream's all-zero layout. Pierre's
 * virtual layout counts it, unlike CSS margins.
 */
export const DIFF_FILE_CARD_LAYOUT = { paddingTop: 8, paddingBottom: 8, gap: 8 } as const;

/** Styles inside each file's shadow root, appended after the viewer's own. */
export const DIFF_FILE_CARD_UNSAFE_CSS = `
:host {
  --diff-file-header-bg: color-mix(in srgb, var(--code-background) 94%, var(--code-foreground));
  --diff-file-edge: color-mix(in srgb, var(--code-background) 86%, var(--code-foreground));
}

/* The band stays opaque while it sticks, so the file you are in stays named at the top. */
[data-diffs-header],
[data-diffs-header]:hover {
  background-color: var(--diff-file-header-bg) !important;
  box-shadow: inset 0 -1px var(--diff-file-edge);
}

[data-diffs-header]:hover {
  box-shadow:
    inset 3px 0 color-mix(in srgb, var(--code-foreground) 24%, transparent),
    inset 0 -1px var(--diff-file-edge);
}
`;
