import { useLayoutEffect, useRef, useState, type ReactElement } from "react";

import { workingSessionRowSizes } from "./flowGridLayout";

// Room below the grid for the overview's snoozed row and its gap.
const SNOOZED_ROW_RESERVE = 56;

/** Lays out cards inside a scrolling ancestor, whose visible height decides how many rows fit. */
export function WorkingSessionGrid({ children }: { children: ReactElement[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
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
          SNOOZED_ROW_RESERVE,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const sizes = workingSessionRowSizes(children.length, width, height);
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
