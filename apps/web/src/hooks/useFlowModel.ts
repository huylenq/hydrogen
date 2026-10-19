import { deriveFlow } from "../components/Flow.logic";
import { useThreadShells } from "../state/entities";
import { useNowMinute } from "./useNowMinute";
import { useSessionImportanceStore } from "../customizations/huy/sessionImportance";

export function useFlowModel() {
  const threads = useThreadShells();
  const nowMinute = useNowMinute();
  const importantThreadKeys = useSessionImportanceStore((state) => state.keys);
  return (() => deriveFlow(threads, { now: `${nowMinute}:00.000Z`, importantThreadKeys }))();
}
