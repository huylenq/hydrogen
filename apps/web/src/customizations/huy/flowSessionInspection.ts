import { useFlowStore } from "../../flowStore";
import { requestModalFocus } from "../../modalKeyboardStore";

/** Leave an explicitly opened Flow session and restore the working-session grid. */
export function returnToFlowOverview(): boolean {
  const flow = useFlowStore.getState();
  if (!flow.open || flow.inspectedThreadKey === null) return false;

  flow.inspectSession(null);
  requestModalFocus("conversation");
  return true;
}
