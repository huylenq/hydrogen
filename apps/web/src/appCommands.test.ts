import { describe, expect, it } from "vite-plus/test";
import { registerAppCommands, runAppCommand } from "./appCommands";

describe("app command dispatch", () => {
  it("runs an action once in the current view and releases it when the view leaves", () => {
    const actions: string[] = [];
    const releaseShell = registerAppCommands((command) => {
      if (command !== "chat.new") return false;
      actions.push("new-thread");
      return true;
    });
    const releaseThread = registerAppCommands((command) => {
      if (command !== "thread.pin") return false;
      actions.push("pin-env-2-thread");
      return true;
    });
    try {
      expect(runAppCommand("thread.pin")).toBe(true);
      expect(runAppCommand("chat.new")).toBe(true);
      releaseThread();
      expect(runAppCommand("thread.pin")).toBe(false);
      expect(actions).toEqual(["pin-env-2-thread", "new-thread"]);
    } finally {
      releaseThread();
      releaseShell();
    }
  });
});
