import { getClientSettings } from "../../hooks/useSettings";
import { requestModalFocus } from "../../modalKeyboardStore";

/** Capture focus at submission; delayed acceptance must not steal it from another control. */
export function captureComposerAcceptance() {
  const editor = document.activeElement;
  return () => {
    if (
      getClientSettings().modalKeyboardEnabled &&
      editor instanceof HTMLElement &&
      editor.isConnected &&
      document.activeElement === editor
    ) {
      editor.blur();
      requestModalFocus("conversation");
    }
  };
}
