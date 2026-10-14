// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useModalKeyboardStore } from "../modalKeyboardStore";
import { useSessionImportanceStore } from "../customizations/huy/sessionImportance";
import { ModalKeyboard } from "./ModalKeyboard";
import { WorkingSessionGrid } from "../customizations/huy/BalancedWorkingSessions";
import { registerAppCommands } from "../appCommands";
import { CustomSnoozeDialogHost } from "./CustomSnoozeDialog";
import {
  createThreadSnoozeCommand,
  resolveThreadSnoozeTarget,
} from "../customizations/huy/threadSnoozeCommand";

vi.mock("@effect/atom-react", () => ({ useAtomValue: () => DEFAULT_RESOLVED_KEYBINDINGS }));
vi.mock("../state/server", () => ({ primaryServerKeybindingsAtom: null }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => "/env/open",
  useParams: () => ({ environmentId: "env", threadId: "open" }),
}));
vi.mock("../hooks/useSettings", () => ({
  useClientSettings: (select: (settings: { modalKeyboardEnabled: boolean }) => unknown) =>
    select({ modalKeyboardEnabled: true }),
  useUpdateClientSettings: () => vi.fn(),
  getClientSettings: () => ({ modalKeyboardEnabled: true }),
}));
vi.mock("./ui/sidebar", () => ({
  useSidebar: () => ({
    open: false,
    openMobile: false,
    isMobile: false,
    setOpen: vi.fn(),
    setOpenMobile: vi.fn(),
    toggleSidebar: vi.fn(),
  }),
}));
vi.mock("../customizations/huy/useHuyChatIntegration", () => ({
  dispatchTimelineCommand: vi.fn(),
}));
vi.mock("../customizations/huy/flowSessionInspection", () => ({ escapeToFlowOverview: vi.fn() }));

let root: Root;
let host: HTMLDivElement;
const openKey = scopedThreadKey(scopeThreadRef(EnvironmentId.make("env"), ThreadId.make("open")));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  useSessionImportanceStore.setState({ keys: new Set() });
  useModalKeyboardStore.setState(useModalKeyboardStore.getInitialState(), true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function ReorderingPreviews() {
  const flagged = useSessionImportanceStore((state) => state.keys.has("env:focused"));
  // Move the selected card from the second row to the first; the grid remounts both keyed rows.
  const ids = flagged ? ["focused", "a", "b", "c", "d", "f"] : ["a", "b", "c", "d", "focused", "f"];
  return (
    <main data-modal-surface="conversation" data-modal-grid="working-sessions" tabIndex={-1}>
      <WorkingSessionGrid>
        {ids.map((id) => (
          <button
            key={id}
            data-modal-item=""
            data-modal-key={`env:${id}`}
            data-flow-session-key={`env:${id}`}
            data-flow-session-name={id}
          >
            {id}
          </button>
        ))}
      </WorkingSessionGrid>
      <ModalKeyboard hasThread={false} workingSessionGrid />
    </main>
  );
}

it("keeps the selected preview focused when flagging and unflagging move it between grid rows", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const rect = { top: 0, bottom: 400, left: 0, right: 1200, width: 1200, height: 400 } as DOMRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect);
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
    rect,
  ] as unknown as DOMRectList);
  HTMLElement.prototype.scrollIntoView = vi.fn();
  await act(() => root.render(<ReorderingPreviews />));
  const selected = () => host.querySelector<HTMLButtonElement>('[data-modal-key="env:focused"]')!;
  const original = selected();
  await act(() => original.focus());
  await press("t");
  await press("f");
  expect(original.isConnected).toBe(false);
  expect(document.activeElement).toBe(selected());
  expect(useModalKeyboardStore.getState().bookmarks.conversation?.key).toBe("env:focused");
  await press("t");
  await press("f");
  expect(useSessionImportanceStore.getState().keys.size).toBe(0);
  expect(document.activeElement).toBe(selected());
});

async function press(key: string, repeat = false) {
  await act(() => {
    (document.activeElement ?? window).dispatchEvent(
      new KeyboardEvent("keydown", { key, repeat, bubbles: true, cancelable: true }),
    );
  });
}

it("opens the quick snooze duration dialog with s on a focused Flow preview", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T03:00:00.000Z"));
  const focusedRef = scopeThreadRef(EnvironmentId.make("remote"), ThreadId.make("focused"));
  const focusedKey = scopedThreadKey(focusedRef);
  const threads = new Map([
    [
      focusedKey,
      {
        id: focusedRef.threadId,
        environmentId: focusedRef.environmentId,
        title: "Focused session",
        hasPendingApprovals: false,
        hasPendingUserInput: false,
      },
    ],
    [
      openKey,
      {
        id: ThreadId.make("open"),
        environmentId: EnvironmentId.make("env"),
        title: "Underlying route",
        hasPendingApprovals: false,
        hasPendingUserInput: false,
      },
    ],
  ]);
  const snooze = vi.fn();
  const grid = document.createElement("main");
  grid.setAttribute("data-modal-surface", "conversation");
  grid.setAttribute("data-modal-grid", "working-sessions");
  grid.innerHTML = `<button data-modal-item data-modal-key="${focusedKey}" data-flow-session-key="${focusedKey}" data-flow-session-name="Focused session">Focused session</button>`;
  document.body.append(grid);
  const unregister = registerAppCommands(
    createThreadSnoozeCommand({
      readTarget: () => resolveThreadSnoozeTarget(threads, openKey),
      supportsSnooze: () => true,
      snooze,
      unsnooze: vi.fn(),
    }),
  );
  try {
    await act(() =>
      root.render(
        <>
          <ModalKeyboard hasThread={false} workingSessionGrid />
          <CustomSnoozeDialogHost />
        </>,
      ),
    );
    await act(() => grid.querySelector("button")!.focus());
    await press("s");
    expect(document.querySelector('[role="dialog"]')?.textContent ?? "").toContain("Snooze thread");
    const input = document.querySelector<HTMLInputElement>(
      'input[placeholder="30s, 15m, 24h, 2d, or 15"]',
    );
    expect(input).not.toBeNull();
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "15m");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(() =>
      document.querySelector<HTMLButtonElement>('[role="dialog"] button[type="submit"]')!.click(),
    );
    expect(snooze).toHaveBeenCalledExactlyOnceWith(focusedRef, {
      snoozedUntil: "2026-10-14T03:15:00.000Z",
    });
  } finally {
    unregister();
  }
});

it.each(["flow", "grid"])(
  "flags the focused %s session without navigating and toggles it back",
  async (surface) => {
    const navigation = document.createElement("main");
    navigation.setAttribute("data-modal-surface", surface === "flow" ? "flow" : "conversation");
    if (surface === "grid") navigation.setAttribute("data-modal-grid", "working-sessions");
    navigation.innerHTML =
      '<button data-flow-session-key="env:focused" data-flow-session-name="Focused session">Session</button>';
    document.body.append(navigation);
    await act(() =>
      root.render(<ModalKeyboard hasThread={false} workingSessionGrid={surface === "grid"} />),
    );
    const card = navigation.querySelector("button")!;
    await act(() => card.focus());
    await press("t");
    await press("f");
    expect([...useSessionImportanceStore.getState().keys]).toEqual(["env:focused"]);
    expect(document.activeElement).toBe(card);
    expect(useModalKeyboardStore.getState().feedback).toBe("Marked important: Focused session");
    await press("f", true);
    expect(useSessionImportanceStore.getState().keys.has("env:focused")).toBe(true);
    await press("t");
    await press("f");
    expect(useSessionImportanceStore.getState().keys.size).toBe(0);
    expect(useModalKeyboardStore.getState().feedback).toBe(
      "Removed important flag: Focused session",
    );
  },
);

it("flags the open thread from a conversation and leaves editing keys alone", async () => {
  useModalKeyboardStore.setState({
    threadContext: {
      title: "Open session",
      isServer: true,
      isGitRepo: false,
      hasProject: true,
      canPin: false,
      pinned: false,
      canSettle: false,
      settled: false,
      rightOpen: false,
      maximized: false,
      canMaximize: false,
      terminalOpen: false,
      question: "none",
    },
  });
  await act(() => root.render(<ModalKeyboard hasThread />));
  await press("t");
  await press("f");
  expect(useSessionImportanceStore.getState().keys.has(openKey)).toBe(true);
  const input = document.createElement("input");
  document.body.append(input);
  await act(() => input.focus());
  await press("t");
  await press("f");
  expect(useSessionImportanceStore.getState().keys.has(openKey)).toBe(true);
  expect(useModalKeyboardStore.getState().pending).toEqual([]);
});

it("does not flag the underlying route from an empty grid", async () => {
  const grid = document.createElement("main");
  grid.setAttribute("data-modal-grid", "working-sessions");
  grid.tabIndex = -1;
  document.body.append(grid);
  await act(() => root.render(<ModalKeyboard hasThread={false} workingSessionGrid />));
  await act(() => grid.focus());
  await press("t");
  await press("f");
  expect(useSessionImportanceStore.getState().keys.size).toBe(0);
  expect(useModalKeyboardStore.getState().feedback).toBe(
    "Focus a Flow session or open a thread first",
  );
});

it("does not flag the open thread when the bench's more control has focus", async () => {
  useModalKeyboardStore.setState({
    threadContext: {
      title: "Open session",
      isServer: true,
      isGitRepo: false,
      hasProject: true,
      canPin: false,
      pinned: false,
      canSettle: false,
      settled: false,
      rightOpen: false,
      maximized: false,
      canMaximize: false,
      terminalOpen: false,
      question: "none",
    },
  });
  const bar = document.createElement("section");
  bar.setAttribute("data-modal-surface", "flow");
  bar.innerHTML = '<button data-flow-card data-modal-key="flow-bench-more">+3 more</button>';
  document.body.append(bar);
  await act(() => root.render(<ModalKeyboard hasThread />));
  await act(() => bar.querySelector("button")!.focus());
  await press("t");
  await press("f");
  expect(useSessionImportanceStore.getState().keys.size).toBe(0);
  expect(useModalKeyboardStore.getState().feedback).toBe(
    "Focus a Flow session or open a thread first",
  );
});
