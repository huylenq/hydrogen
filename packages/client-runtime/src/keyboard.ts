/**
 * App navigation keys. Embedded editors keep their own editing vocabulary. Bare digits stay free:
 * the app's own `mod+1`–`mod+9` select threads, and surfaces such as the diff bind them.
 */
export const MODAL_COMMANDS = [
  { keys: ["H"], command: "focus.left", label: "Focus area to the left" },
  {
    keys: ["Escape"],
    command: "focus.conversation",
    label: "Focus conversation / return to Flow grid",
  },
  { keys: ["q"], command: "focus.flow", label: "Focus Flow bar" },
  { keys: ["F"], command: "flow.toggle", label: "Toggle Flow mode" },
  { keys: ["n"], command: "chat.new", label: "New thread" },
  { keys: ["a"], command: "chat.new", label: "New thread" },
  { keys: ["A"], command: "question.focus", label: "Focus pending question" },
  { keys: ["m"], command: "modelPicker.toggle", label: "Choose model" },
  { keys: ["e"], command: "composer.reasoning", label: "Choose reasoning effort" },
  { keys: ["r"], command: "review.focus", label: "Open and focus changes" },
  { keys: [","], command: "settings", label: "Settings" },
  { keys: ["w", "w"], command: "focus.previous", label: "Previous navigation area" },
  { keys: ["w", "s"], command: "sidebar.toggle", label: "Toggle sidebar" },
  { keys: ["w", "q"], command: "flow.toggle", label: "Toggle Flow mode" },
  { keys: ["w", "g"], command: "flow.overview.toggle", label: "Toggle Flow overview" },
  { keys: ["w", "t"], command: "terminal.toggle", label: "Toggle terminal" },
  { keys: ["w", " "], command: "rightPanel.toggle", label: "Toggle right panel" },
  { keys: ["w", "h"], command: "focus.left", label: "Focus area to the left" },
  { keys: ["w", "l"], command: "focus.right", label: "Focus area to the right" },
  { keys: ["g", "k"], command: "git.commit", label: "Commit changes" },
  {
    keys: ["w", "m"],
    command: "rightPanel.toggleMaximized",
    label: "Maximize / restore right panel",
  },
  { keys: ["t", "p"], command: "thread.pin", label: "Pin / unpin thread" },
  { keys: ["t", "s"], command: "thread.settle", label: "Settle / unsettle thread" },
  { keys: ["t", "f"], command: "thread.important", label: "Flag / unflag important session" },
  { keys: ["f", "f"], command: "filePicker.toggle", label: "Find file" },
  { keys: ["f", "s"], command: "projectSearch.toggle", label: "Search project" },
  { keys: ["g", "g"], command: "first", label: "First item / top" },
  { keys: ["G"], command: "last", label: "Last item / bottom" },
  { keys: ["j"], command: "next", label: "Next item / block" },
  { keys: ["k"], command: "previous", label: "Previous item / block" },
  // Space reads on like `j`; callers pass Shift+Space as its own token so it reads back.
  { keys: [" "], command: "next", label: "Next item / block" },
  { keys: ["Shift+Space"], command: "previous", label: "Previous item / block" },
  // Control+J/K: callers pass these tokens only when no app shortcut claims the chord.
  { keys: ["Ctrl+j"], command: "scroll.down", label: "Scroll down" },
  { keys: ["Ctrl+k"], command: "scroll.up", label: "Scroll up" },
  // Like Vim's section motions.
  { keys: ["]", "]"], command: "section.next", label: "Next section" },
  { keys: ["[", "["], command: "section.previous", label: "Previous section" },
  { keys: ["J"], command: "message.next", label: "Next user message" },
  { keys: ["K"], command: "message.previous", label: "Previous user message" },
  // Like Vim's z commands: place the reading cursor's block, or toggle a view mode (`zi`).
  { keys: ["z", "t"], command: "view.top", label: "Scroll block to top" },
  { keys: ["z", "z"], command: "view.center", label: "Scroll block to center" },
  { keys: ["z", "b"], command: "view.bottom", label: "Scroll block to bottom" },
  { keys: ["z", "i"], command: "reading.lamp", label: "Toggle reading lamp" },
  { keys: ["c"], command: "reading.cite", label: "Cite block in composer" },
  { keys: ["s"], command: "thread.snooze", label: "Snooze / wake session" },
  { keys: ["L"], command: "focus.right", label: "Focus area to the right" },
  { keys: ["h"], command: "left", label: "Move left / collapse" },
  { keys: ["l"], command: "right", label: "Move right / expand" },
  { keys: ["ArrowLeft"], command: "left", label: "Previous panel tab" },
  { keys: ["ArrowRight"], command: "right", label: "Next panel tab" },
  { keys: ["i"], command: "composer", label: "Write in composer" },
  { keys: ["/"], command: "threadSwitcher.toggle", label: "Switch thread" },
  { keys: ["?"], command: "help", label: "Keyboard help" },
  { keys: ["Enter"], command: "activate", label: "Open selected item" },
] as const;

export type ModalCommand = (typeof MODAL_COMMANDS)[number]["command"];
export type ModalMotion = Extract<
  ModalCommand,
  "first" | "last" | "next" | "previous" | "left" | "right"
>;
export type ModalSequenceResult<C extends string = ModalCommand> =
  | { kind: "pass" }
  | { kind: "cancel" }
  | { kind: "pending"; keys: readonly string[] }
  | { kind: "command"; command: C };

/** A key sequence in a keymap; `repeatable` motions keep stepping while their key is held. */
export interface ModalBinding<C extends string = string> {
  readonly keys: readonly string[];
  readonly command: C;
  readonly label: string;
  readonly repeatable?: boolean;
}

/** Motions that keep stepping while their key is held. */
const REPEATABLE_COMMANDS: ReadonlySet<ModalCommand> = new Set([
  "next",
  "previous",
  "scroll.down",
  "scroll.up",
  "message.next",
  "message.previous",
  "section.next",
  "section.previous",
  "left",
  "right",
]);

/** Prefixes stay pending until completed or explicitly cancelled, with no typing deadline. */
export function resolveModalSequence(
  pending: readonly string[],
  key: string,
  repeat: boolean,
  available: (command: ModalCommand) => boolean,
): ModalSequenceResult;
/** Resolves against another keymap, such as a surface's own keys layered over the app's. */
export function resolveModalSequence<C extends string>(
  pending: readonly string[],
  key: string,
  repeat: boolean,
  available: (command: C) => boolean,
  bindings: readonly ModalBinding<C>[],
): ModalSequenceResult<C>;
export function resolveModalSequence<C extends string>(
  pending: readonly string[],
  key: string,
  repeat: boolean,
  available: (command: C) => boolean,
  // Only the first overload omits bindings, and there C is ModalCommand.
  bindings: readonly ModalBinding<C>[] = MODAL_COMMANDS as readonly ModalBinding<string>[] as readonly ModalBinding<C>[],
): ModalSequenceResult<C> {
  const repeatable = (binding: ModalBinding<C>) =>
    binding.repeatable === true || REPEATABLE_COMMANDS.has(binding.command as ModalCommand);
  if (key === "Escape" && pending.length > 0) return { kind: "cancel" };
  if (["Shift", "Control", "Alt", "Meta"].includes(key)) return { kind: "pass" };
  if (repeat && pending.every((part) => part === key)) {
    // Holding the key of a doubled motion, such as `]]`, keeps stepping.
    const doubled = bindings.find(
      (binding) =>
        binding.keys.length === 2 &&
        binding.keys.every((part) => part === key) &&
        repeatable(binding) &&
        available(binding.command),
    );
    if (doubled) return { kind: "command", command: doubled.command };
  }
  if (repeat && pending.length > 0) return { kind: "pending", keys: pending };
  const keys = [...pending, key];
  const matches = bindings.filter(
    (binding) =>
      available(binding.command) && keys.every((part, index) => binding.keys[index] === part),
  );
  const exact = matches.find((binding) => binding.keys.length === keys.length);
  if (exact)
    return repeat && !repeatable(exact)
      ? { kind: "cancel" }
      : { kind: "command", command: exact.command };
  // A held key never starts a sequence, so holding the end of `g t` leaves nothing pending.
  if (matches.length > 0) return repeat ? { kind: "cancel" } : { kind: "pending", keys };
  return { kind: pending.length > 0 ? "cancel" : "pass" };
}

/**
 * Lays a surface's keymap over the app's, like an Emacs major-mode map over the global map: an
 * app binding survives only when no overlay sequence equals it or is a prefix of it (or it of
 * one), so `[` in the overlay retires the app's `[[` instead of making it unreachable.
 */
export function layerModalBindings<O extends string, U extends string>(
  over: readonly ModalBinding<O>[],
  under: readonly ModalBinding<U>[],
): readonly ModalBinding<O | U>[] {
  const related = (left: readonly string[], right: readonly string[]) =>
    left
      .slice(0, Math.min(left.length, right.length))
      .every((part, index) => part === right[index]);
  return [
    ...over,
    ...under.filter((binding) => !over.some((overlay) => related(overlay.keys, binding.keys))),
  ];
}

export function modalTargetIndex(
  length: number,
  current: number,
  motion: ModalMotion,
): number | null {
  if (length === 0) return null;
  if (motion === "first") return 0;
  if (motion === "last") return length - 1;
  if (current < 0) return motion === "previous" || motion === "left" ? length - 1 : 0;
  return Math.max(
    0,
    Math.min(length - 1, current + (motion === "previous" || motion === "left" ? -1 : 1)),
  );
}

/** Keep the same object selected after reorder; use its nearest neighbour after removal. */
export function modalReturnIndex(
  keys: readonly string[],
  bookmark: { key: string; index: number } | null,
): number | null {
  if (keys.length === 0) return null;
  if (!bookmark) return 0;
  const found = keys.indexOf(bookmark.key);
  return found >= 0 ? found : Math.max(0, Math.min(keys.length - 1, bookmark.index));
}
