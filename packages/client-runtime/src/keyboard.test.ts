import { describe, expect, it } from "vite-plus/test";
import {
  layerModalBindings,
  MODAL_COMMANDS,
  modalReturnIndex,
  modalTargetIndex,
  resolveModalSequence,
} from "./keyboard.ts";

const all = () => true;

describe("modal keyboard sequences", () => {
  it("leaves bare digits to the app's own thread shortcuts", () => {
    for (const key of ["0", "1", "5", "9"]) {
      expect(resolveModalSequence([], key, false, all)).toEqual({ kind: "pass" });
    }
  });

  it("navigates a flow, opens an item, enters the composer, and returns through a workspace command", () => {
    expect(resolveModalSequence([], "j", false, all)).toEqual({ kind: "command", command: "next" });
    expect(modalTargetIndex(3, 0, "next")).toBe(1);
    expect(resolveModalSequence([], "Enter", false, all)).toEqual({
      kind: "command",
      command: "activate",
    });
    expect(resolveModalSequence([], "i", false, all)).toEqual({
      kind: "command",
      command: "composer",
    });
    expect(resolveModalSequence([], "w", false, all)).toEqual({
      kind: "pending",
      keys: ["w"],
    });
    expect(resolveModalSequence(["w"], "q", false, all)).toEqual({
      kind: "command",
      command: "flow.toggle",
    });
    expect(resolveModalSequence([], "q", false, all)).toEqual({
      kind: "command",
      command: "focus.flow",
    });
  });

  it("does not repeat side effects or complete a prefix on key repeat", () => {
    expect(resolveModalSequence(["w"], " ", true, all)).toEqual({ kind: "pending", keys: ["w"] });
    expect(resolveModalSequence([], "Enter", true, all)).toEqual({ kind: "cancel" });
    expect(resolveModalSequence([], "j", true, all)).toEqual({ kind: "command", command: "next" });
    expect(resolveModalSequence(["t"], "p", true, all)).toEqual({
      kind: "pending",
      keys: ["t"],
    });
  });

  it("cancels a mistyped prefix without reinterpreting its tail as an action", () => {
    expect(resolveModalSequence(["w"], "x", false, all)).toEqual({ kind: "cancel" });
    expect(resolveModalSequence(["g"], "i", false, all)).toEqual({ kind: "cancel" });
    expect(resolveModalSequence(["w"], "Escape", false, all)).toEqual({ kind: "cancel" });
    expect(resolveModalSequence([], "x", false, all)).toEqual({ kind: "pass" });
  });

  it("keeps a prefix through modifier presses and supports shifted G", () => {
    expect(resolveModalSequence(["w"], "Shift", false, all)).toEqual({ kind: "pass" });
    expect(resolveModalSequence(["g"], "g", false, all)).toEqual({
      kind: "command",
      command: "first",
    });
    expect(resolveModalSequence([], "G", false, all)).toEqual({ kind: "command", command: "last" });
  });

  it("does not reserve prefixes or run commands unavailable in the current view", () => {
    const onlyHelp = (command: string) => command === "help";
    expect(resolveModalSequence([], "f", false, onlyHelp)).toEqual({ kind: "pass" });
    expect(resolveModalSequence(["t"], "n", false, onlyHelp)).toEqual({ kind: "cancel" });
    expect(resolveModalSequence([], "?", false, onlyHelp)).toEqual({
      kind: "command",
      command: "help",
    });
  });

  it("supports direct commands and exposes real prefixes only", () => {
    for (const [key, command] of [
      ["n", "chat.new"],
      ["a", "chat.new"],
      ["s", "thread.snooze"],
      ["A", "question.focus"],
      ["m", "modelPicker.toggle"],
      ["e", "composer.reasoning"],
      ["r", "review.focus"],
      [",", "settings"],
      ["/", "threadSwitcher.toggle"],
      ["F", "flow.toggle"],
    ] as const) {
      expect(resolveModalSequence([], key, false, all)).toEqual({ kind: "command", command });
      expect(resolveModalSequence([], key, true, all)).toEqual({ kind: "cancel" });
    }
    for (const [group, key, command] of [
      ["w", "s", "sidebar.toggle"],
      ["w", "q", "flow.toggle"],
      ["w", " ", "rightPanel.toggle"],
      ["w", "t", "terminal.toggle"],
      ["w", "m", "rightPanel.toggleMaximized"],
      ["t", "p", "thread.pin"],
      ["t", "s", "thread.settle"],
      ["t", "f", "thread.important"],
      ["g", "k", "git.commit"],
      ["f", "f", "filePicker.toggle"],
      ["f", "s", "projectSearch.toggle"],
    ] as const) {
      const pending = resolveModalSequence([], group, false, all);
      expect(pending).toEqual({ kind: "pending", keys: [group] });
      if (pending.kind !== "pending") throw new Error("Expected a group prefix");
      expect(resolveModalSequence(pending.keys, key, false, all)).toEqual({
        kind: "command",
        command,
      });
    }
    expect(resolveModalSequence(["w"], " ", true, all)).toEqual({ kind: "pending", keys: ["w"] });
    expect(resolveModalSequence(["t"], "n", false, all)).toEqual({ kind: "cancel" });
    expect(resolveModalSequence(["f"], "q", false, all)).toEqual({ kind: "cancel" });
  });

  it("moves between areas without repeating and cancels prefixes before returning to content", () => {
    for (const [key, command] of [
      ["h", "left"],
      ["l", "right"],
    ] as const) {
      for (const repeat of [false, true]) {
        expect(resolveModalSequence([], key, repeat, all)).toEqual({ kind: "command", command });
      }
    }
    for (const [key, command] of [
      ["H", "focus.left"],
      ["L", "focus.right"],
      ["Escape", "focus.conversation"],
    ] as const) {
      expect(resolveModalSequence([], key, false, all)).toEqual({ kind: "command", command });
      expect(resolveModalSequence([], key, true, all)).toEqual({ kind: "cancel" });
    }
    expect(resolveModalSequence(["w"], "Escape", false, all)).toEqual({ kind: "cancel" });
    expect(resolveModalSequence([], "Escape", false, all)).toEqual({
      kind: "command",
      command: "focus.conversation",
    });
    expect(resolveModalSequence(["w"], " ", false, all)).toEqual({
      kind: "command",
      command: "rightPanel.toggle",
    });
    expect(resolveModalSequence(["w"], "r", false, all)).toEqual({ kind: "cancel" });
    expect(resolveModalSequence([], "q", false, all)).toEqual({
      kind: "command",
      command: "focus.flow",
    });
  });

  it("reads by block, section, and turn, with Control+J/K scrolling and holdable motions", () => {
    for (const [key, command] of [
      ["j", "next"],
      ["k", "previous"],
      ["h", "left"],
      ["l", "right"],
      ["J", "message.next"],
      ["K", "message.previous"],
      ["Ctrl+j", "scroll.down"],
      ["Ctrl+k", "scroll.up"],
      // Space reads on like j; Shift+Space reads back.
      [" ", "next"],
      ["Shift+Space", "previous"],
    ] as const) {
      for (const repeat of [false, true]) {
        expect(resolveModalSequence([], key, repeat, all)).toEqual({ kind: "command", command });
      }
    }
    expect(resolveModalSequence([], "c", false, all)).toEqual({
      kind: "command",
      command: "reading.cite",
    });
    expect(resolveModalSequence([], "c", true, all)).toEqual({ kind: "cancel" });
    expect(resolveModalSequence([], "z", false, all)).toEqual({ kind: "pending", keys: ["z"] });
    for (const [key, command] of [
      ["t", "view.top"],
      ["z", "view.center"],
      ["b", "view.bottom"],
      ["i", "reading.lamp"],
    ] as const) {
      expect(resolveModalSequence(["z"], key, false, all)).toEqual({ kind: "command", command });
    }
  });

  it("moves between areas through H/L or the workspace prefix", () => {
    expect(resolveModalSequence(["w"], "h", false, all)).toEqual({
      kind: "command",
      command: "focus.left",
    });
    expect(resolveModalSequence(["w"], "l", false, all)).toEqual({
      kind: "command",
      command: "focus.right",
    });
    expect(resolveModalSequence(["w"], "l", true, all)).toEqual({ kind: "pending", keys: ["w"] });
  });

  it("has no ambiguous action/prefix pairs", () => {
    for (const left of MODAL_COMMANDS) {
      for (const right of MODAL_COMMANDS) {
        if (left === right) continue;
        expect(left.keys.every((key, index) => key === right.keys[index])).toBe(false);
      }
    }
  });
});

describe("modal focus bookmarks", () => {
  it("restores the same thread after reorder and its neighbour after removal", () => {
    const bookmark = { key: "env-1:thread-2", index: 1 };
    expect(modalReturnIndex(["env-1:thread-2", "env-1:thread-1"], bookmark)).toBe(0);
    expect(modalReturnIndex(["env-1:thread-1", "env-1:thread-3"], bookmark)).toBe(1);
    expect(modalReturnIndex(["env-1:thread-1"], bookmark)).toBe(0);
    expect(modalReturnIndex([], bookmark)).toBeNull();
  });

  it("keeps environment identity and clamps movement at both ends", () => {
    expect(
      modalReturnIndex(["env-2:thread-2", "env-1:thread-2"], { key: "env-1:thread-2", index: 0 }),
    ).toBe(1);
    expect(modalTargetIndex(3, 0, "previous")).toBe(0);
    expect(modalTargetIndex(3, 2, "next")).toBe(2);
    expect(modalTargetIndex(0, 0, "first")).toBeNull();
    expect(modalTargetIndex(3, -1, "last")).toBe(2);
  });
});

describe("section bindings", () => {
  it.each([
    ["[", "section.previous"],
    ["]", "section.next"],
  ] as const)("resolves %s%s and keeps stepping while the key is held", (key, command) => {
    expect(resolveModalSequence([], key, false, all)).toEqual({ kind: "pending", keys: [key] });
    expect(resolveModalSequence([key], key, false, all)).toEqual({ kind: "command", command });
    // Held from the first press, or again after a step.
    expect(resolveModalSequence([key], key, true, all)).toEqual({ kind: "command", command });
    expect(resolveModalSequence([], key, true, all)).toEqual({ kind: "command", command });
  });

  it("leaves nothing pending when the end of a sequence is held", () => {
    expect(resolveModalSequence([], "t", true, all)).toEqual({ kind: "cancel" });
  });
});

describe("layered keymaps", () => {
  const overlay = [
    { keys: ["["], command: "hunk.previous", label: "Previous hunk", repeatable: true },
    { keys: ["j"], command: "line.next", label: "Next line", repeatable: true },
    { keys: ["g", "h"], command: "parent", label: "Parent" },
  ] as const;
  const layered = layerModalBindings(overlay, MODAL_COMMANDS);

  it("retires app sequences an overlay key shadows or prefixes", () => {
    const keys = layered.map((binding) => binding.keys.join(" "));
    expect(keys).not.toContain("[ [");
    expect(keys.filter((key) => key === "j")).toHaveLength(1);
    expect(keys).toContain("] ]");
    expect(keys).toContain("g k");
    for (const left of layered) {
      for (const right of layered) {
        if (left === right) continue;
        expect(left.keys.every((key, index) => key === right.keys[index])).toBe(false);
      }
    }
  });

  it("resolves overlay keys first and repeats overlay motions marked repeatable", () => {
    expect(resolveModalSequence([], "[", false, all, layered)).toEqual({
      kind: "command",
      command: "hunk.previous",
    });
    expect(resolveModalSequence([], "[", true, all, layered)).toEqual({
      kind: "command",
      command: "hunk.previous",
    });
    expect(resolveModalSequence([], "j", true, all, layered)).toEqual({
      kind: "command",
      command: "line.next",
    });
    expect(resolveModalSequence(["g"], "h", true, all, layered)).toEqual({
      kind: "pending",
      keys: ["g"],
    });
    expect(resolveModalSequence(["w"], "h", false, all, layered)).toEqual({
      kind: "command",
      command: "focus.left",
    });
  });
});
