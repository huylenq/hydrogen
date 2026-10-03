import { describe, expect, it } from "vite-plus/test";
import { userMessageJumpIndex } from "./useHuyChatIntegration";

// user, assistant, work, user, assistant, user
const rows = [true, false, false, true, false, true];

describe("userMessageJumpIndex", () => {
  it("moves to the next user message after the reading line", () => {
    expect(userMessageJumpIndex(rows, 1, false, "next")).toBe(3);
    expect(userMessageJumpIndex(rows, 3, true, "next")).toBe(5);
    expect(userMessageJumpIndex(rows, -1, false, "next")).toBe(0);
  });

  it("returns to the start of a user message the reader is partway through", () => {
    expect(userMessageJumpIndex(rows, 3, false, "previous")).toBe(3);
    expect(userMessageJumpIndex(rows, 3, true, "previous")).toBe(0);
    expect(userMessageJumpIndex(rows, 4, false, "previous")).toBe(3);
  });

  it("stops at either end", () => {
    expect(userMessageJumpIndex(rows, 5, true, "next")).toBeNull();
    expect(userMessageJumpIndex(rows, 0, true, "previous")).toBeNull();
  });
});
