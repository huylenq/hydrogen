// @effect-diagnostics nodeBuiltinImport:off preferSchemaOverJson:off
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import {
  MessageId,
  NodeId,
  ProjectId,
  ProviderSessionId,
  RunAttemptId,
  RunId,
  ThreadId,
  type ModelSelection,
  type OrchestrationV2ProviderThread,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

import { execScriptSource, writeFakeCli } from "@t3tools/provider-testing/fakeCli";
import {
  ProviderAdapterV2RuntimePolicy,
  type ProviderAdapterV2,
  type ProviderAdapterV2Event,
  type ProviderAdapterV2SessionRuntime,
} from "@t3tools/provider-core/server/ProviderAdapter";

const peer = NodeURL.fileURLToPath(
  new URL("../../provider/testFixtures/hermesMockPeer.mjs", import.meta.url),
);

export const hermesTestRuntimePolicy = ProviderAdapterV2RuntimePolicy.make({
  runtimeMode: "approval-required",
  interactionMode: "default",
  cwd: process.cwd(),
});

/**
 * Writes a `hermes` executable backed by the mock ACP peer. It records each
 * launch's argv and every JSON-RPC line it receives.
 */
export const writeHermesMockCli = Effect.fn("writeHermesMockCli")(function* (
  environment: Record<string, string> = {},
) {
  const fs = yield* FileSystem.FileSystem;
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "hermes-peer-" });
  const log = NodePath.join(directory, "requests.jsonl");
  const argvLog = NodePath.join(directory, "argv.log");
  const binaryPath = writeFakeCli({
    directory,
    name: "hermes",
    source: execScriptSource({ scriptPath: peer, argvLogPath: argvLog }),
    env: { HERMES_TEST_LOG: log, ...environment },
  });
  return {
    directory,
    binaryPath,
    argv: fs.readFileString(argvLog).pipe(Effect.map((text) => text.trim().split("\n"))),
    requests: fs.readFileString(log).pipe(
      Effect.map((text) =>
        text
          .trim()
          .split("\n")
          .map(
            (line) =>
              JSON.parse(line) as {
                readonly method?: string;
                readonly params?: { readonly value?: unknown };
              },
          ),
      ),
    ),
  };
});

let sessionOrdinal = 0;

/** Opens a provider session and buffers its events for `nextEvent`. */
export const openHermesSession = Effect.fn("openHermesSession")(function* (
  adapter: ProviderAdapterV2["Service"],
  modelSelection: ModelSelection,
  initialNativeThreadId?: string,
) {
  sessionOrdinal += 1;
  const threadId = ThreadId.make(`hermes-thread-${sessionOrdinal}`);
  const session = yield* adapter.openSession({
    threadId,
    providerSessionId: ProviderSessionId.make(`hermes-session-${sessionOrdinal}`),
    modelSelection,
    runtimePolicy: hermesTestRuntimePolicy,
    ...(initialNativeThreadId === undefined ? {} : { initialNativeThreadId }),
  });
  const events = yield* Queue.unbounded<ProviderAdapterV2Event>();
  yield* session.events.pipe(
    Stream.runForEach((event) => Queue.offer(events, event)),
    Effect.forkScoped,
  );
  const providerThread = yield* session.ensureThread({
    threadId,
    modelSelection,
    runtimePolicy: hermesTestRuntimePolicy,
  });
  return { session, threadId, events, providerThread };
});

export const nextEvent = <T extends ProviderAdapterV2Event["type"]>(
  events: Queue.Queue<ProviderAdapterV2Event>,
  type: T,
) =>
  Effect.gen(function* () {
    while (true) {
      const event = yield* Queue.take(events);
      if (event.type === type) return event as Extract<ProviderAdapterV2Event, { type: T }>;
    }
  });

export interface HermesTurnRequest {
  readonly session: ProviderAdapterV2SessionRuntime;
  readonly events: Queue.Queue<ProviderAdapterV2Event>;
  readonly threadId: ThreadId;
  readonly providerThread: OrchestrationV2ProviderThread;
  readonly text: string;
  readonly ordinal: number;
  readonly modelSelection: ModelSelection;
}

export const startHermesTurn = Effect.fn("startHermesTurn")(function* (input: HermesTurnRequest) {
  const now = yield* DateTime.now;
  const suffix = `${input.threadId}:${input.ordinal}`;
  yield* input.session.startTurn({
    appThread: {
      createdBy: "user",
      creationSource: "web",
      id: input.threadId,
      projectId: ProjectId.make(`project:${input.threadId}`),
      title: "Hermes adapter test",
      providerInstanceId: input.modelSelection.instanceId,
      modelSelection: input.modelSelection,
      runtimeMode: "approval-required",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      activeProviderThreadId: input.providerThread.id,
      lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: input.threadId },
      forkedFrom: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      lastVisitedAt: null,
      deletedAt: null,
    },
    threadId: input.threadId,
    runId: RunId.make(`run:${suffix}`),
    runOrdinal: input.ordinal,
    providerTurnOrdinal: input.ordinal,
    attemptId: RunAttemptId.make(`attempt:${suffix}`),
    rootNodeId: NodeId.make(`node:${suffix}`),
    providerThread: input.providerThread,
    message: {
      createdBy: "user",
      creationSource: "web",
      messageId: MessageId.make(`message:${suffix}`),
      text: input.text,
      attachments: [],
    },
    modelSelection: input.modelSelection,
    runtimePolicy: hermesTestRuntimePolicy,
  });
});

/** Runs one turn and returns its terminal event. */
export const runHermesTurn = (input: HermesTurnRequest) =>
  startHermesTurn(input).pipe(Effect.andThen(nextEvent(input.events, "turn.terminal")));
