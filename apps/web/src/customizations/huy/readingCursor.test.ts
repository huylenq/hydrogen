// @vitest-environment jsdom
import { afterEach, expect, it } from "vite-plus/test";
import { markReadingCursor } from "./readingCursor";

afterEach(() => {
  markReadingCursor(null, null, false);
  document.body.innerHTML = "";
});

function timeline() {
  // Rows sit in a frame and a clipped content lane, as the timeline renders them.
  const frame = (id: string, row: string) =>
    `<div class="messages-timeline-row-frame" id="${id}"><div class="chat-content-lane">${row}</div></div>`;
  document.body.innerHTML =
    `<div id="scroller">` +
    frame(
      "answer-frame",
      `<div data-timeline-row-id="answer"><div><div class="chat-markdown"><p id="first">a</p><ul><li id="item">b</li></ul></div></div></div>`,
    ) +
    frame(
      "user-frame",
      `<div data-timeline-row-id="user" id="user"><div data-user-message-bubble id="bubble">c</div></div>`,
    ) +
    `</div>`;
  return (id: string) => document.getElementById(id)!;
}

const marked = () =>
  [...document.querySelectorAll("[data-reading-cursor], [data-reading-path]")].map(
    (node) =>
      node.id || node.getAttribute("data-timeline-row-id") || node.className || node.tagName,
  );

it("marks the cursor's block and its ancestors up to the row, and moves the mark cleanly", () => {
  const byId = timeline();
  const root = byId("scroller");
  markReadingCursor(root, byId("item"), false);
  expect(root.dataset.reading).toBe("cursor");
  expect(byId("item").hasAttribute("data-reading-cursor")).toBe(true);
  expect(marked()).toEqual(["answer", "DIV", "chat-markdown", "UL", "item"]);

  // A user message shows the cursor on its bubble, and the lamp switches the mode.
  markReadingCursor(root, byId("user"), true);
  expect(root.dataset.reading).toBe("lamp");
  expect(marked()).toEqual(["user", "bubble"]);
  expect(byId("bubble").hasAttribute("data-reading-cursor")).toBe(true);
});

it("draws the bar from the cursor row's frame, but not for a user message", () => {
  const byId = timeline();
  const root = byId("scroller");
  markReadingCursor(root, byId("item"), false);
  expect(byId("answer-frame").hasAttribute("data-reading-bar")).toBe(true);
  expect(byId("answer-frame").style.getPropertyValue("--reading-bar-height")).toBe("0px");

  // A user message's highlighted bubble border marks the cursor instead.
  markReadingCursor(root, byId("user"), false);
  expect(byId("answer-frame").hasAttribute("data-reading-bar")).toBe(false);
  expect(byId("answer-frame").style.getPropertyValue("--reading-bar-height")).toBe("");
  expect(byId("user-frame").hasAttribute("data-reading-bar")).toBe(false);
});

it("hides without leaving marks behind", () => {
  const byId = timeline();
  markReadingCursor(byId("scroller"), byId("first"), true);
  markReadingCursor(null, null, true);
  expect(marked()).toEqual([]);
  expect(byId("scroller").hasAttribute("data-reading")).toBe(false);
  expect(byId("answer-frame").hasAttribute("data-reading-bar")).toBe(false);
});
