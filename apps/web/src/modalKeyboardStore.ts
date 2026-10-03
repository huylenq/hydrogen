import type { ModalThreadContext } from "./modalKeyboardCommands";
import { create } from "zustand";

export type ModalSurface = "flow" | "sidebar" | "conversation" | "rightPanel" | "question";
type Bookmark = { key: string; index: number };

interface ModalKeyboardState {
  threadContext: ModalThreadContext | null;
  previousSurface: ModalSurface | null;
  feedback: string | null;
  mode: "normal" | "insert";
  surface: ModalSurface;
  pending: readonly string[];
  help: boolean;
  focusRequest: ModalSurface | null;
  focusRightPanelTabs: boolean;
  bookmarks: Partial<Record<ModalSurface, Bookmark>>;
}

export const useModalKeyboardStore = create<ModalKeyboardState>(() => ({
  threadContext: null,
  previousSurface: null,
  feedback: null,
  mode: "normal",
  surface: "conversation",
  pending: [],
  help: false,
  focusRequest: null,
  focusRightPanelTabs: false,
  bookmarks: {},
}));

export function requestModalFocus(surface: ModalSurface, focusRightPanelTabs = false): void {
  useModalKeyboardStore.setState({
    mode: "normal",
    pending: [],
    focusRequest: surface,
    focusRightPanelTabs,
  });
}

/** Prefix cancellation leaves the shortcut reference visible during navigation. */
export function clearModalSequence(): void {
  if (useModalKeyboardStore.getState().pending.length) {
    useModalKeyboardStore.setState({ pending: [] });
  }
}

export function closeModalHelp(): void {
  useModalKeyboardStore.setState({ help: false, pending: [] });
}

export function toggleModalHelp(): void {
  useModalKeyboardStore.setState((state) => ({ help: !state.help, pending: [] }));
}

export function rememberModalSurface(surface: ModalSurface): void {
  const current = useModalKeyboardStore.getState();
  if (surface === current.surface) return;
  useModalKeyboardStore.setState({
    surface,
    previousSurface:
      surface !== "question" && current.surface !== "question"
        ? current.surface
        : current.previousSurface,
  });
}

export function showModalFeedback(feedback: string): void {
  useModalKeyboardStore.setState({ feedback });
}
