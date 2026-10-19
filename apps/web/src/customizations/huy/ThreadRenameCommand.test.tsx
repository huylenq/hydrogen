// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { ModalKeyboard } from "../../components/ModalKeyboard";
import { useModalKeyboardStore } from "../../modalKeyboardStore";
import { ThreadRenameCommand } from "./ThreadRenameCommand";

const { canOperate } = vi.hoisted(() => ({ canOperate: vi.fn(() => true) }));
vi.mock("../../state/session", () => ({ readEnvironmentScope: canOperate }));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => DEFAULT_RESOLVED_KEYBINDINGS }));
vi.mock("../../state/server", () => ({ primaryServerKeybindingsAtom: null }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => "/env/open",
  useParams: () => ({ environmentId: "env", threadId: "open" }),
}));
vi.mock("../../hooks/useSettings", () => ({
  useClientSettings: (select: (settings: { modalKeyboardEnabled: boolean }) => unknown) =>
    select({ modalKeyboardEnabled: true }),
  updateClientSettings: vi.fn(),
  getClientSettings: () => ({ modalKeyboardEnabled: true }),
}));
vi.mock("../../components/ui/sidebar", () => ({
  useSidebar: () => ({ open: false, isMobile: false, setOpen: vi.fn(), toggleSidebar: vi.fn() }),
}));
vi.mock("./useHuyChatIntegration", () => ({ dispatchTimelineCommand: vi.fn() }));
vi.mock("./flowSessionInspection", () => ({ escapeToFlowOverview: vi.fn() }));

const focusedRef = scopeThreadRef(EnvironmentId.make("remote"), ThreadId.make("focused"));
const threads = new Map([
  [
    "env:open",
    { environmentId: EnvironmentId.make("env"), id: ThreadId.make("open"), title: "Open thread" },
  ],
  [
    "remote:focused",
    { environmentId: focusedRef.environmentId, id: focusedRef.threadId, title: "Focused thread" },
  ],
]);
let root: Root;
let host: HTMLDivElement;
const rename = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  const rect = new DOMRect(0, 0, 800, 600);
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
    rect,
  ] as unknown as DOMRectList);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  canOperate.mockReturnValue(true);
  rename.mockClear();
  useModalKeyboardStore.setState(useModalKeyboardStore.getInitialState(), true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  await act(() => vi.runOnlyPendingTimersAsync());
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(routeThreadKey = "env:open") {
  await act(() =>
    root.render(
      <>
        <ModalKeyboard hasThread={false} />
        <ThreadRenameCommand threads={threads} routeThreadKey={routeThreadKey} rename={rename} />
      </>,
    ),
  );
}
async function press(key: string) {
  await act(() => {
    (document.activeElement ?? window).dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
  // Base UI queues initial focus on an animation frame.
  await act(() => vi.runOnlyPendingTimersAsync());
}
function input() {
  return document.querySelector<HTMLInputElement>('input[aria-label="Thread title"]')!;
}
async function title(value: string) {
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(() => input().closest("form")!.requestSubmit());
  await act(() => vi.runOnlyPendingTimersAsync());
}

it.each(["flow", "grid", "sidebar"])(
  "renames the focused %s thread and retains its environment after focus and route changes",
  async (surface) => {
    const area = document.createElement("section");
    area.setAttribute("data-modal-surface", surface === "grid" ? "conversation" : surface);
    if (surface === "grid") area.setAttribute("data-modal-grid", "working-sessions");
    area.innerHTML =
      surface === "sidebar"
        ? '<div data-thread-item="remote:focused" data-thread-title="Focused thread"><button>Focused thread</button></div>'
        : '<button data-flow-session-key="remote:focused" data-flow-session-name="Focused thread">Focused thread</button>';
    document.body.append(area);
    await render();
    await act(() => area.querySelector("button")!.focus());
    await press("r");
    expect(input().value).toBe("Focused thread");
    expect(document.activeElement).toBe(input());
    expect(input().selectionStart).toBe(0);
    expect(input().selectionEnd).toBe(input().value.length);
    await render("remote:focused");
    await title("  Renamed  ");
    await submit();
    expect(rename).toHaveBeenCalledExactlyOnceWith(focusedRef, "Renamed");
    expect(document.activeElement).toBe(area.querySelector("button"));
  },
);

it("renames the open thread from a conversation, and Escape cancels editing", async () => {
  useModalKeyboardStore.setState({
    threadContext: {
      title: "Open thread",
      isServer: true,
      isGitRepo: true,
      hasProject: true,
      canPin: true,
      pinned: false,
      canSettle: true,
      settled: false,
      rightOpen: false,
      maximized: false,
      canMaximize: false,
      terminalOpen: false,
      question: "none",
    },
  });
  await act(() =>
    root.render(
      <>
        <main tabIndex={-1} data-modal-surface="conversation" />
        <ModalKeyboard hasThread />
        <ThreadRenameCommand threads={threads} routeThreadKey="env:open" rename={rename} />
      </>,
    ),
  );
  await act(() => host.querySelector("main")!.focus());
  await press("r");
  expect(input().value).toBe("Open thread");
  await title("Discard me");
  await press("Escape");
  expect(input()).toBeNull();
  expect(rename).not.toHaveBeenCalled();
});

it("keeps an empty Flow grid from renaming the hidden route", async () => {
  const grid = document.createElement("main");
  grid.tabIndex = -1;
  grid.setAttribute("data-modal-grid", "working-sessions");
  document.body.append(grid);
  await render();
  await act(() => grid.focus());
  await press("r");
  expect(input()).toBeNull();
  expect(rename).not.toHaveBeenCalled();
});

it("checks destination permission before opening and again before saving", async () => {
  const card = document.createElement("button");
  card.setAttribute("data-flow-session-key", "remote:focused");
  document.body.append(card);
  await render();
  await act(() => card.focus());
  canOperate.mockReturnValue(false);
  await press("r");
  expect(input()).toBeNull();
  canOperate.mockReturnValue(true);
  await press("r");
  await title("Changed");
  canOperate.mockReturnValue(false);
  await submit();
  expect(rename).not.toHaveBeenCalled();
});

it("rejects blank titles and skips unchanged titles", async () => {
  const card = document.createElement("button");
  card.setAttribute("data-flow-session-key", "remote:focused");
  document.body.append(card);
  await render();
  await act(() => card.focus());
  await press("r");
  await title("  ");
  await submit();
  expect(input()).not.toBeNull();
  await title("Focused thread");
  await submit();
  expect(rename).not.toHaveBeenCalled();
  expect(input()).toBeNull();
});
