import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, type ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { act, StrictMode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { selectThreadPanelOpen, useRightPanelStore } from "../../rightPanelStore";
import { requestCommitDialog, useCommitDialogRequest } from "./commitDialogRequest";

const ref = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-A"));
let renderer: ReactTestRenderer | undefined;

function GitActions({ ready, open }: { ready: boolean; open: () => void }) {
  useCommitDialogRequest(ref, ready, open);
  return null;
}

const cardOpen = (thread: ScopedThreadRef = ref) =>
  selectThreadPanelOpen(
    useRightPanelStore.getState().threadPanelVisibilityByThreadKey,
    thread,
    "inline",
  );

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  useRightPanelStore.setState({ threadPanelVisibilityByThreadKey: {} });
  useRightPanelStore.getState().setThreadPanelOpen(ref, "inline", false);
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("commit dialog request", () => {
  it("opens the closed details card, then the dialog once git status is known", async () => {
    const open = vi.fn();
    expect(requestCommitDialog(ref, "inline")).toBe(true);
    expect(cardOpen()).toBe(true);
    await act(() => {
      renderer = create(
        <StrictMode>
          <GitActions ready={false} open={open} />
        </StrictMode>,
      );
    });
    await act(() => vi.runAllTimers());
    expect(open).not.toHaveBeenCalled();
    await act(() =>
      renderer?.update(
        <StrictMode>
          <GitActions ready open={open} />
        </StrictMode>,
      ),
    );
    expect(open).toHaveBeenCalledTimes(1);
    await act(() => renderer?.update(<GitActions ready={false} open={open} />));
    await act(() => renderer?.update(<GitActions ready open={open} />));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("leaves the command to the open card's git actions", () => {
    useRightPanelStore.getState().setThreadPanelOpen(ref, "inline", true);
    expect(requestCommitDialog(ref, "inline")).toBe(false);
  });

  it("drops the request when its git actions unmount before git status loads", async () => {
    const open = vi.fn();
    requestCommitDialog(ref, "inline");
    await act(() => {
      renderer = create(<GitActions ready={false} open={open} />);
    });
    await act(() => renderer?.unmount());
    await act(() => vi.runAllTimers());
    await act(() => {
      renderer = create(<GitActions ready open={open} />);
    });
    expect(open).not.toHaveBeenCalled();
  });

  it("keeps the request while the card moves between popover and inline", async () => {
    const open = vi.fn();
    requestCommitDialog(ref, "popover");
    await act(() => {
      renderer = create(<GitActions key="popover" ready={false} open={open} />);
    });
    await act(() => renderer?.update(<GitActions key="inline" ready={false} open={open} />));
    await act(() => vi.runAllTimers());
    await act(() => renderer?.update(<GitActions key="inline" ready open={open} />));
    expect(open).toHaveBeenCalledTimes(1);
  });
});
