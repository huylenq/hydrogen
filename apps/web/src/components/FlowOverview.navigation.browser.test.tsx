import type { ReactNode } from "react";
import { act, render } from "../../test/render";
import { expect, it, vi } from "vite-plus/test";
import {
  EnvironmentId,
  ThreadId,
  NodeId,
  ProviderInstanceId,
  ProviderDriverKind,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import type { FlowModel } from "./Flow.logic";
import { makeThreadFixture, makeThreadProjectionFixture } from "../test-fixtures";
import { useFlowStore } from "../flowStore";
import { FlowOverviewBoundary } from "./FlowOverview";
import { returnToFlowOverview } from "../customizations/huy/flowSessionInspection";
import { ThreadRelationshipsPanel } from "./chat/ThreadRelationshipsControl";
import type {
  OrchestrationV2ThreadShell,
  OrchestrationV2ThreadProjection,
} from "@t3tools/contracts";

const state = vi.hoisted(() => ({
  params: { environmentId: "env", threadId: "parent" },
  model: { attention: [], bench: [], snoozed: [] } as FlowModel,
  navigate: vi.fn(),
  shells: [] as OrchestrationV2ThreadShell[],
  projection: null as OrchestrationV2ThreadProjection | null,
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => state.navigate,
  useParams: () => state.params,
  useMatches: () => "/_chat/$environmentId/$threadId",
}));
vi.mock("../env", () => ({ isElectron: false }));
vi.mock("../hooks/useFlowModel", () => ({ useFlowModel: () => state.model }));
vi.mock("../hooks/useTheme", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));
vi.mock("../state/entities", () => ({
  readThreadShells: () => [],
  useAnyEnvironmentHiding: () => false,
  useHiddenThreadKeys: () => new Set(),
  useQuietThreadShell: () => null,
  useAllEnvironmentShellsBootstrapped: () => true,
  useThreadVisibleTurnItems: () => [],
  useProject: () => null,
  useThreadProjection: (ref: ScopedThreadRef | null) =>
    ref?.threadId === "child" && state.projection ? { projection: state.projection } : null,
  useThreadRelationshipShells: () => state.shells,
  useProjects: () => [],
}));
vi.mock("../state/environments", () => ({
  useEnvironment: () => ({ label: "Linked environment" }),
  useEnvironments: () => ({ environments: [] }),
  useEnvironmentProviders: () => new Map(),
}));
vi.mock("../state/server", () => ({
  serverEnvironment: { providersValueAtom: () => "providers", settingsValueAtom: () => "settings" },
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
vi.mock("@effect/atom-react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effect/atom-react")>()),
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
  FlowSubagentFooter: ({
    onOpenThread,
    parentRef,
  }: {
    onOpenThread: (id: ThreadId) => void;
    parentRef: ScopedThreadRef;
  }) =>
    parentRef.threadId === "parent" ? (
      <button onClick={() => onOpenThread(ThreadId.make("child"))}>Open worker</button>
    ) : null,
}));

function conversation() {
  return (
    <FlowOverviewBoundary>
      <article>
        <p>{`Conversation: ${state.params.threadId}`}</p>
        {state.params.threadId === "child" ? (
          <ThreadRelationshipsPanel
            showLineage
            showSideChats
            environmentId={EnvironmentId.make(state.params.environmentId)}
            threadId={ThreadId.make("child")}
          />
        ) : null}
      </article>
    </FlowOverviewBoundary>
  );
}

function setup() {
  state.projection = null;
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
  return {
    async [Symbol.asyncDispose]() {
      await act(() => useFlowStore.setState(useFlowStore.getInitialState(), true));
      vi.clearAllMocks();
    },
  };
}

it.each([
  { waiting: false, held: false, environmentId: "env" },
  { waiting: false, held: true, environmentId: "remote" },
  { waiting: true, held: true, environmentId: "remote" },
])(
  "opens a subagent conversation with $waiting waiting and $held held in $environmentId",
  async ({ waiting, held, environmentId }) => {
    await using _cleanup = setup();
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
    await using screen = await render(conversation(), { router: false });
    await screen.getByRole("button", { name: "Open worker" }).click();
    await screen.rerender(conversation());
    expect(state.params).toEqual({ environmentId, threadId: "child" });
    await expect.element(screen.getByText("Conversation: child")).toBeVisible();
    expect(useFlowStore.getState().open).toBe(true);
    expect(useFlowStore.getState().overviewOpen).toBe(false);
    if (!waiting) {
      await act(() => {
        expect(returnToFlowOverview()).toBe(true);
      });
      await expect.element(screen.getByLabelText("Working session previews")).toBeVisible();
    }
  },
);

it.each(["working", "waiting", "other waiting", "Flow disabled"])(
  "returns from a subagent to its %s parent conversation through the thread overview",
  async (scenario) => {
    await using _cleanup = setup();
    if (scenario === "waiting" || scenario === "other waiting") {
      state.model = {
        ...state.model,
        bench: scenario === "waiting" ? [] : state.model.bench,
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
    await using screen = await render(conversation(), { router: false });
    await screen.getByRole("button", { name: "Open worker" }).click();
    await screen.rerender(conversation());
    if (scenario === "Flow disabled") {
      await act(() => useFlowStore.getState().setOpen(false));
    }
    await screen.getByRole("button", { name: /Parent/ }).click();
    await screen.rerender(conversation());
    expect(state.params.threadId).toBe("parent");
    await expect.element(screen.getByText("Conversation: parent")).toBeVisible();
    expect(useFlowStore.getState().open).toBe(scenario !== "Flow disabled");
    if (scenario === "Flow disabled" || scenario === "waiting") {
      expect(useFlowStore.getState().inspectedThreadKey).toBeNull();
    }
  },
);

it.each([
  { relation: "parent", flowOpen: true },
  { relation: "parent", flowOpen: false },
  { relation: "child", flowOpen: true },
  { relation: "child", flowOpen: false },
] as const)(
  "opens a linked-environment $relation with Flow $flowOpen",
  async ({ relation, flowOpen }) => {
    await using _cleanup = setup();
    state.params = { environmentId: "env", threadId: "child" };
    const fixture = makeThreadProjectionFixture();
    const targetThreadId = ThreadId.make(relation === "parent" ? "remote-parent" : "remote-child");
    const thread = {
      ...fixture.thread,
      id: ThreadId.make("child"),
      ...(relation === "parent"
        ? {
            delegatedFrom: {
              environmentId: EnvironmentId.make("remote"),
              threadId: targetThreadId,
              title: "Linked parent",
            },
          }
        : {}),
    };
    let subagents: OrchestrationV2ThreadProjection["subagents"] = [];
    if (relation === "child") {
      subagents = [
        {
          id: NodeId.make("remote-task"),
          threadId: ThreadId.make("child"),
          runId: null,
          parentNodeId: NodeId.make("root"),
          origin: "app_owned",
          createdBy: "user",
          driver: ProviderDriverKind.make("codex"),
          providerInstanceId: ProviderInstanceId.make("codex"),
          providerThreadId: null,
          childThreadId: null,
          remoteChild: {
            environmentId: EnvironmentId.make("remote"),
            threadId: targetThreadId,
            label: "Linked environment",
          },
          nativeTaskRef: null,
          prompt: "work",
          title: "Linked worker",
          model: null,
          status: "completed",
          result: null,
          startedAt: null,
          completedAt: null,
          updatedAt: fixture.updatedAt,
        },
      ];
    }
    state.projection = { ...fixture, thread, subagents };
    useFlowStore.setState({ open: flowOpen, overviewOpen: flowOpen });
    await using screen = await render(
      <ThreadRelationshipsPanel
        showLineage
        showSideChats
        environmentId={EnvironmentId.make("env")}
        threadId={ThreadId.make("child")}
      />,
      { router: false },
    );
    await screen
      .getByRole("button", {
        name: new RegExp(relation === "parent" ? "Linked parent" : "Linked worker"),
      })
      .click();
    expect(state.params).toEqual({ environmentId: "remote", threadId: targetThreadId });
    expect(useFlowStore.getState().open).toBe(flowOpen);
    expect(useFlowStore.getState().overviewOpen).toBe(false);
    expect(useFlowStore.getState().inspectedThreadKey).toBe(
      flowOpen ? `remote:${targetThreadId}` : null,
    );
  },
);
