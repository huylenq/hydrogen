const MIN_CARD_WIDTH = 360;
// Matches FlowSessionPreview's `max-w-lg` and `h-96`.
const MAX_CARD_WIDTH = 512;
const CARD_HEIGHT = 384;
const GAP = 16;

function rowCapacity(availableWidth: number, cardWidth: number) {
  return Math.max(1, Math.floor((availableWidth + GAP) / (cardWidth + GAP)));
}

/**
 * Prefer full-width cards, adding rows while they still fit the pane's height; shrink cards
 * toward the readable minimum only when the height runs out. Sessions are shared evenly.
 */
export function workingSessionRowSizes(
  count: number,
  availableWidth: number,
  availableHeight: number,
): number[] {
  if (count === 0) return [];
  const minRows = Math.ceil(count / rowCapacity(availableWidth, MIN_CARD_WIDTH));
  const fullWidthRows = Math.ceil(count / rowCapacity(availableWidth, MAX_CARD_WIDTH));
  const fittingRows = Math.max(1, Math.floor((availableHeight + GAP) / (CARD_HEIGHT + GAP)));
  const rows = Math.max(minRows, Math.min(fullWidthRows, fittingRows));
  const perRow = Math.floor(count / rows);
  const extra = count % rows;
  return Array.from({ length: rows }, (_, row) => perRow + (row < extra ? 1 : 0));
}
