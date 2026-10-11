import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { vi } from "vite-plus/test";
import * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";
import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import * as ProviderEventLoggers from "@t3tools/provider-core/server/ProviderEventLoggers";
import * as ProviderHost from "@t3tools/provider-core/server/ProviderHost";
import * as TestProviderHost from "@t3tools/provider-testing/TestProviderHost";
import { makeHermesAdapterV2 } from "../../orchestration-v2/Adapters/HermesAdapterV2.ts";
import { HermesDriver } from "./HermesDriver.ts";

const probe = vi.hoisted(() => ({ configured: true }));
vi.mock("../../orchestration-v2/Adapters/HermesAdapterV2.ts", () => ({
  makeHermesAdapterV2: vi.fn(() => Effect.succeed({})),
}));
vi.mock("../acp/HermesAcpSupport.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../acp/HermesAcpSupport.ts")>()),
  makeHermesAcpRuntime: () =>
    Effect.succeed({
      initialize: () =>
        Effect.succeed({
          protocolVersion: 1,
          authMethods: probe.configured ? [{ id: "configured", name: "Configured" }] : [],
        }),
      start: () =>
        Effect.succeed({ initializeResult: { protocolVersion: 1 }, sessionSetupResult: {} }),
      handleRequestPermission: () => Effect.void,
      getEvents: () => Stream.empty,
      drainEvents: Effect.void,
    }),
}));

const testLayer = TestProviderHost.layer({ runBackgroundWork: false }).pipe(
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(McpProviderSessions.layer),
  Layer.provideMerge(
    Layer.succeed(
      ProviderEventLoggers.ProviderEventLoggers,
      ProviderEventLoggers.NoOpProviderEventLoggers,
    ),
  ),
  Layer.provideMerge(IdAllocator.layer),
);

it.layer(testLayer)("Hermes verification", (it) => {
  it.effect(
    "keeps configured Hermes available and preserves verification and failures across refreshes",
    () =>
      Effect.gen(function* () {
        probe.configured = true;
        const host = yield* ProviderHost.ProviderHost;
        const instance = yield* HermesDriver.create({
          instanceId: ProviderInstanceId.make("hermes-status"),
          displayName: "Hermes",
          enabled: true,
          environment: [],
          config: { ...HermesDriver.defaultConfig(), homePath: host.paths.stateDir },
        });
        const callbacks = vi.mocked(makeHermesAdapterV2).mock.calls.at(-1)?.[0];
        const onTurnResult = callbacks?.onTurnResult;
        const onSessionStarted = callbacks?.onSessionStarted;
        if (!onTurnResult || !onSessionStarted) throw new Error("Missing Hermes status callbacks");
        const initial = yield* instance.snapshot.refresh;
        expect(initial).toMatchObject({ status: "ready", auth: { status: "unknown" } });
        expect(initial.message).toBeUndefined();
        if (!instance.refreshModels) throw new Error("Missing model refresh");
        yield* instance.refreshModels();
        expect(yield* instance.snapshot.refresh).toMatchObject({
          status: "ready",
          auth: { status: "unknown" },
        });
        yield* onTurnResult(true);
        expect(yield* instance.snapshot.refresh).toMatchObject({
          status: "ready",
          auth: { status: "authenticated" },
        });
        yield* onSessionStarted({
          initializeResult: { protocolVersion: 1 },
          sessionSetupResult: { sessionId: "next-session" },
          sessionId: "next-session",
          modelConfigId: undefined,
        });
        if (!instance.refreshModels) throw new Error("Missing model refresh");
        yield* instance.refreshModels();
        const refreshed = yield* instance.snapshot.refresh;
        expect(refreshed).toMatchObject({ status: "ready", auth: { status: "authenticated" } });
        expect(refreshed.message).toBeUndefined();

        yield* onTurnResult(false);
        yield* instance.refreshModels();
        expect(yield* instance.snapshot.refresh).toMatchObject({
          status: "warning",
          auth: { status: "unknown" },
          message: expect.stringContaining("The last Hermes turn"),
        });
        yield* onTurnResult(true);
        probe.configured = false;
        expect(yield* instance.snapshot.refresh).toMatchObject({
          status: "warning",
          auth: { status: "unauthenticated" },
          message: expect.stringContaining("Run hermes model"),
        });
      }).pipe(Effect.scoped),
  );
});
