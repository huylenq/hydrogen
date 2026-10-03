import type { ReactNode } from "react";
import { FlowBar } from "../../components/FlowBar";

export function HuyFlowHeader() {
  return (
    <div className="flex h-full min-w-0 flex-1 items-center gap-3">
      <div className="h-full min-w-0 flex-1">
        <FlowBar />
      </div>
    </div>
  );
}

export function HuyChatHeader({ flowOpen, children }: { flowOpen: boolean; children: ReactNode }) {
  return flowOpen ? <HuyFlowHeader /> : children;
}
