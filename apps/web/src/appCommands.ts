import type { KeybindingCommand } from "@t3tools/contracts";

export type AppCommand =
  | KeybindingCommand
  | "flow.previous"
  | "flow.next"
  | "thread.snooze"
  | "question.focus"
  | "review.focus"
  | "rightPanel.enter";

type CommandHandler = (command: AppCommand) => boolean;
const handlers = new Set<CommandHandler>();

/** Components register their existing actions; keyboard navigation does not synthesize keystrokes. */
export function registerAppCommands(handler: CommandHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function runAppCommand(command: AppCommand): boolean {
  for (const handler of [...handlers].toReversed()) {
    if (handler(command)) return true;
  }
  return false;
}

/** Commands a panel registers for; a page's key handler hands them over as they are. */
export const PANEL_KEY_COMMANDS: ReadonlySet<AppCommand> = new Set([
  "rightPanel.widen",
  "rightPanel.narrow",
]);

/**
 * Runs a shortcut's command through the registered handlers, consuming the key only when one took
 * it, so an unclaimed shortcut keeps its native meaning.
 */
export function runAppCommandFromKey(command: AppCommand, event: KeyboardEvent): boolean {
  if (!runAppCommand(command)) return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}
