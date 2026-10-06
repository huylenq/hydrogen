import {
  layerModalBindings,
  MODAL_COMMANDS,
  type ModalBinding,
  type ModalCommand,
} from "@t3tools/client-runtime/keyboard";

import { showModalFeedback } from "~/modalKeyboardStore";

/**
 * Vim navigation inside a diff viewer, after evil-collection's magit bindings. The diff's keys
 * sit over the app's like a major-mode map: app sequences they don't shadow (`w h`, `H`/`L`, `q`)
 * keep working while the diff has focus.
 */
export const DIFF_VIM_BINDINGS = [
  { keys: ["j"], command: "diff.next", label: "Next line", repeatable: true },
  { keys: ["k"], command: "diff.previous", label: "Previous line", repeatable: true },
  { keys: ["g", "g"], command: "diff.first", label: "First file" },
  { keys: ["G"], command: "diff.last", label: "Last line" },
  { keys: ["Ctrl+j"], command: "diff.section.next", label: "Next file or hunk", repeatable: true },
  {
    keys: ["Ctrl+k"],
    command: "diff.section.previous",
    label: "Previous file or hunk",
    repeatable: true,
  },
  { keys: ["]"], command: "diff.sibling.next", label: "Next hunk / file", repeatable: true },
  {
    keys: ["["],
    command: "diff.sibling.previous",
    label: "Previous hunk / file",
    repeatable: true,
  },
  { keys: ["^"], command: "diff.parent", label: "File header" },
  { keys: ["g", "h"], command: "diff.parent", label: "File header" },
  { keys: ["h"], command: "diff.left", label: "Old side / file header / collapse" },
  { keys: ["l"], command: "diff.right", label: "New side / expand / enter file" },
  { keys: ["ArrowLeft"], command: "diff.left", label: "Old side / file header / collapse" },
  { keys: ["ArrowRight"], command: "diff.right", label: "New side / expand / enter file" },
  { keys: [" "], command: "diff.page.down", label: "Scroll a page down", repeatable: true },
  { keys: ["Shift+Space"], command: "diff.page.up", label: "Scroll a page up", repeatable: true },
  { keys: ["Ctrl+f"], command: "diff.page.down", label: "Scroll a page down", repeatable: true },
  { keys: ["Ctrl+b"], command: "diff.page.up", label: "Scroll a page up", repeatable: true },
  {
    keys: ["Ctrl+d"],
    command: "diff.half.down",
    label: "Scroll half a page down",
    repeatable: true,
  },
  { keys: ["Ctrl+u"], command: "diff.half.up", label: "Scroll half a page up", repeatable: true },
  { keys: ["Tab"], command: "diff.fold.toggle", label: "Collapse / expand file" },
  { keys: ["Shift+Tab"], command: "diff.fold.all", label: "Collapse / expand all files" },
  // magit's section levels: digits act on the cursor's file, Alt+digits on every file. Pierre
  // cannot fold single hunks, so a diff has two levels: file headers, then everything.
  { keys: ["1"], command: "diff.level.hide", label: "This file: header only" },
  { keys: ["2"], command: "diff.level.show", label: "This file: show all" },
  { keys: ["Alt+1"], command: "diff.level.files", label: "All files: headers only" },
  { keys: ["Alt+2"], command: "diff.level.all", label: "All files: show all" },
  { keys: ["z", "t"], command: "diff.view.top", label: "Scroll line to top" },
  { keys: ["z", "z"], command: "diff.view.center", label: "Scroll line to center" },
  { keys: ["z", "b"], command: "diff.view.bottom", label: "Scroll line to bottom" },
  { keys: ["+"], command: "diff.context.more", label: "More context in this file" },
  { keys: ["v"], command: "diff.visual", label: "Select lines" },
  { keys: ["V"], command: "diff.visual", label: "Select lines" },
  // Available only while selecting, so `y y` and `y s` stay reachable otherwise.
  { keys: ["y"], command: "diff.yank.selection", label: "Copy selected lines" },
  { keys: ["y", "y"], command: "diff.yank.line", label: "Copy line" },
  { keys: ["y", "s"], command: "diff.yank.section", label: "Copy hunk / file path" },
  { keys: ["c"], command: "diff.comment", label: "Comment on line or selection" },
  { keys: ["/"], command: "diff.search", label: "Search diff" },
  { keys: ["n"], command: "diff.search.next", label: "Next match", repeatable: true },
  { keys: ["N"], command: "diff.search.previous", label: "Previous match", repeatable: true },
  { keys: ["Enter"], command: "diff.visit", label: "Open file at line" },
  { keys: ["g", "r"], command: "diff.refresh", label: "Refresh diff" },
  { keys: ["?"], command: "diff.help", label: "Show diff keys" },
  { keys: ["Escape"], command: "diff.escape", label: "End selection / focus conversation" },
] as const satisfies readonly ModalBinding[];

export type DiffVimCommand = (typeof DIFF_VIM_BINDINGS)[number]["command"];

/** The diff's keys by task, for its cheatsheet. Every diff command appears once. */
export const DIFF_VIM_CHEATSHEET: ReadonlyArray<{
  title: string;
  commands: readonly DiffVimCommand[];
}> = [
  {
    title: "Move",
    commands: [
      "diff.next",
      "diff.previous",
      "diff.first",
      "diff.last",
      "diff.section.next",
      "diff.section.previous",
      "diff.sibling.next",
      "diff.sibling.previous",
      "diff.parent",
      "diff.left",
      "diff.right",
    ],
  },
  {
    title: "Scroll",
    commands: [
      "diff.page.down",
      "diff.page.up",
      "diff.half.down",
      "diff.half.up",
      "diff.view.top",
      "diff.view.center",
      "diff.view.bottom",
    ],
  },
  {
    title: "Fold",
    commands: [
      "diff.fold.toggle",
      "diff.fold.all",
      "diff.level.hide",
      "diff.level.show",
      "diff.level.files",
      "diff.level.all",
      "diff.context.more",
    ],
  },
  { title: "Search", commands: ["diff.search", "diff.search.next", "diff.search.previous"] },
  {
    title: "Select, copy, comment",
    commands: [
      "diff.visual",
      "diff.yank.selection",
      "diff.yank.line",
      "diff.yank.section",
      "diff.comment",
    ],
  },
  { title: "Other", commands: ["diff.visit", "diff.refresh", "diff.help", "diff.escape"] },
];

/** A command's key sequences as the cheatsheet shows them. */
export function diffVimKeyLabels(command: DiffVimCommand): string[] {
  return DIFF_VIM_BINDINGS.filter((binding) => binding.command === command).map((binding) =>
    binding.keys.map((key) => (key === " " ? "Space" : key)).join(" "),
  );
}

export const DIFF_VIM_LAYERED_BINDINGS = layerModalBindings<DiffVimCommand, ModalCommand>(
  DIFF_VIM_BINDINGS,
  MODAL_COMMANDS,
);

const DIFF_VIM_COMMANDS: ReadonlySet<string> = new Set(
  DIFF_VIM_BINDINGS.map((binding) => binding.command),
);

export function isDiffVimCommand(command: string): command is DiffVimCommand {
  return DIFF_VIM_COMMANDS.has(command);
}

export interface DiffVimViewer {
  /** The viewer's scroll root, which takes focus. */
  readonly root: HTMLElement;
  available(command: DiffVimCommand): boolean;
  /** Returns whether the diff acted; an unhandled Escape falls back to the app's. */
  run(command: DiffVimCommand): boolean;
}

/** Where a diff key goes: the scope's viewer, or a loading notice until it mounts. */
export interface DiffVimTarget {
  available(command: DiffVimCommand): boolean;
  run(command: DiffVimCommand): boolean;
}

/**
 * Each diff panel is a scope: keys pressed anywhere in it (its toolbar, its loading state, the
 * viewer) drive the diff, so focus on a toolbar button is not a dead end. A scope's viewer is
 * whichever registered viewer sits inside it, looked up per key, so mount order doesn't matter.
 */
const scopes = new Set<HTMLElement>();
const viewers = new Set<DiffVimViewer>();

export function registerDiffVimScope(element: HTMLElement): () => void {
  scopes.add(element);
  // Marks the scope so the modal keyboard treats its embedded viewer as navigable, not editable.
  element.setAttribute("data-diff-vim", "");
  return () => {
    scopes.delete(element);
    element.removeAttribute("data-diff-vim");
  };
}

export function registerDiffVimViewer(viewer: DiffVimViewer): () => void {
  viewers.add(viewer);
  return () => {
    viewers.delete(viewer);
  };
}

const TEXT_ENTRY =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';

function targetFor(scope: HTMLElement): DiffVimTarget {
  const viewerIn = () => [...viewers].find((viewer) => scope.contains(viewer.root)) ?? null;
  return {
    available: (command) => viewerIn()?.available(command) ?? true,
    run: (command) => {
      const viewer = viewerIn();
      if (!viewer) {
        if (command === "diff.escape") return false;
        showModalFeedback("Nothing to navigate in this diff yet");
        return true;
      }
      // A key pressed on the toolbar moves focus to the viewer it drives.
      if (command !== "diff.escape" && !viewer.root.contains(document.activeElement))
        viewer.root.focus({ preventScroll: true });
      return viewer.run(command);
    },
  };
}

/**
 * The diff a key belongs to. Text fields inside it (comment drafts, search) keep their keys, and
 * a focused control keeps Enter and Space.
 */
export function diffVimTargetFor(event: KeyboardEvent): DiffVimTarget | null {
  const path = event.composedPath();
  const scope = [...scopes].find((element) => path.includes(element));
  if (!scope) return null;
  const target = path[0];
  if (target instanceof Element) {
    if (target.closest(TEXT_ENTRY)) return null;
    if ((event.key === "Enter" || event.key === " ") && target.closest("button, a[href]"))
      return null;
  }
  return targetFor(scope);
}

/** The diff holding focus, for help that lists the diff's keys. */
export function focusedDiffVimTarget(): DiffVimTarget | null {
  const active = document.activeElement;
  if (!active) return null;
  const scope = [...scopes].find((element) => element.contains(active));
  return scope ? targetFor(scope) : null;
}
