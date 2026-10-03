import { discoverHermesProfiles, withHermesProfiles } from "../HermesProfiles.ts";
import { hermesModelLabel } from "../HermesModelLabels.ts";
import {
  HERMES_DEFAULT_MODEL,
  HermesSettings,
  ProviderDriverKind,
  TextGenerationError,
  type ServerProvider,
  type ServerProviderModel,
} from "@t3tools/contracts";
import { createModelCapabilities } from "@t3tools/shared/model";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import { resolveSelfInvocation } from "@t3tools/shared/nodeRuntime";
import * as BackgroundPolicy from "../../background/BackgroundPolicy.ts";
import { expandHomePath } from "../../pathExpansion.ts";
import { ServerConfig } from "../../config.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import type { TextGeneration } from "../../textGeneration/TextGeneration.ts";
import { ProviderDriverError } from "../Errors.ts";
import { makeHermesAdapterV2 } from "../../orchestration-v2/Adapters/HermesAdapterV2.ts";
import * as IdAllocator from "../../orchestration-v2/IdAllocator.ts";
import * as ProviderContinuationRequests from "../../orchestration-v2/ProviderContinuationRequests.ts";
import { ProviderEventLoggers } from "../Layers/ProviderEventLoggers.ts";
import { makeAcpNativeLoggerFactory } from "../acp/AcpNativeLogging.ts";
import { makeHermesAcpRuntime, hermesAuthMethod } from "../acp/HermesAcpSupport.ts";
import type { AcpSessionRuntimeStartResult } from "../acp/AcpSessionRuntime.ts";
import { makeManagedServerProvider } from "../makeManagedServerProvider.ts";
import type { ProviderDriver } from "../ProviderDriver.ts";
import { mergeProviderInstanceEnvironment } from "../ProviderInstanceEnvironment.ts";
import { makeManualOnlyProviderMaintenanceCapabilities } from "../providerMaintenance.ts";
import {
  buildServerProvider,
  isCommandMissingCause,
  providerModelsFromSettings,
} from "../providerSnapshot.ts";
import { withInstanceIdentity } from "./instanceIdentity.ts";

const decodeSettings = Schema.decodeSync(HermesSettings);
const DRIVER = ProviderDriverKind.make("hermes");
const capabilities = createModelCapabilities({
  optionDescriptors: [
    {
      id: "reasoningEffort",
      label: "Reasoning effort",
      type: "select",
      currentValue: "default",
      options: ["default", "none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"].map(
        (value) => ({
          id: value,
          label: value === "default" ? "Model default" : value,
          ...(value === "default" ? { isDefault: true } : {}),
        }),
      ),
    },
  ],
});
const defaultModels: ReadonlyArray<ServerProviderModel> = [
  {
    slug: HERMES_DEFAULT_MODEL,
    name: "Default",
    isCustom: false,
    isDefault: true,
    capabilities,
  },
];

export function hermesModelsFromSession(
  setup: AcpSessionRuntimeStartResult["sessionSetupResult"],
): ReadonlyArray<ServerProviderModel> {
  const models = setup.models;
  if (!models?.availableModels.length) return defaultModels;
  const seen = new Set<string>();
  return models.availableModels.flatMap((model): ServerProviderModel[] => {
    if (!model.modelId.trim() || seen.has(model.modelId)) return [];
    seen.add(model.modelId);
    return [
      {
        slug: model.modelId,
        name: hermesModelLabel(model.modelId, model.name),
        isCustom: false,
        capabilities,
        ...(model.modelId === models.currentModelId
          ? { isDefault: true, aliases: [HERMES_DEFAULT_MODEL] }
          : {}),
      },
    ];
  });
}

export type HermesDriverEnv =
  | BackgroundPolicy.BackgroundPolicy
  | ChildProcessSpawner.ChildProcessSpawner
  | Crypto.Crypto
  | FileSystem.FileSystem
  | IdAllocator.IdAllocatorV2
  | Path.Path
  | ProviderEventLoggers
  | ServerConfig
  | ServerSettingsService;

export const HermesDriver: ProviderDriver<HermesSettings, HermesDriverEnv> = {
  driverKind: DRIVER,
  metadata: { displayName: "Hermes", supportsMultipleInstances: true },
  configSchema: HermesSettings,
  defaultConfig: () => decodeSettings({}),
  create: ({ instanceId, displayName, accentColor, environment, enabled, config }) =>
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const serverConfig = yield* ServerConfig;
      const loggers = yield* ProviderEventLoggers;
      const processEnv = mergeProviderInstanceEnvironment(environment);
      const path = yield* Path.Path;
      const homePath = path.resolve(
        expandHomePath(
          config.homePath ||
            processEnv.HERMES_HOME ||
            path.join(processEnv.HOME || expandHomePath("~"), ".hermes"),
        ),
      );
      const settings = { ...config, enabled, homePath };
      const fs = yield* FileSystem.FileSystem;
      const discoverProfiles = discoverHermesProfiles(homePath).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      );
      let profiles = yield* discoverProfiles;
      const modelsWithProfiles = (models: ReadonlyArray<ServerProviderModel>) =>
        withHermesProfiles(
          providerModelsFromSettings(models, settings.customModels, capabilities),
          profiles,
        );
      const continuationIdentity = {
        driverKind: DRIVER,
        continuationKey: `hermes:home:${homePath}`,
      };
      const stamp = withInstanceIdentity({
        instanceId,
        driverKind: DRIVER,
        displayName,
        accentColor,
        continuationGroupKey: continuationIdentity.continuationKey,
      });
      const maintenance = makeManualOnlyProviderMaintenanceCapabilities({
        provider: DRIVER,
        packageName: null,
      });
      const now = DateTime.formatIso(yield* DateTime.now);
      const metadata = yield* SubscriptionRef.make(
        stamp({
          ...buildServerProvider({
            enabled,
            checkedAt: now,
            presentation: {
              displayName: "Hermes",
              badgeLabel: "Early Access",
              showInteractionModeToggle: false,
              supportsConversationRollback: false,
            },
            models: modelsWithProfiles(defaultModels),
            slashCommands: [
              {
                name: "compact",
                description: "Summarize the conversation and reduce context usage",
              },
            ],
            probe: {
              installed: false,
              version: null,
              status: "warning",
              auth: { status: "unknown" },
              message: "Hermes has not been checked yet.",
            },
          }),
          supportsTextGeneration: false,
        }),
      );
      const makeRuntime = (cwd: string) =>
        makeHermesAcpRuntime({
          hermesSettings: settings,
          environment: processEnv,
          childProcessSpawner: spawner,
          cwd,
          clientInfo: { name: "t3-code-provider-probe", version: "0.0.0" },
        }).pipe(Effect.provideService(Crypto.Crypto, crypto));
      let lastTurnFailed = false;
      const configuredStatus = (
        verified: boolean,
      ): Pick<ServerProvider, "status" | "auth" | "message"> => ({
        status: !enabled ? "disabled" : lastTurnFailed ? "warning" : "ready",
        auth: { status: verified ? "authenticated" : "unknown" },
        ...(lastTurnFailed
          ? {
              message:
                "The last Hermes turn did not confirm backend access. Check the thread output, credentials, and backend availability before retrying.",
            }
          : {}),
      });
      const onSessionStarted = Effect.fn("HermesDriver.onSessionStarted")(function* (
        started: AcpSessionRuntimeStartResult,
      ) {
        const checkedAt = DateTime.formatIso(yield* DateTime.now);
        yield* SubscriptionRef.update(metadata, (snapshot): ServerProvider => {
          const { message: _message, ...rest } = snapshot;
          return {
            ...rest,
            installed: true,
            ...configuredStatus(snapshot.auth.status === "authenticated"),
            checkedAt,
            version: started.initializeResult.agentInfo?.version ?? snapshot.version,
            models: modelsWithProfiles(hermesModelsFromSession(started.sessionSetupResult)),
          };
        });
      });
      const checkProvider = Effect.gen(function* () {
        if (!enabled) return yield* SubscriptionRef.get(metadata);
        profiles = yield* discoverProfiles;
        yield* SubscriptionRef.update(metadata, (snapshot) => ({
          ...snapshot,
          models: withHermesProfiles(snapshot.models, profiles),
        }));
        const before = yield* SubscriptionRef.get(metadata);
        const result = yield* Effect.gen(function* () {
          const runtime = yield* makeRuntime(serverConfig.stateDir);
          const initialized = yield* runtime.initialize();
          const auth = yield* hermesAuthMethod(initialized).pipe(Effect.option);
          return { initialized, auth };
        }).pipe(Effect.scoped, Effect.timeout("30 seconds"), Effect.result);
        const checkedAt = DateTime.formatIso(yield* DateTime.now);
        return yield* SubscriptionRef.updateAndGet(metadata, (snapshot): ServerProvider => {
          if (snapshot !== before) return snapshot;
          const { message: _message, ...rest } = snapshot;
          if (result._tag === "Success") {
            const configured = result.success.auth._tag === "Some";
            const verified = configured && snapshot.auth.status === "authenticated";
            return {
              ...rest,
              installed: true,
              checkedAt,
              version: result.success.initialized.agentInfo?.version ?? null,
              ...(configured
                ? configuredStatus(verified)
                : {
                    status: "warning",
                    auth: { status: "unauthenticated" },
                    message:
                      "Run hermes model on this environment to configure credentials, then refresh.",
                  }),
            };
          }
          const error = result.failure;
          const missing = error._tag === "AcpSpawnError" && isCommandMissingCause(error.cause);
          return {
            ...rest,
            checkedAt,
            installed: !missing,
            status: "error",
            auth: { status: "unknown" },
            message: missing
              ? "Hermes executable not found. Install Hermes with ACP support, or set its binary path."
              : "Hermes ACP health check failed. Run hermes acp --check on this environment and verify the configured Hermes home.",
          };
        });
      });
      const snapshot = yield* makeManagedServerProvider({
        resolveMaintenance: () => Effect.succeed(maintenance),
        getSettings: Effect.succeed(settings),
        streamSettings: Stream.empty,
        haveSettingsChanged: () => false,
        initialSnapshot: () => SubscriptionRef.get(metadata),
        checkProvider,
        enrichSnapshot: ({ publishSnapshot }) =>
          SubscriptionRef.changes(metadata).pipe(Stream.runForEach(publishSnapshot)),
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ProviderDriverError({
              driver: DRIVER,
              instanceId,
              detail: "Could not prepare Hermes status.",
              cause,
            }),
        ),
      );
      const makeNativeLogger = yield* makeAcpNativeLoggerFactory();
      const orchestrationAdapter = makeHermesAdapterV2({
        instanceId,
        settings,
        environment: processEnv,
        childProcessSpawner: spawner,
        crypto,
        fileSystem: fs,
        idAllocator: yield* IdAllocator.IdAllocatorV2,
        serverConfig,
        selfInvocation: yield* resolveSelfInvocation(),
        continuationRequests: yield* ProviderContinuationRequests.ProviderContinuationRequests,
        nativeLogging: (threadId) =>
          makeNativeLogger({ nativeEventLogger: loggers.native, provider: DRIVER, threadId }),
        onSessionStarted,
        onTurnResult: (succeeded) =>
          SubscriptionRef.update(metadata, (snapshot): ServerProvider => {
            const { message: _message, ...rest } = snapshot;
            lastTurnFailed = !succeeded;
            return { ...rest, ...configuredStatus(succeeded) };
          }),
      });
      const unavailable = (
        operation:
          | "generateCommitMessage"
          | "generatePrContent"
          | "generateBranchName"
          | "generateThreadTitle",
      ) =>
        Effect.fail(
          new TextGenerationError({
            operation,
            detail:
              "Hermes does not support background text generation. Select another provider for this operation.",
          }),
        );
      const textGeneration: TextGeneration["Service"] = {
        generateCommitMessage: () => unavailable("generateCommitMessage"),
        generatePrContent: () => unavailable("generatePrContent"),
        generateBranchName: () => unavailable("generateBranchName"),
        generateThreadTitle: () => unavailable("generateThreadTitle"),
      };
      const refreshModels = () =>
        Effect.gen(function* () {
          if (!enabled) return;
          profiles = yield* discoverProfiles;
          const runtime = yield* makeRuntime(serverConfig.stateDir);
          yield* runtime.handleRequestPermission(() =>
            Effect.succeed({ outcome: { outcome: "cancelled" as const } }),
          );
          const started = yield* runtime.start();
          yield* onSessionStarted(started);
          yield* runtime.getEvents().pipe(
            Stream.runForEach((event) =>
              event._tag === "EventStreamBarrier"
                ? Deferred.succeed(event.acknowledge, undefined)
                : Effect.void,
            ),
            Effect.forkScoped,
          );
          yield* runtime.drainEvents;
        }).pipe(
          Effect.scoped,
          Effect.timeout("90 seconds"),
          Effect.mapError(
            (cause) =>
              new ProviderDriverError({
                driver: DRIVER,
                instanceId,
                detail:
                  "Could not refresh Hermes models. Verify Hermes credentials and ACP support.",
                cause,
              }),
          ),
        );
      return {
        instanceId,
        driverKind: DRIVER,
        continuationIdentity,
        displayName,
        accentColor,
        enabled,
        snapshot,
        orchestrationAdapter,
        textGeneration,
        refreshModels,
      };
    }),
};
