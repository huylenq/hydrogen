import { MODAL_COMMANDS, type ModalCommand } from "@t3tools/client-runtime/keyboard";
import type { ModalSurface } from "./modalKeyboardStore";

export interface ModalThreadContext {
  title: string;
  isServer: boolean;
  isGitRepo: boolean;
  hasProject: boolean;
  canPin: boolean;
  pinned: boolean;
  canSettle: boolean;
  settled: boolean;
  rightOpen: boolean;
  maximized: boolean;
  canMaximize: boolean;
  terminalOpen: boolean;
  question: "none" | "ready" | "responding";
}
export interface ModalCommandContext {
  thread: ModalThreadContext | null;
  surface: ModalSurface;
  sidebarOpen: boolean;
  flowOpen: boolean;
  previousSurface: ModalSurface | null;
  workingSessionGrid: boolean;
  readingLamp: boolean;
  sessionTarget?: { title: string; important: boolean } | null;
}

/** One description drives help, dispatch guards, and unavailable-command feedback. */
export function describeModalCommand(command: ModalCommand, context: ModalCommandContext) {
  const thread = context.thread;
  let label: string =
    MODAL_COMMANDS.find((binding) => binding.command === command)?.label ?? command;
  let reason: string | null = null;
  let target: string | null = null;
  const global = [
    "focus.flow",
    "flow.toggle",
    "flow.overview.toggle",
    "focus.conversation",
    "focus.previous",
    "sidebar.toggle",
    "chat.new",
    "threadSwitcher.toggle",
    "settings",
    "help",
    "first",
    "last",
    "next",
    "previous",
    "left",
    "right",
    "focus.left",
    "focus.right",
    "activate",
  ];
  if (!thread && !global.includes(command)) reason = "Open a thread first";
  if (command === "focus.previous" && !context.previousSurface)
    reason = "No previous navigation area";
  if (command === "sidebar.toggle") label = context.sidebarOpen ? "Hide sidebar" : "Show sidebar";
  if (command === "flow.toggle")
    label = context.flowOpen ? "Disable Flow mode" : "Enable Flow mode";
  if (command === "rightPanel.toggle")
    label = thread?.rightOpen ? "Hide right panel" : "Show right panel";
  if (command === "terminal.toggle")
    label = thread?.terminalOpen ? "Hide terminal" : "Show terminal";
  if (command === "rightPanel.toggleMaximized") {
    label = thread?.maximized ? "Restore right panel" : "Maximize right panel";
    if (thread)
      reason = !thread.rightOpen
        ? "Open the right panel first"
        : !thread.canMaximize
          ? "Maximize needs a wider window"
          : null;
  }
  if (command === "question.focus" && thread) {
    reason =
      thread.question === "none"
        ? "No question awaiting an answer"
        : thread.question === "responding"
          ? "Answer is being submitted"
          : null;
  }
  if (command === "review.focus" && thread)
    reason = !thread.isServer
      ? "Review needs an existing thread"
      : !thread.isGitRepo
        ? "Review requires a Git repository"
        : null;
  if (
    (command === "filePicker.toggle" || command === "projectSearch.toggle") &&
    thread &&
    !thread.hasProject
  )
    reason = "Open a project first";
  if (command === "thread.pin" || command === "thread.settle") {
    target = thread?.title ?? null;
    if (command === "thread.pin") {
      label = thread?.pinned ? "Unpin open thread" : "Pin open thread";
      if (thread && (!thread.isServer || !thread.canPin))
        reason = "Pinning is unavailable for this thread";
    } else {
      label = thread?.settled ? "Unsettle open thread" : "Settle open thread";
      if (thread && (!thread.isServer || !thread.canSettle))
        reason = "Settlement is unavailable for this thread";
    }
  }
  if (command === "thread.important") {
    const session = context.sessionTarget;
    target = session?.title ?? null;
    label = session?.important ? "Remove important flag" : "Flag session as important";
    reason = session ? null : "Focus a Flow session or open a thread first";
  }
  if (command === "thread.snooze" && context.sessionTarget) {
    target = context.sessionTarget.title;
    label = "Snooze / wake session";
    reason = null;
  }
  const reading = context.surface === "conversation" && thread !== null;
  if (
    (command === "message.previous" ||
      command === "message.next" ||
      command === "section.previous" ||
      command === "section.next" ||
      command === "scroll.down" ||
      command === "scroll.up" ||
      command === "view.top" ||
      command === "view.center" ||
      command === "view.bottom" ||
      command === "reading.cite") &&
    thread &&
    context.surface !== "conversation"
  )
    reason = "Focus the conversation first";
  if (command === "reading.lamp")
    label = context.readingLamp ? "Turn off reading lamp" : "Turn on reading lamp";
  if ((command === "next" || command === "previous") && reading)
    label = command === "next" ? "Next block" : "Previous block";
  if (command === "left" || command === "right") {
    if (context.surface === "flow")
      label = command === "left" ? "Previous Flow card" : "Next Flow card";
    else if (context.surface === "rightPanel")
      label = command === "left" ? "Previous panel tab" : "Next panel tab";
    else if (context.workingSessionGrid) {
      label = command === "left" ? "Previous preview" : "Next preview";
    } else if (reading) {
      label = command === "left" ? "Collapse / step out" : "Expand / open";
    } else {
      reason =
        context.surface === "conversation"
          ? "Open a thread first"
          : "Use w h or w l to change areas";
    }
  }
  if (command === "focus.left" || command === "focus.right") {
    const left = command === "focus.left";
    if (context.surface === "sidebar") {
      label = left ? "Focus area to the left" : "Focus conversation";
      if (left) reason = "The sidebar is the leftmost area";
    } else if (context.surface === "rightPanel") {
      label = left ? "Focus conversation" : "Focus area to the right";
      if (!left) reason = "The right panel is the rightmost area";
    } else {
      label = left ? "Focus sidebar" : "Focus right panel";
      if (!left && !thread) reason = "Open a thread first";
    }
  }
  if (command === "activate" && context.surface === "rightPanel") label = "Enter selected panel";
  if (command === "activate" && context.surface === "conversation") {
    if (thread) label = "Open or toggle at the reading cursor, else write";
    else label = "Open selected item";
  }
  return { label, reason, target };
}
