import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { KeybindingCommand } from "@t3tools/contracts";
import { registerAppCommands } from "../../appCommands";

/** Bind the current chat actions without changing command priority on each render. */
export function useChatCommands(
  execute: (command: KeybindingCommand, repeat: boolean) => boolean,
  focusReview: () => boolean,
) {
  const current = useRef({ execute, focusReview });
  useLayoutEffect(() => {
    current.current = { execute, focusReview };
  });
  const executeCurrent = useCallback(
    (command: KeybindingCommand, repeat: boolean) => current.current.execute(command, repeat),
    [],
  );
  useEffect(
    () =>
      registerAppCommands((command) => {
        if (command === "review.focus") return current.current.focusReview();
        if (
          command === "question.focus" ||
          command === "rightPanel.enter" ||
          command === "thread.snooze"
        )
          return false;
        return executeCurrent(command, false);
      }),
    [executeCurrent],
  );
  return executeCurrent;
}
