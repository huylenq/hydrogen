import { useLayoutEffect, useRef, useState, type ReactElement } from "react";

import { workingSessionRowSizes } from "./flowGridLayout";

export function WorkingSessionGrid({ children }: { children: ReactElement[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setWidth(container.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const sizes = workingSessionRowSizes(children.length, width);
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
