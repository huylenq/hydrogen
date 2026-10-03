import { create } from "zustand";

const FLOW_MODE_STORAGE_KEY = "t3code:flow-mode:v1";

function readInitialFlowOpen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const saved = window.localStorage.getItem(FLOW_MODE_STORAGE_KEY);
    // Carry the preference forward from before Flow mode was renamed.
    return (saved ?? window.localStorage.getItem("t3code:work-queue-mode:v1")) === "true";
  } catch {
    return false;
  }
}

interface FlowState {
  readonly open: boolean;
  readonly interactionRevision: number;
  readonly inspectedThreadKey: string | null;
  readonly inspectSession: (threadKey: string | null) => void;
  readonly cancelPendingJump: () => void;
  readonly setOpen: (open: boolean) => void;
  readonly toggle: () => void;
}

export const useFlowStore = create<FlowState>((set) => ({
  open: readInitialFlowOpen(),
  interactionRevision: 0,
  inspectedThreadKey: null,
  inspectSession: (inspectedThreadKey) =>
    set((state) => ({
      inspectedThreadKey,
      interactionRevision: state.interactionRevision + 1,
    })),
  cancelPendingJump: () => set((state) => ({ interactionRevision: state.interactionRevision + 1 })),
  setOpen: (open) =>
    set((state) => ({
      open,
      inspectedThreadKey: null,
      interactionRevision: state.interactionRevision + (state.open === open ? 0 : 1),
    })),
  toggle: () =>
    set((state) => ({
      open: !state.open,
      inspectedThreadKey: null,
      interactionRevision: state.interactionRevision + 1,
    })),
}));

useFlowStore.subscribe((state, previous) => {
  if (state.open === previous.open) return;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FLOW_MODE_STORAGE_KEY, String(state.open));
  } catch {
    // Storage failure must not make navigation unusable.
  }
});
