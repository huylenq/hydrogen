import { afterEach, describe, expect, it } from "vite-plus/test";
import { resolveModalSequence } from "@t3tools/client-runtime/keyboard";
import {
  clearModalSequence,
  closeModalHelp,
  requestModalFocus,
  rememberModalSurface,
  toggleModalHelp,
  useModalKeyboardStore,
} from "./modalKeyboardStore";

const initialState = useModalKeyboardStore.getInitialState();
afterEach(() => useModalKeyboardStore.setState(initialState, true));

describe("persistent keyboard reference", () => {
  it("stays visible through panel focus changes and prefix cancellation", () => {
    toggleModalHelp();
    requestModalFocus("sidebar");
    expect(useModalKeyboardStore.getState()).toMatchObject({ help: true, focusRequest: "sidebar" });
    useModalKeyboardStore.setState({ pending: ["w"] });
    clearModalSequence();
    requestModalFocus("rightPanel");
    expect(useModalKeyboardStore.getState()).toMatchObject({
      help: true,
      pending: [],
      focusRequest: "rightPanel",
    });
  });

  it("allows a workspace sequence to complete without dismissing the reference", () => {
    toggleModalHelp();
    const prefix = resolveModalSequence([], "w", false, () => true);
    expect(prefix.kind).toBe("pending");
    if (prefix.kind !== "pending") throw new Error("Expected workspace prefix");
    useModalKeyboardStore.setState({ pending: prefix.keys });
    const action = resolveModalSequence(
      useModalKeyboardStore.getState().pending,
      "q",
      false,
      () => true,
    );
    expect(action).toEqual({ kind: "command", command: "flow.toggle" });
    clearModalSequence();
    expect(useModalKeyboardStore.getState()).toMatchObject({ help: true, pending: [] });
  });

  it("explicit dismissal clears both the reference and any incomplete command", () => {
    toggleModalHelp();
    useModalKeyboardStore.setState({ pending: ["f"] });
    closeModalHelp();
    expect(useModalKeyboardStore.getState()).toMatchObject({ help: false, pending: [] });
    toggleModalHelp();
    toggleModalHelp();
    expect(useModalKeyboardStore.getState().help).toBe(false);
  });
});

describe("navigation area history", () => {
  it("distinguishes returning to tabs from entering the pane", () => {
    requestModalFocus("rightPanel", true);
    expect(useModalKeyboardStore.getState().focusRightPanelTabs).toBe(true);
    requestModalFocus("rightPanel");
    expect(useModalKeyboardStore.getState().focusRightPanelTabs).toBe(false);
  });
  it("alternates between the last two areas without treating repeated focus or questions as new visits", () => {
    rememberModalSurface("sidebar");
    rememberModalSurface("sidebar");
    expect(useModalKeyboardStore.getState().previousSurface).toBe("conversation");
    rememberModalSurface("conversation");
    expect(useModalKeyboardStore.getState().previousSurface).toBe("sidebar");
    rememberModalSurface("question");
    rememberModalSurface("conversation");
    expect(useModalKeyboardStore.getState().previousSurface).toBe("sidebar");
    rememberModalSurface("rightPanel");
    expect(useModalKeyboardStore.getState().previousSurface).toBe("conversation");
  });
});
