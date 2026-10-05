// @vitest-environment jsdom
import { describe, expect, it } from "vite-plus/test";
import {
  readingAnchor,
  readingJumpIndex,
  readingPlacementLine,
  readingSectionMarker,
  resolveReadingStep,
  rowReadingStops,
} from "./readingStops";

function row(kind: string, html: string, role?: string): HTMLElement {
  const element = document.createElement("div");
  element.dataset.timelineRowId = `${kind}-row`;
  element.dataset.timelineRowKind = kind;
  if (role) element.dataset.messageRole = role;
  element.innerHTML = html;
  return element;
}

describe("rowReadingStops", () => {
  it("steps an answer by block and list item, marking headings and bold leads as sections", () => {
    const answer = row(
      "message",
      `<h3 class="sr-only">T3 Code</h3>
      <div class="chat-markdown">
        <p>Summary first.</p>
        <h2>Details</h2>
        <p>Plain paragraph with <strong>inline</strong> emphasis.</p>
        <p><strong>Root cause:</strong> a stale ref.</p>
        <ul>
          <li><strong>Fix</strong> - reset it.</li>
          <li><p><strong>Loose item</strong> with a paragraph.</p></li>
          <li>Plain item</li>
        </ul>
        <table><tr><td>cell</td></tr></table>
      </div>`,
      "assistant",
    );
    const stops = rowReadingStops(answer);
    expect(stops.map((stop) => stop.element.tagName)).toEqual([
      "P",
      "H2",
      "P",
      "P",
      "LI",
      "LI",
      "LI",
      "TABLE",
    ]);
    expect(stops.map((stop) => stop.section)).toEqual([
      true,
      true,
      false,
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(stops.some((stop) => stop.turn)).toBe(false);
  });

  it("keeps user messages and other rows whole, and skips assistant metadata", () => {
    const user = row("message", `<div class="chat-markdown"><p>a</p><p>b</p></div>`, "user");
    expect(rowReadingStops(user)).toEqual([{ element: user, section: true, turn: true }]);
    const work = row("work", "<p>Read file</p>");
    expect(rowReadingStops(work)).toEqual([{ element: work, section: false, turn: false }]);
    expect(rowReadingStops(row("assistant-meta", "<button>Copy</button>"))).toEqual([]);
  });
});

// user, assistant, work, user, assistant, user
const turns = [true, false, false, true, false, true];

describe("readingJumpIndex", () => {
  it("moves to the next eligible stop after the reading line", () => {
    expect(readingJumpIndex(turns, 1, false, "next")).toBe(3);
    expect(readingJumpIndex(turns, 3, true, "next")).toBe(5);
    expect(readingJumpIndex(turns, -1, false, "next")).toBe(0);
  });

  it("returns to the start of an eligible stop the reader is partway through", () => {
    expect(readingJumpIndex(turns, 3, false, "previous")).toBe(3);
    expect(readingJumpIndex(turns, 3, true, "previous")).toBe(0);
    expect(readingJumpIndex(turns, 4, false, "previous")).toBe(3);
  });

  it("stops at either end", () => {
    expect(readingJumpIndex(turns, 5, true, "next")).toBeNull();
    expect(readingJumpIndex(turns, 0, true, "previous")).toBeNull();
  });
});

// A screen showing scroll offsets 0-600 above the composer.
const view = { top: 0, bottom: 600 };
const stop = (
  top: number,
  bottom: number | null,
  flags: { section?: boolean; turn?: boolean } = {},
) => ({
  top,
  bottom,
  section: flags.section ?? false,
  turn: flags.turn ?? false,
});

describe("readingSectionMarker", () => {
  const block = (html: string) => {
    const container = document.createElement("div");
    container.innerHTML = html;
    return container.firstElementChild as HTMLElement;
  };

  it("finds the heading or the leading bold text that makes a block a section", () => {
    const heading = block("<h2>Details</h2>");
    expect(readingSectionMarker(heading)).toBe(heading);
    expect(
      readingSectionMarker(block("<p><strong>Root cause:</strong> a stale ref.</p>"))?.textContent,
    ).toBe("Root cause:");
    // Loose list items wrap their text in a paragraph.
    expect(readingSectionMarker(block("<li><p><b>Fix</b> it.</p></li>"))?.textContent).toBe("Fix");
  });

  it("finds nothing when bold text does not lead the block", () => {
    expect(
      readingSectionMarker(block("<p>Plain with <strong>inline</strong> emphasis.</p>")),
    ).toBeNull();
    expect(
      readingSectionMarker(block("<table><tr><td><strong>cell</strong></td></tr></table>")),
    ).toBeNull();
  });
});

describe("readingAnchor", () => {
  it("starts at the first block that begins on screen", () => {
    expect(readingAnchor([stop(-200, -20), stop(-10, 100), stop(120, 200)], view)).toBe(2);
  });

  it("stays on a block taller than the screen until the next one begins", () => {
    expect(readingAnchor([stop(-200, 900), stop(900, 1000)], view)).toBe(0);
    expect(readingAnchor([], view)).toBe(-1);
  });
});

describe("readingPlacementLine", () => {
  it("places zt and zb just inside the view's edges and zz at its middle", () => {
    expect(readingPlacementLine(view, "top")).toBe(30);
    expect(readingPlacementLine(view, "center")).toBe(300);
    expect(readingPlacementLine(view, "bottom")).toBe(570);
  });
});

describe("resolveReadingStep", () => {
  // With the default view (0-600), the cursor's band runs from 120 to 480.
  const answer = [
    stop(0, 100, { section: true, turn: true }),
    stop(120, 300, { section: true }),
    stop(320, 500),
    stop(520, 700, { section: true }),
    stop(720, 1900),
    stop(1920, 1980, { section: true, turn: true }),
    // Not mounted yet: only its estimated top is known.
    stop(2600, null, { section: true, turn: true }),
  ];
  const step = (
    cursor: number,
    granularity: "block" | "section" | "turn",
    direction: "next" | "previous",
    at = view,
    trajectory: "next" | "previous" | null = null,
  ) => resolveReadingStep({ stops: answer, cursor, granularity, direction, view: at, trajectory });

  it("moves the cursor within the band without scrolling", () => {
    expect(step(0, "block", "next")).toEqual({ kind: "move", index: 1 });
    expect(step(2, "block", "previous")).toEqual({ kind: "move", index: 1 });
    expect(step(0, "section", "next")).toEqual({ kind: "move", index: 1 });
    // Past the band by less than half a line still counts as inside.
    expect(step(1, "block", "next", { top: 0, bottom: 620 })).toEqual({ kind: "move", index: 2 });
  });

  it("scrolls before the edge once the next block would leave the band", () => {
    // Block 2 is fully on screen but ends below the band, so reading on lands it on the top line.
    expect(step(1, "block", "next", view, "next")).toEqual({
      kind: "land",
      index: 2,
      edge: "top",
      line: 120,
    });
    // Reading up lands the target's bottom on the band's bottom line.
    expect(step(3, "block", "previous", { top: 500, bottom: 1100 }, "previous")).toEqual({
      kind: "land",
      index: 2,
      edge: "bottom",
      line: 980,
    });
  });

  it("only brings the target into the band when a step reverses direction", () => {
    expect(step(3, "block", "previous", { top: 500, bottom: 1100 }, "next")).toEqual({
      kind: "land",
      index: 2,
      edge: "top",
      line: 620,
    });
    expect(step(1, "block", "next", view, "previous")).toEqual({
      kind: "land",
      index: 2,
      edge: "bottom",
      line: 480,
    });
  });

  it("pages half a screen through a block that runs past the bottom edge", () => {
    expect(step(4, "block", "next", { top: 700, bottom: 1300 })).toEqual({
      kind: "page",
      distance: 300,
    });
    expect(step(4, "block", "next", { top: 1400, bottom: 2000 })).toEqual({
      kind: "land",
      index: 5,
      edge: "top",
      line: 1520,
    });
    // Partway through, going back returns to the block's start, read from its top.
    expect(step(4, "block", "previous", { top: 1400, bottom: 2000 }, "previous")).toEqual({
      kind: "land",
      index: 4,
      edge: "top",
      line: 1520,
    });
  });

  it("lands jumps on the band's top line, since reading continues down from them", () => {
    expect(step(3, "section", "next")).toEqual({ kind: "land", index: 5, edge: "top", line: 120 });
    expect(step(2, "section", "previous")).toEqual({ kind: "move", index: 1 });
    expect(step(5, "section", "previous", { top: 1400, bottom: 2000 }, "previous")).toEqual({
      kind: "land",
      index: 3,
      edge: "top",
      line: 1520,
    });
    expect(step(1, "turn", "next")).toEqual({ kind: "land", index: 5, edge: "top", line: 120 });
    expect(step(5, "turn", "next", { top: 1400, bottom: 2000 })).toEqual({
      kind: "land",
      index: 6,
      edge: "top",
      line: 1520,
    });
  });

  it("shows the cursor where reading starts before moving it", () => {
    const scrolled = { top: 110, bottom: 710 };
    expect(step(-1, "block", "next", scrolled)).toEqual({ kind: "move", index: 1 });
    expect(step(-1, "block", "previous", scrolled)).toEqual({ kind: "move", index: 1 });
    expect(step(-1, "section", "next", scrolled)).toEqual({
      kind: "land",
      index: 3,
      edge: "top",
      line: 230,
    });
  });
});
