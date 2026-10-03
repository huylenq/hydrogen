import { useMemo } from "react";
import type { MessageId, RuntimeRequestId, ScopedThreadRef } from "@t3tools/contracts";
import { useFlowAutoJump } from "../../hooks/useFlowAutoJump";

export type UserActionReceipt =
  | { kind: "turn"; messageId: MessageId }
  | { kind: "approval" | "user-input"; requestId: RuntimeRequestId };

export type UserActionContext = {
  threadRef: ScopedThreadRef;
  excludedThreadKeys?: ReadonlySet<string> | undefined;
  deliveryThreadRef?: ScopedThreadRef;
  navigation?: "foreground" | "background";
};

export type UserActionCompletion = {
  ownsNavigation: boolean;
  succeeded: (receipt?: UserActionReceipt) => void;
};

/** Prepare before mutating; complete only after success. Background sends never claim navigation. */
export function createUserActionLifecycle(prepare: ReturnType<typeof useFlowAutoJump>) {
  return {
    prepare(context: UserActionContext): UserActionCompletion {
      const complete =
        context.navigation === "background"
          ? null
          : prepare(context.threadRef, context.excludedThreadKeys, context.deliveryThreadRef);
      let completed = false;
      return {
        ownsNavigation: complete !== null,
        succeeded(receipt?: UserActionReceipt) {
          if (completed) return;
          completed = true;
          complete?.(receipt);
        },
      };
    },
  };
}

export function useHuyActionLifecycle() {
  const prepare = useFlowAutoJump();
  return useMemo(() => createUserActionLifecycle(prepare), [prepare]);
}
