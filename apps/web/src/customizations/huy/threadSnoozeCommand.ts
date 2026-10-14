import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  canSnooze,
  effectiveSnoozed,
  type ThreadSnoozeShell,
} from "@t3tools/client-runtime/state/thread-settled";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import type { AppCommand } from "../../appCommands";
import { requestCustomSnooze } from "../../components/CustomSnoozeDialog";
import { flowSessionActionTarget } from "../../modalKeyboardDom";
import { showModalFeedback } from "../../modalKeyboardStore";

type SnoozeThread = ThreadSnoozeShell &
  Pick<EnvironmentThreadShell, "environmentId" | "id" | "title">;

export function resolveThreadSnoozeTarget(
  threads: ReadonlyMap<string, SnoozeThread>,
  routeThreadKey: string | null,
) {
  const routed = routeThreadKey ? threads.get(routeThreadKey) : null;
  const session = flowSessionActionTarget(
    routed && routeThreadKey ? { key: routeThreadKey, title: routed.title } : null,
  );
  const thread = session ? threads.get(session.key) : null;
  return thread ? { thread, ref: scopeThreadRef(thread.environmentId, thread.id) } : null;
}

/** The keyboard uses the sidebar's mutations, including capability checks and wake behavior. */
export function createThreadSnoozeCommand(options: {
  readTarget: () => ReturnType<typeof resolveThreadSnoozeTarget>;
  supportsSnooze: (environmentId: EnvironmentId) => boolean;
  snooze: (ref: ScopedThreadRef, choice: { readonly snoozedUntil: string }) => void;
  unsnooze: (ref: ScopedThreadRef) => void;
}) {
  return (command: AppCommand): boolean => {
    if (command !== "thread.snooze") return false;
    const target = options.readTarget();
    if (!target) {
      showModalFeedback("Focus a Flow session or open an existing thread first");
      return true;
    }
    const { thread, ref } = target;
    if (!options.supportsSnooze(ref.environmentId)) {
      showModalFeedback("This environment does not support snoozing");
      return true;
    }
    const now = { now: new Date().toISOString() };
    if (effectiveSnoozed(thread, now)) {
      options.unsnooze(ref);
      return true;
    }
    if (!canSnooze(thread, now)) {
      showModalFeedback("This thread cannot be snoozed in its current state");
      return true;
    }
    // Capture the selected thread before the dialog takes focus or the grid changes.
    void requestCustomSnooze(true).then((choice) => {
      if (choice) options.snooze(ref, choice);
    });
    return true;
  };
}
