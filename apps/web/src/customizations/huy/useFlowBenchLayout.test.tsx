import { act, useLayoutEffect } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useFlowBenchLayout } from "./useFlowBenchLayout";

const resize = vi.hoisted(() => ({ notify: () => {} }));
vi.mock("../../lib/observeResize", () => ({
  observeResize: (_elements: unknown, callback: () => void) => {
    resize.notify = callback;
    return () => {
      resize.notify = () => {};
    };
  },
}));

let renderer: ReactTestRenderer;
let layout: ReturnType<typeof useFlowBenchLayout>;
let availableWidth: number;
let chipWidths: number[];
const titles = ["a", "b", "c", "d", "e", "f"];

function Harness({ titles }: { titles: readonly string[] }) {
  const current = useFlowBenchLayout(titles);
  useLayoutEffect(() => {
    layout = current;
  });
  return null;
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  availableWidth = 150;
  chipWidths = [100, 120, 110, 80, 90, 70, 60];
  await act(() => {
    renderer = create(<Harness titles={titles} />);
  });
  await act(() => {
    layout.setBenchElement({
      getBoundingClientRect: () => ({ width: availableWidth }),
    } as HTMLElement);
    layout.setMeasurementElement({
      children: chipWidths.map((_, index) => ({
        getBoundingClientRect: () => ({ width: chipWidths[index] }),
      })),
    } as unknown as HTMLDivElement);
  });
});

afterEach(async () => {
  await act(() => renderer.unmount());
  vi.unstubAllGlobals();
});

describe("content-sized Flow bench", () => {
  it("expands out of overflow after a resize and shrinks back without losing hidden widths", async () => {
    expect(layout.requestedWidth).toBe(214);
    expect(layout.capacity).toEqual({ shown: 2, hidden: 4 });
    await act(() => {
      availableWidth = 214;
      resize.notify();
    });
    expect(layout.capacity).toEqual({ shown: 6, hidden: 0 });
    expect(layout.columns).toEqual([120, 90]);
    await act(() => {
      availableWidth = 150;
      resize.notify();
    });
    expect(layout.capacity).toEqual({ shown: 2, hidden: 4 });
    expect(layout.requestedWidth).toBe(214);
  });

  it("remeasures changed titles and font widths", async () => {
    await act(() => {
      availableWidth = 400;
      chipWidths = [500, 120, 110, 80, 90, 70, 60];
      renderer.update(<Harness titles={["a much longer title", ...titles.slice(1)]} />);
    });
    expect(layout.requestedWidth).toBe(394);
    expect(layout.columns).toEqual([300, 90]);
    await act(() => {
      chipWidths[0] = 80;
      resize.notify();
    });
    expect(layout.requestedWidth).toBe(214);
    expect(layout.columns).toEqual([120, 90]);
  });
});
