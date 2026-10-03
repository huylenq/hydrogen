import { useMemo } from "react";
import { deriveFlow } from "../components/Flow.logic";
import { useThreadShells } from "../state/entities";
import { useNowMinute } from "./useNowMinute";

export function useFlowModel() {
  const threads = useThreadShells();
  const nowMinute = useNowMinute();
  return useMemo(() => deriveFlow(threads, { now: `${nowMinute}:00.000Z` }), [threads, nowMinute]);
}
