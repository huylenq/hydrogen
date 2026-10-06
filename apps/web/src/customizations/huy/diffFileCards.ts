import "./diffFileCards.css";

/**
 * Each file in a diff reads as its own card: a gap between files, a raised header band, and a
 * hairline ring (diffFileCards.css). Hidden context between hunks reads as a tear in the card.
 * Kept out of the shared viewer so upstream changes to its styling merge cleanly;
 * StyledDiffCodeView only plugs these in.
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

/* Hidden context reads as the card torn open: the panel background shows through a strip with
   zigzag edges, offset by half a tooth so the cut runs parallel, and the line count sits in the
   strip in place of the shared viewer's hairline rule. The teeth fit inside the separator's
   fixed height, so Pierre's geometry is unchanged. */
:is([data-separator="line-info"], [data-separator="line-info-basic"]) {
  --diff-tear: 5px;
  background:
    conic-gradient(from -45deg at 50% 100%, var(--code-background) 90deg, #0000 0) 0 0 /
      calc(2 * var(--diff-tear)) var(--diff-tear) repeat-x,
    conic-gradient(from 135deg at 50% 0, var(--code-background) 90deg, #0000 0) var(--diff-tear)
      100% / calc(2 * var(--diff-tear)) var(--diff-tear) repeat-x,
    var(--background) !important;
}

:is([data-separator="line-info"], [data-separator="line-info-basic"]) [data-unmodified-lines] {
  flex: 0 1 auto !important;
  margin-inline: auto;
}

:is([data-separator="line-info"], [data-separator="line-info-basic"])
  [data-unmodified-lines]::before,
:is([data-separator="line-info"], [data-separator="line-info-basic"])
  [data-unmodified-lines]::after {
  display: none !important;
}
`;
