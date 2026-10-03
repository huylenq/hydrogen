import { describe, expect, it } from "vite-plus/test";
import { pendingUserInputOptionIndex } from "./pendingUserInput";

const event = {
  key: "1",
  defaultPrevented: false,
  isComposing: false,
  keyCode: 49,
  repeat: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
};
const context = { modalEnabled: true, questionFocused: false, editable: false, optionCount: 3 };

describe("numbered question shortcut ownership", () => {
  it("leaves every digit to navigation outside the question in modal mode", () => {
    for (const key of ["1", "2", "3", "9"]) {
      expect(
        pendingUserInputOptionIndex({ ...event, key }, { ...context, optionCount: 9 }),
      ).toBeNull();
    }
    expect(pendingUserInputOptionIndex(event, { ...context, modalEnabled: false })).toBe(0);
  });

  it("selects the numbered answer only within the focused question and available options", () => {
    const focused = { ...context, questionFocused: true };
    expect(pendingUserInputOptionIndex({ ...event, key: "2" }, focused)).toBe(1);
    for (const key of ["0", "4", "9", "12", "!", "Escape"]) {
      expect(pendingUserInputOptionIndex({ ...event, key }, focused)).toBeNull();
    }
    expect(pendingUserInputOptionIndex(event, { ...focused, editable: true })).toBeNull();
  });

  it("never answers from consumed keys, held keys, composition, or modified shortcuts", () => {
    const focused = { ...context, questionFocused: true };
    for (const guard of [
      "defaultPrevented",
      "repeat",
      "isComposing",
      "metaKey",
      "ctrlKey",
      "altKey",
      "shiftKey",
    ] as const) {
      expect(pendingUserInputOptionIndex({ ...event, [guard]: true }, focused)).toBeNull();
    }
    expect(pendingUserInputOptionIndex({ ...event, keyCode: 229 }, focused)).toBeNull();
  });
});
