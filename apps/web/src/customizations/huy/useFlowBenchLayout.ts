import { useLayoutEffect, useState } from "react";

import {
  FLOW_BENCH_COLUMN_WIDTH,
  flowBenchCapacity,
  flowBenchColumnWidths,
  flowBenchRequestedWidth,
} from "../../components/Flow.logic";
import { observeResize } from "../../lib/observeResize";

// Shared by the real chips and their inert measurement copies, including borders.
export const FLOW_BENCH_CHIP_CLASS =
  "flex h-5 min-w-0 items-center gap-1.5 rounded-sm border border-transparent px-1.5 text-left text-2xs";

/** Measure every title independently of the visible slice, so overflow cannot lock the bench to one column. */
export function useFlowBenchLayout(titles: readonly string[]) {
  const [benchElement, setBenchElement] = useState<HTMLElement | null>(null);
  const [measurementElement, setMeasurementElement] = useState<HTMLDivElement | null>(null);
  const [measurement, setMeasurement] = useState<{
    key: string;
    width: number;
    itemWidths: number[];
    moreWidth: number;
  } | null>(null);
  const key = JSON.stringify(titles);

  useLayoutEffect(() => {
    if (!benchElement || !measurementElement) return;
    const items = Array.from(measurementElement.children);
    const measure = () => {
      const widths = items.map((item) => item.getBoundingClientRect().width);
      setMeasurement({
        key,
        width: benchElement.getBoundingClientRect().width,
        itemWidths: widths.slice(0, -1),
        moreWidth: widths.at(-1) ?? FLOW_BENCH_COLUMN_WIDTH,
      });
    };
    measure();
    return observeResize([benchElement, ...items], measure);
  }, [benchElement, measurementElement, key]);

  const itemWidths = measurement?.key === key ? measurement.itemWidths : [];
  const requestedWidth = flowBenchRequestedWidth(titles.length, itemWidths);
  const moreWidth = measurement?.key === key ? measurement.moreWidth : FLOW_BENCH_COLUMN_WIDTH;
  const capacity = flowBenchCapacity(
    titles.length,
    measurement?.width ?? requestedWidth,
    itemWidths,
    moreWidth,
  );
  const visibleWidths = Array.from(
    { length: capacity.shown },
    (_, index) => itemWidths[index] ?? FLOW_BENCH_COLUMN_WIDTH,
  );
  if (capacity.hidden > 0) visibleWidths.push(moreWidth);

  return {
    setBenchElement,
    setMeasurementElement,
    requestedWidth,
    capacity,
    columns: flowBenchColumnWidths(visibleWidths.length, visibleWidths),
  };
}
