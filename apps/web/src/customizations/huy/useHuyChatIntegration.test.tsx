// @vitest-environment jsdom
import type { LegendListRef } from "@legendapp/list/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { ModalThreadContext } from "../../modalKeyboardCommands";

vi.mock("../../hooks/useSettings", () => ({
  getClientSettings: () => ({ modalKeyboardEnabled: true }),
}));

const { dispatchTimelineCommand, useHuyChatIntegration } = await import("./useHuyChatIntegration");
const { registerToolGroupList } = await import("./toolGroupLists");

const CONTEXT: ModalThreadContext = {
  title: "Thread",
  isServer: true,
  isGitRepo: true,
  hasProject: true,
  canPin: true,
  pinned: false,
  canSettle: true,
  settled: false,
  rightOpen: false,
  maximized: false,
  canMaximize: true,
  terminalOpen: false,
  question: "none",
};
const VIEWPORT = 600;

/**
 * One answer of 100px blocks, 110px apart, laid out by hand since jsdom has no layout. In a
 * 600px timeline the cursor's band runs from about 138px to 478px.
 */
function fakeTimeline(
  threadKey: string,
  node = document.createElement("div"),
  reused?: { rows: unknown[] },
) {
  node.replaceChildren();
  const rowId = `${threadKey}-answer`;
  const row = document.createElement("div");
  Object.assign(row.dataset, {
    timelineRowId: rowId,
    timelineRowKind: "message",
    messageRole: "assistant",
  });
  const markdown = document.createElement("div");
  markdown.className = "chat-markdown";
  row.append(markdown);
  node.append(row);
  const rect = (top: number, height: number) =>
    ({ top, bottom: top + height, height, left: 0, right: 600, width: 600 }) as DOMRect;
  for (let index = 0; index < 20; index++) {
    const block = document.createElement("p");
    block.getBoundingClientRect = () => rect(index * 110 - node.scrollTop, 100);
    markdown.append(block);
  }
  row.getBoundingClientRect = () => rect(-node.scrollTop, 20 * 110);
  node.getBoundingClientRect = () => rect(0, VIEWPORT);
  Object.defineProperty(node, "clientHeight", { configurable: true, value: VIEWPORT });
  Object.defineProperty(node, "scrollHeight", { configurable: true, value: 20 * 110 });
  document.body.append(node);
  const rows = [{ id: rowId, kind: "message", message: { role: "assistant" } }];
  // Like Legend, scrolling to a row puts it at the top; a reused list swaps its rows.
  const list = Object.assign(reused ?? {}, {
    rows,
    getState: () => ({
      data: list.rows,
      indexByKey: (key: string) => (key === rowId ? 0 : undefined),
      positionAtIndex: () => 0,
    }),
    getScrollableNode: () => node,
    scrollToIndex: vi.fn(() => {
      node.scrollTop = 0;
    }),
  });
  return { node, list };
}

let root: Root;
let container: HTMLDivElement;

function Harness({ threadKey, list }: { threadKey: string; list: unknown }) {
  useHuyChatIntegration(CONTEXT, {
    threadKey,
    getList: () => list as LegendListRef,
    beforeScroll: () => {},
    composerTop: () => null,
    cite: null,
  });
  return null;
}

const render = (threadKey: string, list: unknown) =>
  act(() => root.render(<Harness threadKey={threadKey} list={list} />));
const press = (command: Parameters<typeof dispatchTimelineCommand>[0]) =>
  act(() => {
    dispatchTimelineCommand(command);
    vi.advanceTimersByTime(40);
  });
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Shows the cursor, steps twice within the band, then starts landing the next block. */
function startLanding() {
  press("next");
  press("next");
  press("next");
  press("next");
}

it("lands a block that leaves the band on the band's top line", async () => {
  const { list, node } = fakeTimeline("a");
  await render("a", list);
  startLanding();
  wait(1000);
  // Block 4 starts at 440px; the band's top line is 138px down.
  expect(node.scrollTop).toBeCloseTo(440 - 137.6, 1);
});

it("places the cursor's block at the top, center, or bottom like Vim's zt, zz, and zb", async () => {
  const { list, node } = fakeTimeline("a");
  node.scrollTop = 1000;
  await render("a", list);
  // Reading starts at block 10 (1100px to 1200px): zt puts its top 52.4px down, just inside the
  // readable area, zz its middle at the view's middle, and zb its bottom 563.6px down.
  press("view.top");
  wait(1000);
  expect(node.scrollTop).toBeCloseTo(1100 - 52.4, 1);
  press("view.center");
  wait(1000);
  expect(node.scrollTop).toBeCloseTo(1150 - 308, 1);
  press("view.bottom");
  wait(1000);
  expect(node.scrollTop).toBeCloseTo(1200 - 563.6, 1);
});

it("leaves the view where the user scrolls it during a landing", async () => {
  const { list, node } = fakeTimeline("a");
  await render("a", list);
  startLanding();
  wait(100);
  act(() => {
    node.dispatchEvent(new Event("wheel"));
    node.scrollTop = 50;
  });
  wait(1000);
  expect(node.scrollTop).toBe(50);
});

it("still lands when the list shifts under a landing by itself", async () => {
  const { list, node } = fakeTimeline("a");
  await render("a", list);
  startLanding();
  wait(100);
  act(() => {
    node.scrollTop += 7;
  });
  wait(1000);
  expect(node.scrollTop).toBeCloseTo(440 - 137.6, 1);
});

it("drops a landing when the reused timeline switches to another thread", async () => {
  const a = fakeTimeline("a");
  await render("a", a.list);
  startLanding();
  wait(100);
  // Server threads reuse ChatView and its list; the next thread restores its own position.
  const b = fakeTimeline("b", a.node, a.list);
  await render("b", b.list);
  act(() => {
    a.node.scrollTop = 500;
  });
  wait(1000);
  expect(a.node.scrollTop).toBe(500);
  expect(b.list.scrollToIndex).not.toHaveBeenCalled();
});

it("reads afresh after scrolling by hand, instead of treating k as a reversal", async () => {
  const { list, node } = fakeTimeline("a");
  await render("a", list);
  // Read down to block 3, then scroll by hand while it stays on screen.
  press("next");
  press("next");
  press("next");
  act(() => {
    node.dispatchEvent(new Event("wheel"));
    node.scrollTop = 250;
  });
  wait(40);
  press("previous");
  wait(1000);
  // A fresh step up lands block 2's bottom on the band's bottom line (clamped to the top); a
  // reversal would have landed its top on the band's top line, at 82px.
  expect(node.scrollTop).toBe(0);
});

it("hands Enter to the cursor's changed file and leaves it to the composer elsewhere", async () => {
  const { list, node } = fakeTimeline("a");
  const file = document.createElement("button");
  file.dataset.changedFilesEntry = "file";
  file.dataset.changedFilesPath = "README.md";
  file.getBoundingClientRect = () =>
    ({ top: 20 * 110 - node.scrollTop, bottom: 20 * 110 + 30, height: 30, left: 0 }) as DOMRect;
  const opened = vi.fn();
  file.addEventListener("click", opened);
  const card = document.createElement("div");
  card.dataset.changedFilesState = "tree";
  card.append(file);
  node.querySelector("[data-timeline-row-id]")!.append(card);
  await render("a", list);
  press("next");
  expect(dispatchTimelineCommand("activate")).toBe(false);
  for (let step = 0; step < 20; step++) press("next");
  wait(1000);
  expect(file.hasAttribute("data-reading-cursor")).toBe(true);
  expect(dispatchTimelineCommand("activate")).toBe(true);
  expect(opened).toHaveBeenCalledOnce();
});

it("steps h out of a changed file to the card's header without a full motion", async () => {
  const { list, node } = fakeTimeline("a");
  const card = document.createElement("div");
  card.dataset.changedFilesState = "tree";
  const header = document.createElement("div");
  header.dataset.changedFilesHeader = "";
  const file = document.createElement("button");
  file.dataset.changedFilesEntry = "file";
  file.dataset.changedFilesPath = "README.md";
  card.getBoundingClientRect = header.getBoundingClientRect = () =>
    ({ top: 20 * 110 - node.scrollTop, bottom: 0, height: 30, left: 0 }) as DOMRect;
  file.getBoundingClientRect = () =>
    ({ top: 20 * 110 + 30 - node.scrollTop, bottom: 0, height: 30, left: 0 }) as DOMRect;
  card.append(header, file);
  node.querySelector("[data-timeline-row-id]")!.append(card);
  Object.defineProperty(node, "scrollHeight", { configurable: true, value: 20 * 110 + 60 });
  await render("a", list);
  press("next");
  // Off a card, h and l leave the key to the caller's feedback.
  expect(dispatchTimelineCommand("tree.out")).toBe(false);
  for (let step = 0; step < 21; step++) press("next");
  wait(1000);
  expect(file.hasAttribute("data-reading-cursor")).toBe(true);
  expect(dispatchTimelineCommand("tree.out")).toBe(true);
  expect(header.hasAttribute("data-reading-cursor")).toBe(true);
});

/**
 * A tool group header at 100px over an expanded group whose scroller shows 100px from 130px down.
 * Its calls sit 150px apart, so each one past the first starts out of the group's view; only the
 * `mounted` ones are rendered until the group's list renders more.
 */
function toolGroupTimeline(calls: number, mounted: readonly number[]) {
  const node = document.createElement("div");
  const rect = (top: number, height: number) =>
    ({ top, bottom: top + height, height, left: 0, right: 600, width: 600 }) as DOMRect;
  const header = document.createElement("div");
  Object.assign(header.dataset, { timelineRowId: "work-toggle:w", timelineRowKind: "work-toggle" });
  header.innerHTML = `<button aria-expanded="true">Ran ${calls} commands</button>`;
  header.getBoundingClientRect = () => rect(100 - node.scrollTop, 30);
  const details = document.createElement("div");
  Object.assign(details.dataset, {
    timelineRowId: "work-group:w:details",
    timelineRowKind: "work",
    toolGroupHeader: "work-toggle:w",
  });
  const scroller = document.createElement("div");
  scroller.dataset.toolGroupScroll = "";
  details.append(scroller);
  scroller.getBoundingClientRect = () => rect(130 - node.scrollTop, 100);
  const mountCall = (index: number) => {
    const call = document.createElement("div");
    call.dataset.workEntryIndex = String(index);
    call.innerHTML = `<div role="button" aria-expanded="false">call ${index}</div>`;
    call.getBoundingClientRect = () =>
      rect(130 + index * 150 - scroller.scrollTop - node.scrollTop, 30);
    scroller.append(call);
    return call;
  };
  for (const index of mounted) mountCall(index);
  const callElement = (index: number) =>
    scroller.querySelector<HTMLElement>(`[data-work-entry-index="${index}"]`);
  details.getBoundingClientRect = () => rect(130 - node.scrollTop, 100);
  node.append(header, details);
  node.getBoundingClientRect = () => rect(0, VIEWPORT);
  Object.defineProperty(node, "clientHeight", { configurable: true, value: VIEWPORT });
  Object.defineProperty(node, "scrollHeight", { configurable: true, value: VIEWPORT });
  document.body.append(node);
  const rows = [
    { id: "work-toggle:w", kind: "work-toggle" },
    { id: "work-group:w:details", kind: "work" },
  ];
  const list = {
    getState: () => ({
      data: rows,
      indexByKey: (key: string) => {
        const index = rows.findIndex((row) => row.id === key);
        return index < 0 ? undefined : index;
      },
      positionAtIndex: (index: number) => (index === 0 ? 100 : 130),
    }),
    getScrollableNode: () => node,
    scrollToIndex: vi.fn(),
  };
  // Like Legend, the group's own list renders a call when asked to scroll to it.
  const groupList = {
    getState: () => ({ data: Array.from({ length: calls }) }),
    scrollToIndex: vi.fn(({ index }: { index: number }) => {
      if (!callElement(index)) mountCall(index);
    }),
  };
  const unregister = registerToolGroupList(scroller, groupList as unknown as LegendListRef);
  return { node, list, header, scroller, callElement, groupList, unregister };
}

it("scrolls a tool call into its group's scroller and steps h out to the group header", async () => {
  const { list, header, scroller, callElement } = toolGroupTimeline(2, [0, 1]);
  await render("a", list);
  press("next");
  press("next");
  press("next");
  wait(1000);
  // The second call scrolled up inside the group, clear of its bottom fade.
  expect(callElement(1)!.hasAttribute("data-reading-cursor")).toBe(true);
  expect(scroller.scrollTop).toBe(150 + 30 - 100 + 24);
  expect(dispatchTimelineCommand("tree.out")).toBe(true);
  wait(1000);
  expect(header.hasAttribute("data-reading-cursor")).toBe(true);
});

it("has the group render the next call instead of stepping past the calls it has not rendered", async () => {
  const { list, callElement, groupList } = toolGroupTimeline(4, [0, 1]);
  await render("a", list);
  press("next");
  press("next");
  press("next");
  wait(1000);
  expect(callElement(1)!.hasAttribute("data-reading-cursor")).toBe(true);
  press("next");
  wait(1000);
  expect(groupList.scrollToIndex).toHaveBeenCalledWith(expect.objectContaining({ index: 2 }));
  expect(callElement(2)!.hasAttribute("data-reading-cursor")).toBe(true);
});

it("drops the cursor once its call scrolls out of the group's own view", async () => {
  const { list, scroller, callElement } = toolGroupTimeline(2, [0, 1]);
  await render("a", list);
  press("next");
  press("next");
  press("next");
  wait(1000);
  expect(callElement(1)!.hasAttribute("data-reading-cursor")).toBe(true);
  // Scrolling the group back by hand hides the call below the group's view; scroll events do
  // not bubble out of the group.
  act(() => {
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event("scroll"));
  });
  wait(40);
  expect(callElement(1)!.hasAttribute("data-reading-cursor")).toBe(false);
  // Enter no longer reaches the hidden call.
  expect(dispatchTimelineCommand("activate")).toBe(false);
});
