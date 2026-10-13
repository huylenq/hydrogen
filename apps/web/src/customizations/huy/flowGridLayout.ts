const MIN_CARD_WIDTH = 360;
// Matches FlowSessionPreview's `max-w-lg`.
const MAX_CARD_WIDTH = 512;
/** FlowSessionCheckoutStrip's fixed height, reserved above every tile so rows stay aligned. */
export const FLOW_CHECKOUT_STRIP_HEIGHT = 22;
/** Shared off-card rows, inset slightly to align optically with the tile's rounded corners. */
export const FLOW_FOOTER_LINE_CLASS =
  "flex min-w-0 items-center px-2 text-xs text-muted-foreground";
// FlowSessionPreview's `h-96` tile, its `gap-1`, and the checkout strip above it; subagent
// lines can add to it.
export const FLOW_CARD_MIN_HEIGHT = 384 + 4 + FLOW_CHECKOUT_STRIP_HEIGHT;
const GAP = 16;

function rowCapacity(availableWidth: number, cardWidth: number) {
  return Math.max(1, Math.floor((availableWidth + GAP) / (cardWidth + GAP)));
}

/**
 * Prefer the squarest grid of full-width cards, adding rows while they still fit the pane's
 * height; widen into more columns, shrinking cards toward the readable minimum, only when the
 * height runs out. Sessions are shared evenly.
 */
export function workingSessionRowSizes(
  count: number,
  availableWidth: number,
  availableHeight: number,
  cardHeight = FLOW_CARD_MIN_HEIGHT,
): number[] {
  if (count === 0) return [];
  const minRows = Math.ceil(count / rowCapacity(availableWidth, MIN_CARD_WIDTH));
  const fullWidthRows = Math.ceil(count / rowCapacity(availableWidth, MAX_CARD_WIDTH));
  // Rows of the squarest grid, with columns never fewer than rows.
  const squareRows = Math.ceil(count / Math.ceil(Math.sqrt(count)));
  const fittingRows = Math.max(1, Math.floor((availableHeight + GAP) / (cardHeight + GAP)));
  const rows = Math.max(minRows, Math.min(Math.max(squareRows, fullWidthRows), fittingRows));
  const perRow = Math.floor(count / rows);
  const extra = count % rows;
  return Array.from({ length: rows }, (_, row) => perRow + (row < extra ? 1 : 0));
}
