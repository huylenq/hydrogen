// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { activateModalItem, moveModalFocus, rememberModalFocus } from "../../modalKeyboardDom";
import { useModalKeyboardStore } from "../../modalKeyboardStore";
import { installFlowGridWindowFocus } from "./flowGridWindowFocus";

let cleanup: () => void;
let grid: HTMLElement;
let cards: HTMLElement[];
beforeEach(() => {
  document.body.innerHTML = `<main data-modal-surface="conversation" data-modal-grid="working-sessions" tabindex="-1"><button data-modal-item data-modal-key="a">A</button><button data-modal-item data-modal-key="b">B</button><button data-modal-item data-modal-key="c">C</button></main><input>`;
  grid = document.querySelector("main")!;
  cards = [...grid.querySelectorAll("button")];
  [grid, ...cards].forEach((node, index) => {
    const rect = { top: 0, bottom: 100, left: index * 100, right: index * 100 + 90 } as DOMRect;
    vi.spyOn(node, "getClientRects").mockReturnValue([rect] as unknown as DOMRectList);
    vi.spyOn(node, "getBoundingClientRect").mockReturnValue(rect);
    node.scrollIntoView = vi.fn();
  });
  useModalKeyboardStore.setState({
    mode: "normal",
    surface: "conversation",
    bookmarks: {},
    pending: ["g"],
  });
  cards[1]!.focus();
  rememberModalFocus(cards[1]!);
  cleanup = installFlowGridWindowFocus();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

it("restores the selected card on repeated app switches and allows the next grid motion", () => {
  for (let index = 0; index < 2; index++) {
    window.dispatchEvent(new Event("blur"));
    cards[1]!.blur();
    window.dispatchEvent(new Event("focus"));
    expect(document.activeElement).toBe(cards[1]);
    expect(useModalKeyboardStore.getState().mode).toBe("normal");
    expect(useModalKeyboardStore.getState().pending).toEqual([]);
  }
  moveModalFocus("right");
  expect(document.activeElement).toBe(cards[2]);
});

it("keeps repeated left motion inside the grid when a preview loses focus", () => {
  moveModalFocus("left");
  expect(document.activeElement).toBe(cards[0]);
  moveModalFocus("left");
  expect(document.activeElement).toBe(cards[0]);
  expect(useModalKeyboardStore.getState().focusRequest).toBeNull();

  cards[0]!.replaceWith(cards[0]!.cloneNode(true));
  expect(document.activeElement).toBe(document.body);
  moveModalFocus("left");
  expect(useModalKeyboardStore.getState().focusRequest).toBeNull();
});

it("activates a grid preview into the conversation without requesting the sidebar", () => {
  const open = vi.fn();
  cards[1]!.addEventListener("click", open);

  activateModalItem();
  expect(open).toHaveBeenCalledOnce();
  expect(useModalKeyboardStore.getState().focusRequest).toBe("conversation");
});

it("lets a control tabbed to under a card keep Enter as its click", () => {
  const footerLine = document.createElement("button");
  grid.append(footerLine);
  const open = vi.fn();
  footerLine.addEventListener("click", open);
  footerLine.focus();

  activateModalItem();
  expect(open).toHaveBeenCalledOnce();
});

it("uses the bookmark when the selected card disappears while away", () => {
  window.dispatchEvent(new Event("blur"));
  cards[1]!.remove();
  window.dispatchEvent(new Event("focus"));
  expect(document.activeElement).toBe(cards[2]);
});

it("does not steal focus from a text field on return", () => {
  window.dispatchEvent(new Event("blur"));
  const input = document.querySelector("input")!;
  input.focus();
  window.dispatchEvent(new Event("focus"));
  expect(document.activeElement).toBe(input);
});

it("leaves Insert mode and text editing alone", () => {
  const input = document.querySelector("input")!;
  input.focus();
  useModalKeyboardStore.setState({ mode: "insert" });
  window.dispatchEvent(new Event("blur"));
  window.dispatchEvent(new Event("focus"));
  expect(document.activeElement).toBe(input);
  expect(useModalKeyboardStore.getState().mode).toBe("insert");
});

it("does not restore a grid that was replaced while away", () => {
  window.dispatchEvent(new Event("blur"));
  grid.remove();
  window.dispatchEvent(new Event("focus"));
  expect(document.activeElement).toBe(document.body);
});

it("leaves an open dialog in control on return", () => {
  window.dispatchEvent(new Event("blur"));
  cards[1]!.blur();
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  document.body.append(dialog);
  vi.spyOn(dialog, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  window.dispatchEvent(new Event("focus"));
  expect(document.activeElement).toBe(document.body);
});

it("removes its window listeners on unmount", () => {
  window.dispatchEvent(new Event("blur"));
  cards[1]!.blur();
  cleanup();
  window.dispatchEvent(new Event("focus"));
  expect(document.activeElement).toBe(document.body);
});
