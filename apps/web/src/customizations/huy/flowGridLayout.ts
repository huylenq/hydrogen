const MIN_CARD_WIDTH = 360;
const GAP = 16;

/** Use the fewest rows that fit, then share sessions evenly between them. */
export function workingSessionRowSizes(count: number, availableWidth: number): number[] {
  if (count === 0) return [];
  const capacity = Math.max(1, Math.floor((availableWidth + GAP) / (MIN_CARD_WIDTH + GAP)));
  const rows = Math.ceil(count / capacity);
  const perRow = Math.floor(count / rows);
  const extra = count % rows;
  return Array.from({ length: rows }, (_, row) => perRow + (row < extra ? 1 : 0));
}
