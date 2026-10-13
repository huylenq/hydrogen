import { describe, expect, it } from "vite-plus/test";

import { workingSessionRowSizes } from "./flowGridLayout";

describe("workingSessionRowSizes", () => {
  it("adds rows for full-width cards while they fit the pane height", () => {
    expect(workingSessionRowSizes(5, 2000, 900)).toEqual([3, 2]);
    expect(workingSessionRowSizes(5, 2000, 3000)).toEqual([3, 2]);
    expect(workingSessionRowSizes(7, 2000, 800)).toEqual([4, 3]);
  });

  it("favors a square grid even when every card fits one full-width row", () => {
    expect(workingSessionRowSizes(2, 3000, 2000)).toEqual([2]);
    expect(workingSessionRowSizes(3, 3000, 2000)).toEqual([2, 1]);
    expect(workingSessionRowSizes(4, 3000, 2000)).toEqual([2, 2]);
    expect(workingSessionRowSizes(5, 3000, 900)).toEqual([3, 2]);
    expect(workingSessionRowSizes(9, 3000, 2000)).toEqual([3, 3, 3]);
  });

  it("widens the grid before adding rows that would scroll", () => {
    expect(workingSessionRowSizes(5, 2000, 835)).toEqual([5]);
    expect(workingSessionRowSizes(5, 2000, 836)).toEqual([3, 2]);
    expect(workingSessionRowSizes(9, 3000, 1261)).toEqual([5, 4]);
    expect(workingSessionRowSizes(9, 3000, 1262)).toEqual([3, 3, 3]);
  });

  it("in a one-row pane, fits more columns by allowing cards to shrink below their maximum width", () => {
    expect(workingSessionRowSizes(6, 2700, 400)).toEqual([6]);
    expect(workingSessionRowSizes(7, 2700, 400)).toEqual([7]);
  });

  it("balances rows once another readable column cannot fit", () => {
    expect(workingSessionRowSizes(6, 2100, 400)).toEqual([3, 3]);
    expect(workingSessionRowSizes(7, 2100, 400)).toEqual([4, 3]);
    expect(workingSessionRowSizes(10, 1600, 400)).toEqual([4, 3, 3]);
  });

  it("responds to pane width without shrinking columns below the readable minimum", () => {
    expect(workingSessionRowSizes(6, 3152, 400)).toEqual([6]);
    expect(workingSessionRowSizes(6, 1112, 400)).toEqual([3, 3]);
    expect(workingSessionRowSizes(6, 1111, 400)).toEqual([2, 2, 2]);
    expect(workingSessionRowSizes(3, 320, 400)).toEqual([1, 1, 1]);
    expect(workingSessionRowSizes(0, 0, 400)).toEqual([]);
  });

  it("keeps rows within capacity and their populations within one card", () => {
    for (const width of [0, 320, 512, 1040, 2100, 2700, 6000]) {
      for (const height of [0, 400, 800, 2000])
        for (let count = 1; count <= 40; count++) {
          const sizes = workingSessionRowSizes(count, width, height);
          expect(sizes.reduce((total, size) => total + size, 0)).toBe(count);
          expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
          expect(Math.max(...sizes)).toBeLessThanOrEqual(
            Math.max(1, Math.floor((width + 16) / 376)),
          );
        }
    }
  });
});
