import { describe, expect, it } from "vite-plus/test";

import { workingSessionRowSizes } from "./flowGridLayout";

describe("workingSessionRowSizes", () => {
  it("fits more columns by allowing cards to shrink below their maximum width", () => {
    expect(workingSessionRowSizes(6, 2700)).toEqual([6]);
    expect(workingSessionRowSizes(7, 2700)).toEqual([7]);
  });

  it("balances rows once another readable column cannot fit", () => {
    expect(workingSessionRowSizes(6, 2100)).toEqual([3, 3]);
    expect(workingSessionRowSizes(7, 2100)).toEqual([4, 3]);
    expect(workingSessionRowSizes(10, 1600)).toEqual([4, 3, 3]);
  });

  it("responds to pane width without shrinking columns below the readable minimum", () => {
    expect(workingSessionRowSizes(6, 3152)).toEqual([6]);
    expect(workingSessionRowSizes(6, 1112)).toEqual([3, 3]);
    expect(workingSessionRowSizes(6, 1111)).toEqual([2, 2, 2]);
    expect(workingSessionRowSizes(3, 320)).toEqual([1, 1, 1]);
    expect(workingSessionRowSizes(0, 0)).toEqual([]);
  });

  it("keeps rows within capacity and their populations within one card", () => {
    for (const width of [0, 320, 512, 1040, 2100, 2700, 6000]) {
      for (let count = 1; count <= 40; count++) {
        const sizes = workingSessionRowSizes(count, width);
        expect(sizes.reduce((total, size) => total + size, 0)).toBe(count);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
        expect(Math.max(...sizes)).toBeLessThanOrEqual(Math.max(1, Math.floor((width + 16) / 376)));
      }
    }
  });
});
