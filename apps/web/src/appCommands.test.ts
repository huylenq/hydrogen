import { describe, expect, it } from "vite-plus/test";
import { registerAppCommands, runAppCommand, runAppCommandFromKey } from "./appCommands";

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

  it.each(["chat first", "panel first"])(
    "hands a panel's shortcut to the panel once, whichever registered first (%s)",
    (order) => {
      let resized = 0;
      // The chat's catch-all handler declines what it does not own.
      const chat = () => registerAppCommands(() => false);
      const panel = () =>
        registerAppCommands((command) => {
          if (command !== "rightPanel.widen") return false;
          resized += 1;
          return true;
        });
      const releases = order === "chat first" ? [chat(), panel()] : [panel(), chat()];
      const key = { prevented: 0, preventDefault() {}, stopPropagation() {} };
      key.preventDefault = () => (key.prevented += 1);
      try {
        expect(runAppCommandFromKey("rightPanel.widen", key as unknown as KeyboardEvent)).toBe(
          true,
        );
        expect(resized).toBe(1);
        expect(key.prevented).toBe(1);
      } finally {
        for (const release of releases) release();
      }
      // With the panel gone the key keeps its native meaning.
      const release = chat();
      try {
        expect(runAppCommandFromKey("rightPanel.widen", key as unknown as KeyboardEvent)).toBe(
          false,
        );
        expect(key.prevented).toBe(1);
      } finally {
        release();
      }
    },
  );
});
