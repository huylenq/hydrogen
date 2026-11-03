import { observeResize } from "~/lib/observeResize";
import { useLayoutEffect, useRef, useState, type ReactElement } from "react";

import { FLOW_CARD_MIN_HEIGHT, workingSessionRowSizes } from "./flowGridLayout";

/** Lays out cards inside a scrolling ancestor, whose visible height decides how many rows fit. */
export function WorkingSessionGrid({
  children,
  reserveBelow,
}: {
  children: ReactElement[];
  /** A sibling below the grid in the same flex column, such as the snoozed chips; its height and the column gap are left free. */
  reserveBelow?: HTMLElement | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [cardHeight, setCardHeight] = useState(FLOW_CARD_MIN_HEIGHT);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Observes the grid and viewport dimensions so card rows fit the visible area.
  useLayoutEffect(() => {
    const container = containerRef.current;
    // The viewport, not the grid's own wrapper: that grows with the rows and would ratchet.
    const viewport = container?.closest("main");
    if (!container || !viewport) return;
    const measure = () => {
      setWidth(container.getBoundingClientRect().width);
      const style = getComputedStyle(viewport);
      setHeight(
        viewport.clientHeight -
          parseFloat(style.paddingTop) -
          parseFloat(style.paddingBottom) -
          reservedBelow(reserveBelow),
      );
      // Subagent lines grow a card past the base height. Card height doesn't depend on width, so
      // fitting rows to the tallest one can't oscillate.
      const cards = container.querySelectorAll<HTMLElement>(":scope > div > *");
      setCardHeight(
        Math.max(
          FLOW_CARD_MIN_HEIGHT,
          ...Array.from(cards, (card) => card.getBoundingClientRect().height),
        ),
      );
    };
    measure();
    return observeResize(
      reserveBelow ? [container, viewport, reserveBelow] : [container, viewport],
      measure,
    );
  }, [reserveBelow]);

  const sizes = workingSessionRowSizes(children.length, width, height, cardHeight);
  const columns = sizes[0] ?? 1;
  const cardWidth = Math.max(0, Math.min(512, (width - (columns - 1) * 16) / columns));
  return (
    <div ref={containerRef} className="flex w-full flex-col items-center gap-4">
      {sizes.map((size, row) => {
        const offset = sizes.slice(0, row).reduce((total, previous) => total + previous, 0);
        const rowCards = children.slice(offset, offset + size);
        return (
          <div
            key={rowCards[0]?.key}
            className="flex max-w-full justify-center gap-4"
            style={{ width: size * cardWidth + (size - 1) * 16 }}
          >
            {rowCards}
          </div>
        );
      })}
    </div>
  );
}

/** A hidden (empty) sibling takes no room and no gap. */
function reservedBelow(element: HTMLElement | null | undefined): number {
  if (!element?.offsetHeight) return 0;
  const column = element.parentElement;
  const gap = column ? parseFloat(getComputedStyle(column).rowGap) || 0 : 0;
  return element.offsetHeight + gap;
}
