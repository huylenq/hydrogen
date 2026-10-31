import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { FlowModel } from "./Flow.logic";
import { makeThreadFixture } from "../test-fixtures";
import { useFlowStore } from "../flowStore";
import { FlowOverviewBoundary } from "./FlowOverview";
import { returnToFlowOverview } from "../customizations/huy/flowSessionInspection";
import { ThreadRelationshipsPanel } from "./chat/ThreadRelationshipsControl";
import type { OrchestrationV2ThreadShell } from "@t3tools/contracts";

const state = vi.hoisted(() => ({
  params: { environmentId: "env", threadId: "parent" },
  model: { attention: [], bench: [], snoozed: [] } as FlowModel,
  navigate: vi.fn(),
  shells: [] as OrchestrationV2ThreadShell[],
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => state.navigate,
  useParams: () => state.params,
  useMatches: () => "/_chat/$environmentId/$threadId",
}));
vi.mock("../env", () => ({ isElectron: false }));
vi.mock("../hooks/useFlowModel", () => ({ useFlowModel: () => state.model }));
vi.mock("../hooks/useTheme", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));
vi.mock("../state/entities", () => ({
  useAllEnvironmentShellsBootstrapped: () => true,
  useThreadVisibleTurnItems: () => [],
  useProject: () => null,
  useThreadProjection: () => null,
  useThreadRelationshipShells: () => state.shells,
  useProjects: () => [],
}));
vi.mock("../state/environments", () => ({
  useEnvironments: () => ({ environments: [] }),
  useEnvironmentProviders: () => new Map(),
}));
vi.mock("../state/server", () => ({
  serverEnvironment: { providersValueAtom: () => "providers" },
}));
vi.mock("../state/threads", () => ({
  environmentThreadDetails: { threadAtom: () => "detail" },
  threadEnvironment: { mergeBack: {}, stopSession: {}, interruptTurn: {} },
}));
vi.mock("../state/orchestration", () => ({
  orchestrationEnvironment: { stopWorkflow: { permissionAtom: () => "permission" } },
}));
vi.mock("../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../lib/archivedThreadsState", () => ({
  useArchivedThreadSnapshots: () => ({ snapshots: [] }),
}));
vi.mock("./ui/toast", () => ({ toastManager: { add: vi.fn() } }));
vi.mock("./ui/tooltip", async () => {
  const { cloneElement } = await import("react");
  return {
    Tooltip: ({ children }: { children: ReactNode }) => children,
    TooltipTrigger: ({ render, children }: { render: React.ReactElement; children: ReactNode }) =>
      cloneElement(render, {}, children),
    TooltipPopup: () => null,
  };
});
vi.mock("./chat/ThreadDetailsControl", () => ({
  ThreadDetailsControl: ({ children, onClick, disabled }: React.ComponentProps<"button">) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));
vi.mock("./chat/ThreadRelationshipIcon", () => ({
  ThreadRelationshipIcon: () => null,
  threadRelationshipStatusLabel: () => "Working",
}));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: (atom: string) =>
    atom === "detail" ? [{ id: "agent", childThreadId: "child", status: "running" }] : [],
}));
vi.mock("../customizations/huy/flowOverviewTransition", () => ({
  useFlowOverviewTransition: ({ overview }: { overview: boolean }) => overview,
}));
vi.mock("./ui/sidebar", () => ({
  SidebarInset: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("./ModalKeyboard", () => ({ ModalKeyboard: () => null }));
vi.mock("./WorkspacePageHeader", () => ({ WorkspacePageHeader: () => null }));
vi.mock("./FlowSnoozedRow", () => ({ FlowSnoozedRow: () => null }));
vi.mock("./FlowBar", () => ({ FLOW_STATUS_CLASS: {} }));
vi.mock("./chat/MessagesTimeline", () => ({ ToolActivityIconCtx: () => null }));
vi.mock("./ChatMarkdown", () => ({ default: () => null }));
vi.mock("./ProjectFavicon", () => ({ ProjectFavicon: () => null }));
vi.mock("./chat/ProviderInstanceIcon", () => ({ ProviderInstanceIcon: () => null }));
vi.mock("../customizations/huy/WorkEntryPreview", () => ({
  WorkEntryPreview: () => null,
  LiveStatusPreview: () => null,
}));
vi.mock("../customizations/huy/FlowSessionCheckoutStrip", () => ({
  FlowSessionCheckoutStrip: () => null,
}));
vi.mock("../customizations/huy/FlowSubagentFooter", () => ({
  FlowSubagentFooter: ({ onOpenThread }: { onOpenThread: (id: ThreadId) => void }) => (
    <button onClick={() => onOpenThread(ThreadId.make("child"))}>Open worker</button>
  ),
}));

let renderer: ReactTestRenderer;
function render() {
  return (
    <FlowOverviewBoundary>
      <article>
        <p>{`Conversation: ${state.params.threadId}`}</p>
        {state.params.threadId === "child" ? (
          <ThreadRelationshipsPanel
            environmentId={EnvironmentId.make(state.params.environmentId)}
            threadId={ThreadId.make("child")}
          />
        ) : null}
      </article>
    </FlowOverviewBoundary>
  );
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.params = { environmentId: "env", threadId: "parent" };
  state.shells = [
    makeThreadFixture({ id: ThreadId.make("parent"), title: "Parent" }).source,
    makeThreadFixture({
      id: ThreadId.make("child"),
      lineage: {
        rootThreadId: ThreadId.make("parent"),
        parentThreadId: ThreadId.make("parent"),
        relationshipToParent: "subagent",
      },
    }).source,
  ];
  state.navigate.mockImplementation(({ params }) => {
    state.params = params;
  });
  state.model = {
    attention: [],
    bench: [
      {
        kind: "bench",
        status: "Working",
        timestamp: "2026-10-19T00:00:00.000Z",
        thread: makeThreadFixture({
          environmentId: EnvironmentId.make("env"),
          id: ThreadId.make("parent"),
        }),
      },
    ],
    snoozed: [],
  };
  useFlowStore.setState({ ...useFlowStore.getInitialState(), open: true }, true);
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  useFlowStore.setState(useFlowStore.getInitialState(), true);
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it.each([
  { waiting: false, held: false, environmentId: "env" },
  { waiting: false, held: true, environmentId: "remote" },
  { waiting: true, held: true, environmentId: "remote" },
])(
  "opens a subagent conversation with $waiting waiting and $held held in $environmentId",
  async ({ waiting, held, environmentId }) => {
    state.params = { environmentId, threadId: "parent" };
    state.model = {
      ...state.model,
      bench: state.model.bench.map((entry) => ({
        ...entry,
        thread: { ...entry.thread, environmentId: EnvironmentId.make(environmentId) },
      })),
      attention: waiting
        ? [
            {
              kind: "attention",
              status: "Review",
              timestamp: "2026-10-19T00:00:00.000Z",
              thread: makeThreadFixture({
                environmentId: EnvironmentId.make(environmentId),
                id: ThreadId.make("waiting"),
              }),
            },
          ]
        : [],
    };
    useFlowStore.setState({ overviewOpen: held });
    await act(() => {
      renderer = create(render());
    });
    await act(() => renderer.root.findAllByType("button")[0]!.props.onClick());
    await act(() => renderer.update(render()));
    expect(state.params).toEqual({ environmentId, threadId: "child" });
    expect(renderer.root.findAllByType("p").map((item) => item.children.join(""))).toContain(
      "Conversation: child",
    );
    expect(useFlowStore.getState().open).toBe(true);
    expect(useFlowStore.getState().overviewOpen).toBe(false);
    if (!waiting) {
      await act(() => {
        expect(returnToFlowOverview()).toBe(true);
      });
      expect(
        renderer.root.findAllByProps({ "aria-label": "Working session previews" }),
      ).toHaveLength(1);
    }
  },
);

it.each(["working", "waiting", "other waiting", "Flow disabled"])(
  "returns from a subagent to its %s parent conversation through the thread overview",
  async (scenario) => {
    if (scenario === "waiting" || scenario === "other waiting") {
      state.model = {
        ...state.model,
        attention: [
          {
            kind: "attention",
            status: "Review",
            timestamp: "2026-10-19T00:00:00.000Z",
            thread: makeThreadFixture({
              environmentId: EnvironmentId.make("env"),
              id: ThreadId.make(scenario === "waiting" ? "parent" : "other"),
            }),
          },
        ],
      };
      useFlowStore.setState({ overviewOpen: true });
    }
    await act(() => {
      renderer = create(render());
    });
    await act(() => renderer.root.findAllByType("button")[0]!.props.onClick());
    await act(() => renderer.update(render()));
    if (scenario === "Flow disabled") {
      await act(() => useFlowStore.getState().setOpen(false));
    }
    const parentButton = renderer.root
      .findAllByType("button")
      .find(
        (button) =>
          button.findAll((node) => node.type === "span" && node.children.includes("Parent"))
            .length > 0,
      );
    expect(parentButton).toBeDefined();
    await act(() => parentButton!.props.onClick());
    await act(() => renderer.update(render()));
    expect(state.params.threadId).toBe("parent");
    expect(renderer.root.findAllByType("p").map((node) => node.children.join(""))).toContain(
      "Conversation: parent",
    );
    expect(useFlowStore.getState().open).toBe(scenario !== "Flow disabled");
    if (scenario === "Flow disabled" || scenario === "waiting") {
      expect(useFlowStore.getState().inspectedThreadKey).toBeNull();
    }
  },
);
