import { THREAD_JUMP_KEYBINDING_COMMANDS } from "@t3tools/contracts";
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
    "focus.conversation",
    ...THREAD_JUMP_KEYBINDING_COMMANDS,
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
    "flow.previous",
    "flow.next",
    "left",
    "right",
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
  if (
    (command === "message.previous" || command === "message.next") &&
    thread &&
    context.surface !== "conversation"
  )
    reason = "Focus the conversation first";
  if (command === "flow.previous" || command === "flow.next") {
    if (!context.flowOpen) reason = "Enable Flow mode first";
  }
  if (command === "left" || command === "right") {
    if (context.surface === "flow")
      label = command === "left" ? "Previous Flow card" : "Next Flow card";
    else if (context.surface === "rightPanel")
      label = command === "left" ? "Previous tab / conversation" : "Next panel tab";
    else if (context.surface === "sidebar")
      label = command === "left" ? "Stay in sidebar" : "Focus conversation";
    else if (context.workingSessionGrid) {
      label = command === "left" ? "Previous preview / sidebar" : "Next preview";
    } else {
      label = command === "left" ? "Focus sidebar" : "Focus right panel";
      if (command === "right" && !thread) reason = "Open a thread first";
    }
  }
  if (command === "activate" && context.surface === "rightPanel") label = "Enter selected panel";
  if (command === "activate" && context.surface === "conversation") {
    if (thread) label = "Focus composer";
    else label = "Open selected item";
  }
  return { label, reason, target };
}
