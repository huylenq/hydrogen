import { focusModalSurface, modalOverlayOpen } from "../../modalKeyboardDom";
import { clearModalSequence, useModalKeyboardStore } from "../../modalKeyboardStore";

/** Restore grid navigation after the browser releases focus to another app. */
export function installFlowGridWindowFocus(): () => void {
  let returnTarget: HTMLElement | null = null;
  const onBlur = () => {
    const active = document.activeElement;
    returnTarget =
      useModalKeyboardStore.getState().mode === "normal" &&
      active instanceof HTMLElement &&
      active.closest('[data-modal-grid="working-sessions"]')
        ? active
        : null;
    clearModalSequence();
  };
  const onFocus = () => {
    const target = returnTarget;
    returnTarget = null;
    if (!target || modalOverlayOpen()) return;
    const active = document.activeElement;
    if (active !== target && active !== document.body && active !== document.documentElement)
      return;
    const grid = document.querySelector<HTMLElement>('[data-modal-grid="working-sessions"]');
    if (!grid) return;
    if (target.isConnected && grid.contains(target)) target.focus({ preventScroll: true });
    else if (!focusModalSurface("conversation")) return;
    useModalKeyboardStore.setState({ mode: "normal" });
  };
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);
  return () => {
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onFocus);
  };
}
