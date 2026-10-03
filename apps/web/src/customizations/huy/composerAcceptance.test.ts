import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useModalKeyboardStore } from "../../modalKeyboardStore";
import { captureComposerAcceptance } from "./composerAcceptance";

const settings = vi.hoisted(() => ({ modalKeyboardEnabled: true }));
vi.mock("../../hooks/useSettings", () => ({ getClientSettings: () => settings }));
class Editor {
  isConnected = true;
  blur() {
    Object.assign(document, { activeElement: null });
  }
}
beforeEach(() => {
  settings.modalKeyboardEnabled = true;
  vi.stubGlobal("HTMLElement", Editor);
  vi.stubGlobal("document", { activeElement: new Editor() });
  useModalKeyboardStore.setState({ mode: "insert", focusRequest: null });
});
afterEach(() => {
  vi.unstubAllGlobals();
  useModalKeyboardStore.setState(useModalKeyboardStore.getInitialState(), true);
});
describe("composer acceptance focus", () => {
  it("returns to normal navigation only when the send is accepted", () => {
    const accepted = captureComposerAcceptance();
    expect(useModalKeyboardStore.getState().mode).toBe("insert");
    accepted();
    expect(document.activeElement).toBeNull();
    expect(useModalKeyboardStore.getState()).toMatchObject({
      mode: "normal",
      focusRequest: "conversation",
    });
  });
  it.each(["moved", "unmounted", "disabled"])(
    "does not steal focus when %s during a delayed send",
    (change) => {
      const accepted = captureComposerAcceptance();
      if (change === "moved") Object.assign(document, { activeElement: new Editor() });
      if (change === "unmounted") Object.assign(document.activeElement!, { isConnected: false });
      if (change === "disabled") settings.modalKeyboardEnabled = false;
      accepted();
      expect(useModalKeyboardStore.getState()).toMatchObject({
        mode: "insert",
        focusRequest: null,
      });
    },
  );
});
