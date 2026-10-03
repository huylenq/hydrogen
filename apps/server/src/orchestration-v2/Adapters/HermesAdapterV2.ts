import {
  ProviderDriverKind,
  type HermesSettings,
  type OrchestrationV2ProviderCapabilities,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import { getModelSelectionStringOptionValue } from "@t3tools/shared/model";
import type { SelfInvocation } from "@t3tools/shared/nodeRuntime";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import type { ChildProcessSpawner } from "effect/unstable/process";
import * as EffectAcpErrors from "effect-acp/errors";

import type * as ServerConfig from "../../config.ts";
import { isHermesProfileName, selectedHermesProfile } from "../../provider/HermesProfiles.ts";
import { acpPermissionDisposition } from "../../provider/acp/AcpClientPolicy.ts";
import type * as AcpSessionRuntime from "../../provider/acp/AcpSessionRuntime.ts";
import {
  applyHermesModelSelection,
  hermesApprovalOptions,
  makeHermesAcpRuntime,
} from "../../provider/acp/HermesAcpSupport.ts";
import type * as IdAllocator from "../IdAllocator.ts";
import * as ProviderAdapter from "../ProviderAdapter.ts";
import { makeProviderFailure } from "../ProviderFailure.ts";
import {
  acpSelectionTransition,
  type ProviderSelectionTransitionInput,
  type ProviderSelectionTransitionPlan,
} from "../ProviderSelectionTransition.ts";
import {
  AcpProviderCapabilitiesV2,
  makeAcpAdapterV2,
  type AcpAdapterV2Flavor,
  type AcpAdapterV2RuntimeInput,
} from "./AcpAdapterV2.ts";

export const HERMES_PROVIDER = ProviderDriverKind.make("hermes");
const isAcpRequestError = Schema.is(EffectAcpErrors.AcpRequestError);

/** Plan mode, rollback, and delegation are documented as unavailable for Hermes. */
export const HermesProviderCapabilitiesV2 = {
  ...AcpProviderCapabilitiesV2,
  sessions: {
    ...AcpProviderCapabilitiesV2.sessions,
    // Hermes switches models with `session/set_model`, not a model config option.
    supportsModelSwitchInSession: true,
  },
  threads: {
    ...AcpProviderCapabilitiesV2.threads,
    canRollbackThread: false,
  },
  checkpointing: {
    ...AcpProviderCapabilitiesV2.checkpointing,
    providerCanRollbackConversation: false,
    providerRollbackReturnsSnapshot: false,
  },
} satisfies OrchestrationV2ProviderCapabilities;

export interface HermesAdapterV2Options {
  readonly instanceId: ProviderInstanceId;
  /** `homePath` is already resolved to the instance's Hermes home. */
  readonly settings: HermesSettings;
  readonly environment: NodeJS.ProcessEnv;
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly crypto: Crypto.Crypto;
  readonly fileSystem: FileSystem.FileSystem;
  readonly idAllocator: IdAllocator.IdAllocatorV2["Service"];
  readonly serverConfig: ServerConfig.ServerConfig["Service"];
  readonly selfInvocation: SelfInvocation;
  readonly nativeLogging?: Parameters<typeof makeAcpAdapterV2>[0]["nativeLogging"];
  readonly continuationRequests?: Parameters<typeof makeAcpAdapterV2>[0]["continuationRequests"];
  /** Observes every session setup, so the driver can publish discovered models. */
  readonly onSessionStarted?: (
    started: AcpSessionRuntime.AcpSessionRuntimeStartResult,
  ) => Effect.Effect<void>;
  /** Whether a prompt confirmed backend access; slash commands and cancels report nothing. */
  readonly onTurnResult?: (succeeded: boolean) => Effect.Effect<void>;
}

/** Hermes edit-approval modes; Auto asks like Supervised. */
export function hermesSessionMode(
  runtimeMode: ProviderAdapter.ProviderAdapterV2RuntimePolicy["runtimeMode"],
) {
  return runtimeMode === "full-access"
    ? "dont_ask"
    : runtimeMode === "auto-accept-edits"
      ? "accept_edits"
      : "default";
}

/**
 * A profile is a launch argument and owns its sessions, so changing it needs a
 * new Hermes process; the previous profile's session is never loaded there.
 */
export function hermesSelectionTransition(
  input: ProviderSelectionTransitionInput,
): ProviderSelectionTransitionPlan {
  if (
    selectedHermesProfile(input.current.options) !== selectedHermesProfile(input.target.options)
  ) {
    return { type: "restart_session" };
  }
  return acpSelectionTransition({
    ...input,
    sessionCapabilities: {
      ...input.sessionCapabilities,
      sessions: { ...input.sessionCapabilities.sessions, supportsModelSwitchInSession: true },
    },
  });
}

/** Native slash commands and cancelled prompts say nothing about backend access. */
const observeTurnResults = (
  runtime: AcpSessionRuntime.AcpSessionRuntime["Service"],
  onTurnResult: (succeeded: boolean) => Effect.Effect<void>,
): AcpSessionRuntime.AcpSessionRuntime["Service"] => ({
  ...runtime,
  prompt: (payload, options) => {
    const first = payload.prompt[0];
    const isCommand = first?.type === "text" && first.text.trimStart().startsWith("/");
    if (isCommand) return runtime.prompt(payload, options);
    return runtime.prompt(payload, options).pipe(
      Effect.tap((result) =>
        result.stopReason === "cancelled"
          ? Effect.void
          : // Hermes also ends caught backend errors with end_turn; only
            // generated tokens prove that inference succeeded.
            onTurnResult(result.stopReason === "end_turn" && (result.usage?.outputTokens ?? 0) > 0),
      ),
      Effect.tapError(() => onTurnResult(false)),
    );
  },
});

export function makeHermesAcpAdapterFlavor(
  options: HermesAdapterV2Options & { readonly profile: string },
): AcpAdapterV2Flavor {
  const makeRuntime = (input: AcpAdapterV2RuntimeInput) => {
    const { processEnvironment, runtimePolicy: _runtimePolicy, ...runtimeInput } = input;
    const runtime = makeHermesAcpRuntime({
      ...runtimeInput,
      hermesSettings: { ...options.settings, profile: options.profile },
      environment: { ...options.environment, ...processEnvironment },
      childProcessSpawner: options.childProcessSpawner,
    });
    const onTurnResult = options.onTurnResult;
    return onTurnResult === undefined
      ? runtime
      : runtime.pipe(Effect.map((created) => observeTurnResults(created, onTurnResult)));
  };
  return {
    driver: HERMES_PROVIDER,
    runtimeHarness: "Hermes",
    capabilities: HermesProviderCapabilitiesV2,
    supportsCompaction: true,
    makeRuntime,
    applyModelSelection: ({ runtime, startResult, modelSelection }) =>
      applyHermesModelSelection({
        runtime,
        currentModel: startResult.sessionSetupResult.models?.currentModelId,
        model: modelSelection.model,
        reasoningEffort: getModelSelectionStringOptionValue(modelSelection, "reasoningEffort"),
      }).pipe(Effect.tap(() => options.onSessionStarted?.(startResult) ?? Effect.void)),
    sessionModeForPolicy: (policy) => hermesSessionMode(policy.runtimeMode),
    permissionDisposition: (policy, request) =>
      acpPermissionDisposition(
        policy.runtimeMode === "auto" ? { ...policy, runtimeMode: "approval-required" } : policy,
        request,
      ),
    approvalOptions: hermesApprovalOptions,
    promptFailure: (cause) =>
      makeProviderFailure({
        cause,
        ...(isAcpRequestError(cause)
          ? { message: cause.errorMessage, code: String(cause.code), class: "provider_error" }
          : { class: "provider_error" }),
      }),
  };
}

/**
 * Each provider session runs one Hermes process for the profile its
 * conversation selected; every launch passes that profile explicitly.
 */
export function makeHermesAdapterV2(
  options: HermesAdapterV2Options,
): ProviderAdapter.ProviderAdapterV2Shape {
  return ProviderAdapter.ProviderAdapterV2.of({
    instanceId: options.instanceId,
    driver: HERMES_PROVIDER,
    getCapabilities: () => Effect.succeed(HermesProviderCapabilitiesV2),
    planSelectionTransition: (input) => Effect.succeed(hermesSelectionTransition(input)),
    openSession: Effect.fn("HermesAdapterV2.openSession")(function* (
      input: ProviderAdapter.ProviderAdapterV2OpenSessionInput,
    ) {
      const profile = selectedHermesProfile(input.modelSelection.options);
      if (!isHermesProfileName(profile)) {
        return yield* new ProviderAdapter.ProviderAdapterProtocolError({
          driver: HERMES_PROVIDER,
          detail: `Invalid Hermes profile name '${profile}'.`,
        });
      }
      const session = yield* makeAcpAdapterV2({
        instanceId: options.instanceId,
        flavor: makeHermesAcpAdapterFlavor({ ...options, profile }),
        crypto: options.crypto,
        fileSystem: options.fileSystem,
        idAllocator: options.idAllocator,
        serverConfig: options.serverConfig,
        selfInvocation: options.selfInvocation,
        ...(options.nativeLogging === undefined ? {} : { nativeLogging: options.nativeLogging }),
        ...(options.continuationRequests === undefined
          ? {}
          : { continuationRequests: options.continuationRequests }),
      }).openSession(input);
      const requireTurnSupport = (turnInput: ProviderAdapter.ProviderAdapterV2TurnInput) => {
        if (turnInput.runtimePolicy.interactionMode === "plan") {
          return Effect.fail(
            new ProviderAdapter.ProviderAdapterProtocolError({
              driver: HERMES_PROVIDER,
              detail: "Hermes ACP does not support plan mode.",
            }),
          );
        }
        // The orchestrator restarts the session on a profile change; a turn that
        // still reaches this process would run under the wrong profile.
        const turnProfile = selectedHermesProfile(turnInput.modelSelection.options);
        return turnProfile === profile
          ? Effect.void
          : Effect.fail(
              new ProviderAdapter.ProviderAdapterProtocolError({
                driver: HERMES_PROVIDER,
                detail: `This Hermes session runs profile '${profile}', not '${turnProfile}'.`,
              }),
            );
      };
      const compactThread = session.compactThread;
      return {
        ...session,
        startTurn: (turnInput) =>
          requireTurnSupport(turnInput).pipe(Effect.andThen(session.startTurn(turnInput))),
        ...(compactThread === undefined
          ? {}
          : {
              compactThread: (turnInput: ProviderAdapter.ProviderAdapterV2TurnInput) =>
                requireTurnSupport(turnInput).pipe(Effect.andThen(compactThread(turnInput))),
            }),
      } satisfies ProviderAdapter.ProviderAdapterV2SessionRuntime;
    }),
  });
}
