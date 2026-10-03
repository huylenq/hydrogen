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
