import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import {
  HermesSettings,
  HERMES_DEFAULT_MODEL,
  ProviderInstanceId,
  type ModelSelection,
} from "@t3tools/contracts";
import { resolveSelfInvocation } from "@t3tools/shared/nodeRuntime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";
import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import * as TestProviderHost from "@t3tools/provider-testing/TestProviderHost";
import {
  HermesProviderCapabilitiesV2,
  hermesSelectionTransition,
  makeHermesAdapterV2,
} from "./HermesAdapterV2.ts";
import {
  hermesTestRuntimePolicy as runtimePolicy,
  nextEvent,
  openHermesSession,
  runHermesTurn,
  startHermesTurn,
  writeHermesMockCli,
} from "./HermesAdapterV2.testkit.ts";

const instanceId = ProviderInstanceId.make("hermes-test");
const testLayer = Layer.mergeAll(
  NodeServices.layer,
  IdAllocator.layer,
  McpProviderSessions.layer,
  TestProviderHost.layer().pipe(Layer.provide(NodeServices.layer)),
);
const decodeHermesSettings = Schema.decodeEffect(HermesSettings);
const selection = (options: ModelSelection["options"] = []): ModelSelection => ({
  instanceId,
  model: HERMES_DEFAULT_MODEL,
  ...(options ? { options } : {}),
});
const profile = (name: string) => selection([{ id: "hermesProfile", value: name }]);

const setup = Effect.fn("setupHermesAdapterTest")(function* (
  environment: Record<string, string> = {},
) {
  const cli = yield* writeHermesMockCli(environment);
  const turnResults: Array<boolean> = [];
  const startedModels: Array<string | undefined> = [];
  const advertisedCommands: Array<string> = [];
  const adapter = yield* makeHermesAdapterV2({
    instanceId,
    settings: yield* decodeHermesSettings({
      binaryPath: cli.binaryPath,
      homePath: cli.directory,
    }),
    environment: {},
    selfInvocation: yield* resolveSelfInvocation(),
    onSessionStarted: (started) =>
      Effect.sync(() => {
        startedModels.push(started.sessionSetupResult.models?.currentModelId);
      }),
    onTurnResult: (succeeded) =>
      Effect.sync(() => {
        turnResults.push(succeeded);
      }),
    onAvailableCommands: (commands) =>
      Effect.sync(() => {
        advertisedCommands.push(...commands.map((command) => command.name));
      }),
  });
  return {
    ...cli,
    turnResults,
    startedModels,
    advertisedCommands,
    open: (modelSelection: ModelSelection, initialNativeThreadId?: string) =>
      openHermesSession(adapter, modelSelection, initialNativeThreadId),
  };
});

describe("HermesAdapterV2", () => {
  it("restarts the session for a profile change and switches models in place", () => {
    const capabilities = HermesProviderCapabilitiesV2;
    assert.deepEqual(
      hermesSelectionTransition({
        current: profile("work"),
        target: profile("default"),
        sessionCapabilities: capabilities,
      }),
      { type: "restart_session" },
    );
    // An omitted profile is the explicit `default` profile.
    assert.deepEqual(
      hermesSelectionTransition({
        current: selection([]),
        target: profile("default"),
        sessionCapabilities: capabilities,
      }),
      { type: "apply_on_next_turn" },
    );
    // Hermes switches models with session/set_model, which the negotiated
    // capabilities (model config options only) do not see.
    assert.deepEqual(
      hermesSelectionTransition({
        current: profile("work"),
        target: { ...profile("work"), model: "local:other" },
        sessionCapabilities: {
          ...capabilities,
          sessions: { ...capabilities.sessions, supportsModelSwitchInSession: false },
        },
      }),
      { type: "apply_on_next_turn" },
    );
    assert.isFalse(capabilities.threads.canRollbackThread);
  });

  it.live("launches the selected profile, streams a turn, and reports discovered models", () =>
    Effect.gen(function* () {
      const { open, argv, startedModels, turnResults } = yield* setup();
      const work = profile("work");
      const { session, threadId, events, providerThread } = yield* open(work);
      const request = { session, events, threadId, providerThread, text: "hello" };
      const terminal = yield* runHermesTurn({ ...request, ordinal: 1, modelSelection: work });
      assert.equal(terminal.status, "completed");
      assert.deepEqual(yield* argv, ["--profile\twork\tacp"]);
      assert.deepEqual(startedModels, ["openrouter:test-model"]);
      assert.deepEqual(turnResults, [true]);

      // A turn for another profile never runs in this profile's process.
      const mismatch = yield* startHermesTurn({
        ...request,
        ordinal: 2,
        modelSelection: profile("default"),
      }).pipe(Effect.result);
      assert.equal(mismatch._tag, "Failure");
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
  );

  it.live("resumes a session within its profile and never loads it into another profile", () =>
    Effect.gen(function* () {
      const { open, requests } = yield* setup();
      const work = profile("work");
      const { providerThread: created } = yield* open(work);
      const nativeId = created.nativeThreadRef?.nativeId;
      if (!nativeId) return yield* Effect.die("Missing native session id");

      const resumed = yield* open(work, nativeId);
      const reloaded = yield* resumed.session.resumeThread({
        providerThread: created,
        modelSelection: work,
        runtimePolicy,
      });
      assert.equal(reloaded.nativeThreadRef?.nativeId, nativeId);

      // The other profile's Hermes does not own the session, so the adapter
      // starts fresh instead of prompting a session id it cannot serve.
      const other = yield* open(profile("default"), nativeId);
      const crossProfile = yield* other.session
        .resumeThread({
          providerThread: created,
          modelSelection: profile("default"),
          runtimePolicy,
        })
        .pipe(Effect.result);
      assert.equal(crossProfile._tag, "Failure");
      assert.notEqual(other.providerThread.nativeThreadRef?.nativeId, nativeId);
      assert.match(other.providerThread.nativeThreadRef?.nativeId ?? "", /^hermes-default-/);
      const loads = (yield* requests).filter((call) => call.method === "session/load");
      assert.lengthOf(loads, 2);
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
  );

  it.live("applies session-scoped reasoning effort before each prompt", () =>
    Effect.gen(function* () {
      const { open, requests } = yield* setup();
      const high = selection([{ id: "reasoningEffort", value: "high" }]);
      const { session, threadId, events, providerThread } = yield* open(high);
      const steps = [high, selection([{ id: "reasoningEffort", value: "low" }]), selection([])];
      for (const [index, modelSelection] of steps.entries()) {
        yield* runHermesTurn({
          session,
          events,
          threadId,
          providerThread,
          text: "hello",
          ordinal: index + 1,
          modelSelection,
        });
      }
      const calls = (yield* requests).filter(
        (call) => call.method === "session/set_config_option" || call.method === "session/prompt",
      );
      assert.deepEqual(
        calls.map((call) => (call.method === "session/prompt" ? "prompt" : call.params?.value)),
        ["high", "prompt", "low", "prompt", "default", "prompt"],
      );
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
  );

  it.live("rejects reasoning effort on Hermes builds without ACP reasoning support", () =>
    Effect.gen(function* () {
      const { open } = yield* setup({ HERMES_TEST_NO_REASONING: "1" });
      const result = yield* open(selection([{ id: "reasoningEffort", value: "high" }])).pipe(
        Effect.result,
      );
      assert.equal(result._tag, "Failure");
      // Model default needs no reasoning support.
      yield* open(selection([]));
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
  );

  it.live("verifies backend access only from generated output", () =>
    Effect.gen(function* () {
      const { open, turnResults } = yield* setup();
      const modelSelection = selection([]);
      const { session, threadId, events, providerThread } = yield* open(modelSelection);
      for (const [index, text] of ["caught-error", "/help", "error", "hello"].entries()) {
        yield* runHermesTurn({
          session,
          events,
          threadId,
          providerThread,
          text,
          ordinal: index + 1,
          modelSelection,
        });
      }
      assert.deepEqual(turnResults, [false, false, true]);
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
  );

  it.live("publishes advertised commands and sends T3 slash names as Hermes commands", () =>
    Effect.gen(function* () {
      const { open, requests, advertisedCommands } = yield* setup();
      const modelSelection = selection([]);
      const { session, threadId, events, providerThread } = yield* open(modelSelection);
      for (const [index, text] of ["/compact", "/model-hermes local:other"].entries()) {
        yield* runHermesTurn({
          session,
          events,
          threadId,
          providerThread,
          text,
          ordinal: index + 1,
          modelSelection,
        });
      }
      assert.deepEqual(advertisedCommands, ["model", "compress"]);
      const prompts = (yield* requests).flatMap((request) =>
        request.method === "session/prompt"
          ? [(request.params as { prompt: Array<{ text: string }> }).prompt[0]!.text]
          : [],
      );
      assert.deepEqual(prompts, ["/compress", "/model local:other"]);
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
  );

  it.live("recovers after a cancelled turn and accepts the next prompt", () =>
    Effect.gen(function* () {
      const { open, turnResults } = yield* setup();
      const modelSelection = selection([]);
      const { session, threadId, events, providerThread } = yield* open(modelSelection);
      const request = { session, events, threadId, providerThread, modelSelection };
      yield* startHermesTurn({ ...request, text: "hang", ordinal: 1 });
      const started = yield* nextEvent(events, "provider_turn.updated");
      // Hermes is working once it streams output for the prompt.
      while (true) {
        const event = yield* nextEvent(events, "turn_item.updated");
        if (event.turnItem.type === "assistant_message") break;
      }
      yield* session.interruptTurn({ providerThread, providerTurnId: started.providerTurn.id });
      const cancelled = yield* nextEvent(events, "turn.terminal");
      assert.notEqual(cancelled.status, "completed");
      const next = yield* runHermesTurn({ ...request, text: "hello", ordinal: 2 });
      assert.equal(next.status, "completed");
      assert.deepEqual(turnResults, [true]);
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
  );
});
