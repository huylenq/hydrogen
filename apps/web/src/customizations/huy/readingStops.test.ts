// @vitest-environment jsdom
import { describe, expect, it } from "vite-plus/test";
import type { MessagesTimelineRow } from "../../components/chat/MessagesTimeline.logic";
import {
  findReadingStopElement,
  latestAnswerRow,
  readingTreeMotion,
  readingAnchor,
  readingJumpIndex,
  readingPlacementLine,
  readingSectionMarker,
  readingStopControl,
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

  it("ends an answer with its changed-files card, read header first and then row by row", () => {
    const answer = row(
      "message",
      `<div class="chat-markdown"><p>Done.</p></div>
      <div data-changed-files-state="tree">
        <div data-changed-files-header>2 changed files<button data-changed-files-open>Open diff</button></div>
        <div>
          <div><button data-changed-files-entry="directory" data-changed-files-path="src">src</button>
            <div><button data-changed-files-entry="file" data-changed-files-path="src/a.ts">a.ts</button></div>
          </div>
          <button data-changed-files-entry="file" data-changed-files-path="README.md">README.md</button>
        </div>
      </div>`,
      "assistant",
    );
    const stops = rowReadingStops(answer);
    expect(stops.map((stop) => stop.element.textContent?.trim())).toEqual([
      "Done.",
      "2 changed filesOpen diff",
      "src",
      "a.ts",
      "README.md",
    ]);
    expect(stops.map((stop) => stop.section)).toEqual([true, true, false, false, false]);
    // Enter clicks the file or folder itself, and the header's full-diff button.
    expect(stops.map((stop) => readingStopControl(stop.element)?.textContent)).toEqual([
      undefined,
      "Open diff",
      "src",
      "a.ts",
      "README.md",
    ]);
  });

  it("keeps the cursor on its file when a folder above it opens or closes", () => {
    const answer = row(
      "message",
      `<div class="chat-markdown"><p>Done.</p></div>
      <div data-changed-files-state="tree">
        <div data-changed-files-header>2 changed files</div>
        <div>
          <div data-changed-files-folder>
            <button data-changed-files-entry="directory" data-changed-files-path="src">src</button>
          </div>
          <button data-changed-files-entry="file" data-changed-files-path="README.md">README.md</button>
        </div>
      </div>`,
      "assistant",
    );
    const timeline = document.createElement("div");
    timeline.append(answer);
    const readme = answer.querySelector<HTMLElement>('[data-changed-files-path="README.md"]')!;
    const cursor = {
      rowId: "message-row",
      block: rowReadingStops(answer).find((stop) => stop.element === readme)!.block,
    };
    // Opening `src` shows its file above README.md.
    answer
      .querySelector("[data-changed-files-folder]")!
      .insertAdjacentHTML(
        "beforeend",
        `<div><button data-changed-files-entry="file" data-changed-files-path="src/a.ts">a.ts</button></div>`,
      );
    expect(findReadingStopElement(timeline, cursor)).toBe(readme);
  });

  it("keeps user messages and other rows whole, and skips assistant metadata", () => {
    const user = row("message", `<div class="chat-markdown"><p>a</p><p>b</p></div>`, "user");
    expect(rowReadingStops(user)).toEqual([
      { element: user, section: true, turn: true, block: "0" },
    ]);
    const work = row("work", "<p>Read file</p>");
    expect(rowReadingStops(work)).toEqual([
      { element: work, section: false, turn: false, block: "0" },
    ]);
    expect(rowReadingStops(row("assistant-meta", "<button>Copy</button>"))).toEqual([]);
  });

  it("reads an expanded tool group call by call, by list index, skipping parked rows", () => {
    const group = row(
      "work",
      `<div data-tool-group-scroll>
        <div data-work-entry-index="3">ls</div>
        <div data-work-entry-index="2">cat</div>
        <div data-work-entry-index="9" class="parked">stale</div>
      </div>`,
    );
    const parked = group.querySelector<HTMLElement>(".parked")!;
    parked.getBoundingClientRect = () => ({ top: -1e7 }) as DOMRect;
    const stops = rowReadingStops(group);
    expect(stops.map((stop) => [stop.element.textContent, stop.block])).toEqual([
      ["cat", "call:2"],
      ["ls", "call:3"],
    ]);
  });
});

// user, assistant, work, user, assistant, user
const turns = [true, false, false, true, false, true];

describe("readingTreeMotion", () => {
  const card = () => {
    const answer = row(
      "message",
      `<div data-changed-files-state="tree">
        <div data-changed-files-header><button data-changed-files-open>Open diff</button></div>
        <div>
          <div data-changed-files-folder>
            <button data-changed-files-entry="directory" data-changed-files-path="src" aria-expanded="true">src</button>
            <div>
              <div data-changed-files-folder>
                <button data-changed-files-entry="directory" data-changed-files-path="src/lib" aria-expanded="false">lib</button>
              </div>
              <button data-changed-files-entry="file" data-changed-files-path="src/a.ts">a.ts</button>
            </div>
          </div>
          <button data-changed-files-entry="file" data-changed-files-path="README.md">README.md</button>
        </div>
      </div>`,
      "assistant",
    );
    const entry = (name: string) =>
      [...answer.querySelectorAll<HTMLElement>("[data-changed-files-entry]")].find(
        (node) => node.textContent === name,
      )!;
    const header = answer.querySelector<HTMLElement>("[data-changed-files-header]")!;
    return { answer, entry, header };
  };
  const moveTo = (element: HTMLElement) => ({ kind: "move", rowId: "message-row", element });

  it("opens with l: files and the header click, folders expand, open folders step in", () => {
    const { entry, header } = card();
    expect(readingTreeMotion(entry("a.ts"), "in")).toEqual({
      kind: "click",
      control: entry("a.ts"),
    });
    expect(readingTreeMotion(entry("lib"), "in")).toEqual({
      kind: "click",
      control: entry("lib"),
    });
    expect(readingTreeMotion(entry("src"), "in")).toEqual(moveTo(entry("lib")));
    expect(readingTreeMotion(header, "in")).toEqual({
      kind: "click",
      control: header.querySelector("[data-changed-files-open]"),
    });
  });

  it("closes with h: open folders collapse, everything else steps out to its folder", () => {
    const { entry, header } = card();
    expect(readingTreeMotion(entry("src"), "out")).toEqual({
      kind: "click",
      control: entry("src"),
    });
    expect(readingTreeMotion(entry("a.ts"), "out")).toEqual(moveTo(entry("src")));
    expect(readingTreeMotion(entry("lib"), "out")).toEqual(moveTo(entry("src")));
    expect(readingTreeMotion(entry("README.md"), "out")).toEqual(moveTo(header));
    expect(readingTreeMotion(header, "out")).toEqual({ kind: "none" });
  });

  it("expands a turn fold with l and steps into it once open; h collapses it", () => {
    const fold = (expanded: boolean) =>
      row("turn-fold", `<button aria-expanded="${expanded}">Worked</button>`);
    const closed = fold(false);
    const toggle = closed.querySelector<HTMLElement>("button");
    expect(readingTreeMotion(closed, "in")).toEqual({ kind: "click", control: toggle });
    expect(readingTreeMotion(closed, "out")).toEqual({ kind: "none" });
    const open = fold(true);
    expect(readingTreeMotion(open, "in")).toEqual({ kind: "next" });
    expect(readingTreeMotion(open, "out")).toEqual({
      kind: "click",
      control: open.querySelector("button"),
    });
  });

  it("steps h out to the turn fold from anything the fold reveals, header included", () => {
    const inner = row("message", `<div class="chat-markdown"><p>Checking.</p></div>`, "assistant");
    inner.dataset.turnFold = "run-1";
    const out = { kind: "move", rowId: "turn-fold:run-1", element: null };
    expect(readingTreeMotion(inner.querySelector("p")!, "out")).toEqual(out);
    expect(readingTreeMotion(inner.querySelector("p")!, "in")).toBeNull();
    const { answer, header } = card();
    answer.dataset.turnFold = "run-1";
    expect(readingTreeMotion(header, "out")).toEqual(out);
  });

  it("opens and closes tool groups and tool calls, stepping out of a call to its group", () => {
    const header = (expanded: boolean) =>
      row("work-toggle", `<button aria-expanded="${expanded}">Ran 3 commands</button>`);
    const closed = header(false);
    expect(readingTreeMotion(closed, "in")).toEqual({
      kind: "click",
      control: closed.querySelector("button"),
    });
    const open = header(true);
    expect(readingTreeMotion(open, "in")).toEqual({ kind: "next" });
    expect(readingTreeMotion(open, "out")).toEqual({
      kind: "click",
      control: open.querySelector("button"),
    });
    const group = row(
      "work",
      `<div data-tool-group-scroll>
        <div data-work-entry-index="0"><div role="button" aria-expanded="false">ls</div></div>
        <div data-work-entry-index="1"><div role="button" aria-expanded="true">cat</div></div>
        <div data-work-entry-index="2"><div>note</div></div>
      </div>`,
    );
    group.dataset.toolGroupHeader = "work-toggle:w";
    const toHeader = { kind: "move", rowId: "work-toggle:w", element: null };
    const [closedCall, openCall, plainCall] = rowReadingStops(group).map((stop) => stop.element);
    expect(readingTreeMotion(closedCall!, "in")).toEqual({
      kind: "click",
      control: closedCall!.firstElementChild,
    });
    expect(readingTreeMotion(closedCall!, "out")).toEqual(toHeader);
    expect(readingTreeMotion(openCall!, "in")).toEqual({ kind: "none" });
    expect(readingTreeMotion(openCall!, "out")).toEqual({
      kind: "click",
      control: openCall!.firstElementChild,
    });
    expect(readingTreeMotion(plainCall!, "out")).toEqual(toHeader);
    // A lone tool call opens and closes its output in place.
    const single = row("work", `<div role="button" aria-expanded="true">Read file</div>`);
    expect(readingTreeMotion(single, "in")).toEqual({ kind: "none" });
    expect(readingTreeMotion(single, "out")).toEqual({
      kind: "click",
      control: single.firstElementChild,
    });
  });

  it("does nothing elsewhere", () => {
    expect(readingTreeMotion(document.createElement("p"), "in")).toBeNull();
    expect(readingTreeMotion(document.createElement("p"), "out")).toBeNull();
  });
});

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

  it("reading up, starts at the last block that ends on screen", () => {
    const stops = [stop(-200, -20), stop(-10, 100), stop(120, 590), stop(600, 900)];
    expect(readingAnchor(stops, view, "previous")).toBe(2);
    expect(readingAnchor([stop(-300, -100), stop(-100, 900)], view, "previous")).toBe(1);
  });
});

describe("latestAnswerRow", () => {
  const message = (id: string, role: "user" | "assistant", turnFoldRunId?: string) =>
    ({
      kind: "message",
      id,
      message: { role },
      ...(turnFoldRunId ? { turnFoldRunId } : {}),
    }) as unknown as MessagesTimelineRow;
  const other = (id: string) => ({ kind: "turn-fold", id }) as unknown as MessagesTimelineRow;

  it("finds the latest turn's first assistant message outside an open turn fold", () => {
    expect(
      latestAnswerRow([
        message("u1", "user"),
        message("a1", "assistant"),
        message("u2", "user"),
        other("fold"),
        message("a2", "assistant", "run"),
        message("a3", "assistant"),
        message("a4", "assistant"),
      ]),
    ).toBe(5);
    expect(latestAnswerRow([message("a1", "assistant"), message("u2", "user")])).toBe(-1);
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

  it("shows the cursor where reading starts, at the screen edge it reads away from", () => {
    const scrolled = { top: 110, bottom: 710 };
    expect(step(-1, "block", "next", scrolled)).toEqual({ kind: "move", index: 1 });
    expect(step(-1, "block", "previous", scrolled)).toEqual({ kind: "move", index: 3 });
    expect(step(-1, "section", "next", scrolled)).toEqual({
      kind: "land",
      index: 3,
      edge: "top",
      line: 230,
    });
  });

  it("reads an unread answer that has begun on screen from its beginning", () => {
    const unread = (at: { top: number; bottom: number }, unreadAnswer: number) =>
      resolveReadingStep({
        stops: answer,
        cursor: -1,
        granularity: "block",
        direction: "next",
        view: at,
        trajectory: null,
        unreadAnswer,
      });
    // The answer starts above the screen: land its start on the band's top line.
    expect(unread({ top: 700, bottom: 1300 }, 1)).toEqual({
      kind: "land",
      index: 1,
      edge: "top",
      line: 820,
    });
    // Its start is on screen: just show the cursor there.
    expect(unread({ top: 110, bottom: 710 }, 1)).toEqual({ kind: "move", index: 1 });
    // Its start is further down the screen than where reading would start: still start there.
    expect(unread(view, 3)).toEqual({ kind: "move", index: 3 });
    // An answer below the screen leaves reading where it starts on screen.
    expect(unread(view, 5)).toEqual({ kind: "move", index: 0 });
  });
});
