// @vitest-environment jsdom
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { requestCustomSnooze } from "../../components/CustomSnoozeDialog";
import { useModalKeyboardStore } from "../../modalKeyboardStore";
import { createThreadSnoozeCommand, resolveThreadSnoozeTarget } from "./threadSnoozeCommand";

vi.mock("../../components/CustomSnoozeDialog", () => ({
  requestCustomSnooze: vi.fn(async () => null),
}));

const ref = scopeThreadRef(EnvironmentId.make("remote"), ThreadId.make("selected"));
const key = scopedThreadKey(ref);
const thread = {
  id: ref.threadId,
  environmentId: ref.environmentId,
  title: "Selected session",
  hasPendingApprovals: false,
  hasPendingUserInput: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  useModalKeyboardStore.setState(useModalKeyboardStore.getInitialState(), true);
});
afterEach(() => {
  document.body.innerHTML = "";
});

it("keeps route-based snoozing outside Flow, but never falls back to a hidden route from a grid root or more control", () => {
  const threads = new Map([[key, thread]]);
  expect(resolveThreadSnoozeTarget(threads, key)?.ref).toEqual(ref);
  document.body.innerHTML =
    '<main data-modal-grid="working-sessions" tabindex="-1"></main><section data-modal-surface="flow"><button>+3 more</button></section>';
  document.querySelector<HTMLElement>("main")!.focus();
  expect(resolveThreadSnoozeTarget(threads, key)).toBeNull();
  document.querySelector<HTMLButtonElement>("button")!.focus();
  expect(resolveThreadSnoozeTarget(threads, key)).toBeNull();
});

it("wakes the snoozed session selected in Flow without opening a duration dialog", () => {
  const snoozed = {
    ...thread,
    snoozedAt: new Date(Date.now() - 60_000).toISOString(),
    snoozedUntil: new Date(Date.now() + 60_000).toISOString(),
  };
  document.body.innerHTML = `<button data-flow-session-key="${key}">Selected session</button>`;
  document.querySelector("button")!.focus();
  const wake = vi.fn();
  const snooze = vi.fn();
  const run = createThreadSnoozeCommand({
    readTarget: () => resolveThreadSnoozeTarget(new Map([[key, snoozed]]), null),
    supportsSnooze: () => true,
    snooze,
    unsnooze: wake,
  });
  expect(run("thread.snooze")).toBe(true);
  expect(wake).toHaveBeenCalledExactlyOnceWith(ref);
  expect(requestCustomSnooze).not.toHaveBeenCalled();
  expect(snooze).not.toHaveBeenCalled();
});

it.each(["approval", "input", "queued", "unsupported"])(
  "keeps the %s snooze restriction for focused sessions",
  (blocked) => {
    const blockedThread = {
      ...thread,
      hasPendingApprovals: blocked === "approval",
      hasPendingUserInput: blocked === "input",
      ...(blocked === "queued" ? { latestUserMessageAt: new Date().toISOString() } : {}),
    };
    const snooze = vi.fn();
    const wake = vi.fn();
    const run = createThreadSnoozeCommand({
      readTarget: () => ({ thread: blockedThread, ref }),
      supportsSnooze: () => blocked !== "unsupported",
      snooze,
      unsnooze: wake,
    });
    expect(run("thread.snooze")).toBe(true);
    expect(requestCustomSnooze).not.toHaveBeenCalled();
    expect(snooze).not.toHaveBeenCalled();
    expect(wake).not.toHaveBeenCalled();
    expect(useModalKeyboardStore.getState().feedback).toBe(
      blocked === "unsupported"
        ? "This environment does not support snoozing"
        : "This thread cannot be snoozed in its current state",
    );
  },
);

it("cancelling the snooze dialog leaves the session unchanged", async () => {
  const snooze = vi.fn();
  const run = createThreadSnoozeCommand({
    readTarget: () => ({ thread, ref }),
    supportsSnooze: () => true,
    snooze,
    unsnooze: vi.fn(),
  });
  run("thread.snooze");
  await vi.mocked(requestCustomSnooze).mock.results[0]!.value;
  expect(requestCustomSnooze).toHaveBeenCalledExactlyOnceWith(true);
  expect(snooze).not.toHaveBeenCalled();
});
