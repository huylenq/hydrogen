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
