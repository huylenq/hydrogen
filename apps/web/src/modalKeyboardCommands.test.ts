import { describe, expect, it } from "vite-plus/test";
import {
  describeModalCommand,
  type ModalCommandContext,
  type ModalThreadContext,
} from "./modalKeyboardCommands";

const thread: ModalThreadContext = {
  title: "Open thread",
  isServer: true,
  isGitRepo: true,
  hasProject: true,
  canPin: true,
  pinned: false,
  canSettle: true,
  settled: false,
  rightOpen: true,
  maximized: false,
  canMaximize: true,
  terminalOpen: false,
  question: "ready",
};
const context: ModalCommandContext = {
  thread,
  surface: "conversation",
  sidebarOpen: true,
  flowOpen: false,
  previousSurface: "sidebar",
  workingSessionGrid: false,
  readingLamp: false,
};

describe("context-aware modal commands", () => {
  it("allows selecting a thread and focusing main content before a thread is open", () => {
    for (const command of [
      "thread.jump.1",
      "thread.jump.2",
      "thread.jump.3",
      "thread.jump.4",
      "thread.jump.5",
      "thread.jump.6",
      "thread.jump.7",
      "thread.jump.8",
      "thread.jump.9",
      "focus.conversation",
      "focus.flow",
      "flow.toggle",
    ] as const) {
      expect(describeModalCommand(command, { ...context, thread: null }).reason).toBeNull();
    }
  });

  it("allows flow navigation only while the flow is visible", () => {
    for (const command of ["flow.previous", "flow.next"] as const) {
      expect(describeModalCommand(command, { ...context, flowOpen: true }).reason).toBeNull();
      expect(describeModalCommand(command, context).reason).not.toBeNull();
    }
    expect(describeModalCommand("left", { ...context, flowOpen: true }).reason).toBeNull();
  });

  it("names reverse actions and keeps thread actions targeted at the open thread", () => {
    const pinned = {
      ...context,
      thread: { ...thread, pinned: true, settled: true, maximized: true },
    };
    expect(describeModalCommand("thread.pin", pinned)).toEqual({
      label: "Unpin open thread",
      reason: null,
      target: "Open thread",
    });
    expect(describeModalCommand("thread.settle", pinned).label).toBe("Unsettle open thread");
    expect(describeModalCommand("rightPanel.toggleMaximized", pinned).label).toBe(
      "Restore right panel",
    );
    expect(describeModalCommand("sidebar.toggle", context).label).toBe("Hide sidebar");
    expect(describeModalCommand("flow.toggle", context).label).toBe("Enable Flow mode");
  });

  it("explains absent or busy questions and unsupported review before dispatch", () => {
    expect(
      describeModalCommand("question.focus", {
        ...context,
        thread: { ...thread, question: "none" },
      }).reason,
    ).toBe("No question awaiting an answer");
    expect(
      describeModalCommand("question.focus", {
        ...context,
        thread: { ...thread, question: "responding" },
      }).reason,
    ).toBe("Answer is being submitted");
    expect(
      describeModalCommand("review.focus", { ...context, thread: { ...thread, isGitRepo: false } })
        .reason,
    ).toBe("Review requires a Git repository");
    expect(
      describeModalCommand("thread.pin", { ...context, thread: { ...thread, canPin: false } })
        .reason,
    ).toBe("Pinning is unavailable for this thread");
    expect(
      describeModalCommand("rightPanel.toggleMaximized", {
        ...context,
        thread: { ...thread, rightOpen: false },
      }).reason,
    ).toBe("Open the right panel first");
  });

  it("keeps global navigation available without a thread and scopes horizontal movement", () => {
    const empty = { ...context, thread: null };
    expect(describeModalCommand("chat.new", empty).reason).toBeNull();
    expect(describeModalCommand("sidebar.toggle", empty).reason).toBeNull();
    expect(describeModalCommand("review.focus", empty).reason).toBe("Open a thread first");
    expect(describeModalCommand("right", { ...empty, workingSessionGrid: true })).toMatchObject({
      label: "Next preview",
      reason: null,
    });
    expect(describeModalCommand("left", context)).toMatchObject({
      label: "Previous section",
      reason: null,
    });
    expect(describeModalCommand("next", context).label).toBe("Next block");
    expect(describeModalCommand("left", { ...context, surface: "rightPanel" })).toMatchObject({
      label: "Previous panel tab",
      reason: null,
    });
    expect(describeModalCommand("right", { ...context, surface: "sidebar" }).reason).toBe(
      "Use w h or w l to change areas",
    );
    expect(describeModalCommand("activate", { ...context, surface: "rightPanel" }).label).toBe(
      "Enter selected panel",
    );
    expect(describeModalCommand("activate", empty)).toEqual({
      label: "Open selected item",
      reason: null,
      target: null,
    });
  });

  it("names area moves from where focus is and explains the outer edges", () => {
    expect(describeModalCommand("focus.left", context)).toMatchObject({
      label: "Focus sidebar",
      reason: null,
    });
    expect(describeModalCommand("focus.right", { ...context, surface: "sidebar" })).toMatchObject({
      label: "Focus conversation",
      reason: null,
    });
    expect(describeModalCommand("focus.left", { ...context, surface: "sidebar" }).reason).toBe(
      "The sidebar is the leftmost area",
    );
    expect(describeModalCommand("focus.right", { ...context, surface: "rightPanel" }).reason).toBe(
      "The right panel is the rightmost area",
    );
    expect(describeModalCommand("focus.left", { ...context, thread: null }).reason).toBeNull();
  });

  it("keeps reading commands on the conversation and labels the lamp by its state", () => {
    for (const command of [
      "scroll.down",
      "scroll.up",
      "view.top",
      "view.center",
      "view.bottom",
      "reading.cite",
    ] as const) {
      expect(describeModalCommand(command, context).reason).toBeNull();
      expect(describeModalCommand(command, { ...context, surface: "sidebar" }).reason).toBe(
        "Focus the conversation first",
      );
    }
    expect(describeModalCommand("reading.lamp", context).label).toBe("Turn on reading lamp");
    expect(describeModalCommand("reading.lamp", { ...context, readingLamp: true }).label).toBe(
      "Turn off reading lamp",
    );
    expect(describeModalCommand("reading.lamp", { ...context, thread: null }).reason).toBe(
      "Open a thread first",
    );
  });
});
