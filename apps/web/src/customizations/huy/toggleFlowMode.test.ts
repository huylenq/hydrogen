import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useFlowStore } from "../../flowStore";
import { toggleFlowMode } from "./toggleFlowMode";

function sidebarControls(overrides: Partial<Parameters<typeof toggleFlowMode>[0]> = {}) {
  return {
    isMobile: false,
    open: true,
    openMobile: false,
    setOpen: vi.fn(),
    setOpenMobile: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  useFlowStore.setState({ open: false, inspectedThreadKey: null, interactionRevision: 0 });
});

afterEach(() => {
  useFlowStore.setState({ open: false, inspectedThreadKey: null, interactionRevision: 0 });
});

describe("toggleFlowMode", () => {
  it("hides the left sidebar when enabling Flow while it is showing", () => {
    const sidebar = sidebarControls();
    expect(toggleFlowMode(sidebar)).toBe(true);
    expect(useFlowStore.getState().open).toBe(true);
    expect(sidebar.setOpen).toHaveBeenCalledExactlyOnceWith(false);
    expect(sidebar.setOpenMobile).not.toHaveBeenCalled();
  });

  it("leaves a hidden sidebar hidden when enabling Flow", () => {
    const sidebar = sidebarControls({ open: false });
    expect(toggleFlowMode(sidebar)).toBe(true);
    expect(useFlowStore.getState().open).toBe(true);
    expect(sidebar.setOpen).not.toHaveBeenCalled();
    expect(sidebar.setOpenMobile).not.toHaveBeenCalled();
  });

  it("hides a visible mobile sidebar sheet when enabling Flow", () => {
    const sidebar = sidebarControls({ isMobile: true, open: false, openMobile: true });
    expect(toggleFlowMode(sidebar)).toBe(true);
    expect(sidebar.setOpenMobile).toHaveBeenCalledExactlyOnceWith(false);
    expect(sidebar.setOpen).not.toHaveBeenCalled();
  });

  it("leaves sidebar visibility unchanged when disabling Flow", () => {
    useFlowStore.getState().setOpen(true);
    const hidden = sidebarControls({ open: false });
    expect(toggleFlowMode(hidden)).toBe(false);
    expect(useFlowStore.getState().open).toBe(false);
    expect(hidden.setOpen).not.toHaveBeenCalled();
    expect(hidden.setOpenMobile).not.toHaveBeenCalled();

    useFlowStore.getState().setOpen(true);
    const showing = sidebarControls({ open: true });
    expect(toggleFlowMode(showing)).toBe(false);
    expect(showing.setOpen).not.toHaveBeenCalled();
    expect(showing.setOpenMobile).not.toHaveBeenCalled();
  });
});
