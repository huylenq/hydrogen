import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { registerAppCommands, runAppCommand } from "../../appCommands";
import { useChatCommands } from "./useChatCommands";

let renderer: ReactTestRenderer | undefined;
const releases: (() => void)[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  for (const release of releases.splice(0)) release();
  vi.unstubAllGlobals();
});

describe("chat action integration", () => {
  it("uses the current thread after navigation, without changing mounted command priority", async () => {
    const actions: string[] = [];
    function Chat({ thread }: { thread: string }) {
      useChatCommands(
        (command) => {
          if (command !== "thread.pin") return false;
          actions.push(thread);
          return true;
        },
        () => false,
      );
      return null;
    }
    await act(() => {
      renderer = create(<Chat thread="first" />);
    });
    expect(runAppCommand("thread.pin")).toBe(true);
    const releaseOverlay = registerAppCommands((command) => {
      if (command !== "thread.pin") return false;
      actions.push("overlay");
      return true;
    });
    releases.push(releaseOverlay);
    await act(() => renderer?.update(<Chat thread="second" />));
    expect(runAppCommand("thread.pin")).toBe(true);
    releaseOverlay();
    expect(runAppCommand("thread.pin")).toBe(true);
    expect(actions).toEqual(["first", "overlay", "second"]);
    await act(() => renderer?.unmount());
    renderer = undefined;
    expect(runAppCommand("thread.pin")).toBe(false);
  });

  it("does not dispatch a handled command twice", async () => {
    const execute = vi.fn(() => true);
    function Chat() {
      useChatCommands(execute, () => true);
      return null;
    }
    await act(() => {
      renderer = create(<Chat />);
    });
    expect(runAppCommand("thread.pin")).toBe(true);
    expect(execute).toHaveBeenCalledExactlyOnceWith("thread.pin", false);
  });
});
