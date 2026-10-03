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

  it("leaves git commands to their owner and does not dispatch a handled command twice", async () => {
    const git = vi.fn(() => true);
    const execute = vi.fn(() => true);
    releases.push(registerAppCommands((command) => command === "git.commit" && git()));
    function Chat() {
      useChatCommands(execute, () => true);
      return null;
    }
    await act(() => {
      renderer = create(<Chat />);
    });
    expect(runAppCommand("git.commit")).toBe(true);
    expect(git).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
    expect(runAppCommand("thread.pin")).toBe(true);
    expect(execute).toHaveBeenCalledExactlyOnceWith("thread.pin", false);
  });
});
