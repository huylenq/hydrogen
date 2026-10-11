import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import {
  HERMES_DEFAULT_MODEL,
  ProviderDriverKind,
  ProviderInstanceId,
  type ModelSelection,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";
import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import * as ProviderEventLoggers from "@t3tools/provider-core/server/ProviderEventLoggers";
import * as TestProviderHost from "@t3tools/provider-testing/TestProviderHost";
import {
  openHermesSession,
  runHermesTurn,
  writeHermesMockCli,
} from "../../orchestration-v2/Adapters/HermesAdapterV2.testkit.ts";
import { makeProviderInstanceRegistry } from "../ProviderInstanceRegistry.ts";
import { HermesDriver } from "./HermesDriver.ts";

const driver = ProviderDriverKind.make("hermes");
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

describe("Hermes provider instances", () => {
  it.live("distinguishes configured credentials from a verified backend turn", () =>
    Effect.gen(function* () {
      const cli = yield* writeHermesMockCli();
      const id = ProviderInstanceId.make("hermes-health");
      const { registry } = yield* makeProviderInstanceRegistry({
        drivers: [HermesDriver],
        configMap: {
          [id]: {
            driver,
            enabled: true,
            config: { binaryPath: cli.binaryPath, homePath: cli.directory },
          },
        },
      });
      const instance = yield* registry.getInstance(id);
      if (instance === undefined) return yield* Effect.die("Missing Hermes instance");
      const configured = yield* instance.snapshot.refresh;
      expect(configured).toMatchObject({ status: "ready", auth: { status: "unknown" } });
      expect(configured.message).toBeUndefined();

      const modelSelection: ModelSelection = { instanceId: id, model: HERMES_DEFAULT_MODEL };
      const { session, threadId, events, providerThread } = yield* openHermesSession(
        instance.orchestrationAdapter,
        modelSelection,
      );
      const request = { session, events, threadId, providerThread, modelSelection };
      yield* runHermesTurn({ ...request, text: "hello", ordinal: 1 });
      expect(yield* instance.snapshot.refresh).toMatchObject({
        status: "ready",
        auth: { status: "authenticated" },
      });

      yield* runHermesTurn({ ...request, text: "error", ordinal: 2 });
      const failed = {
        status: "warning",
        auth: { status: "unknown" },
        message: expect.stringContaining("last Hermes turn did not confirm"),
      };
      expect(yield* instance.snapshot.refresh).toMatchObject(failed);
      yield* instance.refreshModels!();
      expect(yield* instance.snapshot.refresh).toMatchObject(failed);
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
  );

  it.live("boots isolated Hermes instances with home-scoped continuation", () =>
    Effect.gen(function* () {
      const workId = ProviderInstanceId.make("hermes-work");
      const personalId = ProviderInstanceId.make("hermes-personal");
      const { registry } = yield* makeProviderInstanceRegistry({
        drivers: [HermesDriver],
        configMap: {
          [workId]: {
            driver,
            enabled: false,
            config: { binaryPath: "/missing-hermes", homePath: "/hermes-work" },
          },
          [personalId]: {
            driver,
            enabled: false,
            config: { binaryPath: "/missing-hermes", homePath: "/hermes-personal" },
          },
        },
      });
      expect(yield* registry.listUnavailable).toEqual([]);
      const work = yield* registry.getInstance(workId);
      const personal = yield* registry.getInstance(personalId);
      if (work === undefined || personal === undefined) {
        return yield* Effect.die("Missing Hermes instances");
      }
      expect(work.orchestrationAdapter).not.toBe(personal.orchestrationAdapter);
      expect(work.continuationIdentity.continuationKey).not.toBe(
        personal.continuationIdentity.continuationKey,
      );
      expect(yield* work.snapshot.refresh).toMatchObject({
        instanceId: workId,
        driver,
        status: "disabled",
        supportsTextGeneration: false,
        supportsConversationRollback: false,
        showInteractionModeToggle: false,
      });
      // A disabled instance never launches Hermes to refresh models.
      yield* work.refreshModels!();
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
  );
});
