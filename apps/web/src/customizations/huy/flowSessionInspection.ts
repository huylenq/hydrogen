import { deriveFlow } from "../../components/Flow.logic";
import { useFlowStore } from "../../flowStore";
import { requestModalFocus } from "../../modalKeyboardStore";
import { readThreadShells } from "../../state/entities";

/** Leave an explicitly opened Flow session and restore the working-session grid. */
export function returnToFlowOverview(): boolean {
  const flow = useFlowStore.getState();
  if (!flow.open || flow.inspectedThreadKey === null) return false;

  flow.inspectSession(null);
  requestModalFocus("conversation");
  return true;
}

/** Escape returns only to an overview that shows on its own. With threads queued,
 * clearing the session would jump to the oldest one; `w g` opens the overview instead. */
export function escapeToFlowOverview(): boolean {
  const { attention } = deriveFlow(readThreadShells(), { now: new Date().toISOString() });
  return attention.length === 0 && returnToFlowOverview();
}
