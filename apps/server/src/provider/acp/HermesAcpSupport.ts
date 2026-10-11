import {
  HERMES_DEFAULT_MODEL,
  type HermesSettings,
  type ProviderApprovalOption,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import type * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as AcpErrors from "effect-acp/errors";
import type * as AcpSchema from "effect-acp/compat";
import * as AcpSessionRuntime from "@t3tools/provider-acp/server/AcpSessionRuntime";

/** `settings.homePath` must already be absolute; the driver resolves `~` and defaults. */
export function buildHermesAcpSpawnInput(
  settings: HermesSettings & { readonly profile?: string },
  cwd: string,
  environment?: NodeJS.ProcessEnv,
): AcpSessionRuntime.AcpSpawnInput {
  return {
    command: settings.binaryPath || "hermes",
    args: ["--profile", settings.profile || "default", "acp"],
    cwd,
    env: {
      ...environment,
      ...(settings.homePath ? { HERMES_HOME: settings.homePath } : {}),
    },
  };
}

/** The runtime credential Hermes advertises once `hermes model` configured one. */
export function hermesAuthMethod(
  response: AcpSchema.InitializeResponse,
): Effect.Effect<string, AcpErrors.AcpError> {
  const method = response.authMethods?.find(
    (entry) => entry.id !== "hermes-setup" && !("type" in entry && entry.type === "terminal"),
  );
  return method
    ? Effect.succeed(method.id)
    : Effect.fail(
        new AcpErrors.AcpRequestError({
          code: -32000,
          method: "authenticate",
          errorMessage:
            "Configure Hermes credentials on this environment with hermes model (or hermes acp --setup), then retry.",
        }),
      );
}

export interface HermesAcpRuntimeInput extends Omit<
  AcpSessionRuntime.AcpSessionRuntimeOptions,
  "spawn" | "authMethodId"
> {
  readonly hermesSettings: HermesSettings & { readonly profile?: string };
  readonly environment?: NodeJS.ProcessEnv;
}

/**
 * Hermes answers `session/load` for a session its profile does not own with an
 * empty result instead of an error, so a load that returns no modes did not
 * load anything. Failing it as `session/load` lets the adapter start a fresh
 * session instead of prompting a session id Hermes does not know.
 */
function requireLoadedHermesSession(
  sessionId: string,
  started: AcpSessionRuntime.AcpSessionRuntimeStartResult,
): Effect.Effect<AcpSessionRuntime.AcpSessionRuntimeStartResult, AcpErrors.AcpError> {
  return started.sessionSetupResult.modes == null
    ? Effect.fail(
        new AcpErrors.AcpRequestError({
          code: -32002,
          method: "session/load",
          errorMessage: `Hermes session ${sessionId} does not exist in this Hermes profile.`,
        }),
      )
    : Effect.succeed(started);
}

/** Session approval must never become Hermes' permanent allowlist permission. */
export function hermesPermissionResponse(
  request: AcpSchema.RequestPermissionRequest,
  response: AcpSchema.RequestPermissionResponse,
): AcpSchema.RequestPermissionResponse {
  const outcome = response.outcome;
  if (outcome.outcome !== "selected") return response;
  const selected = request.options.find((option) => option.optionId === outcome.optionId);
  if (selected?.kind !== "allow_always" || selected.optionId === "allow_session") return response;
  const fallback =
    request.options.find((option) => option.optionId === "allow_session") ??
    request.options.find((option) => option.kind === "allow_once");
  return {
    ...response,
    outcome: fallback
      ? { outcome: "selected", optionId: fallback.optionId }
      : { outcome: "cancelled" },
  };
}

/** Offers session approval only where Hermes has a session-scoped answer. */
export function hermesApprovalOptions(
  request: AcpSchema.RequestPermissionRequest,
): ReadonlyArray<ProviderApprovalOption> {
  const has = (kind: AcpSchema.PermissionOption["kind"]) =>
    request.options.some((option) => option.kind === kind);
  return [
    { decision: "cancel", label: "Cancel" },
    ...(has("reject_once") ? [{ decision: "decline", label: "Decline" } as const] : []),
    ...(request.options.some((option) => option.optionId === "allow_session")
      ? [{ decision: "acceptForSession", label: "Allow for session" } as const]
      : []),
    ...(has("allow_once") ? [{ decision: "accept", label: "Approve" } as const] : []),
  ];
}

export const makeHermesAcpRuntime = Effect.fn("makeHermesAcpRuntime")(function* (
  input: HermesAcpRuntimeInput,
): Effect.fn.Return<
  AcpSessionRuntime.AcpSessionRuntime["Service"],
  AcpErrors.AcpError,
  ChildProcessSpawner.ChildProcessSpawner | Crypto.Crypto | Scope.Scope
> {
  const context = yield* Layer.build(
    AcpSessionRuntime.layer({
      ...input,
      spawn: buildHermesAcpSpawnInput(input.hermesSettings, input.cwd, input.environment),
      cancelBehavior: "wait-for-prompt",
    }),
  );
  const runtime = yield* Effect.service(AcpSessionRuntime.AcpSessionRuntime).pipe(
    Effect.provide(context),
  );
  const resumeSessionId = input.resumeSessionId;
  return {
    ...runtime,
    start: () =>
      resumeSessionId === undefined
        ? runtime.start()
        : runtime
            .start()
            .pipe(
              Effect.flatMap((started) => requireLoadedHermesSession(resumeSessionId, started)),
            ),
    loadSession: (sessionId, options) =>
      runtime
        .loadSession(sessionId, options)
        .pipe(Effect.flatMap((started) => requireLoadedHermesSession(sessionId, started))),
    handleRequestPermission: (handler) =>
      runtime.handleRequestPermission((request, context) =>
        handler(request, context).pipe(
          Effect.map((response) => hermesPermissionResponse(request, response)),
        ),
      ),
    // Hermes silently falls back to its default mode for ids it does not know.
    setMode: (modeId) =>
      runtime.getModeState.pipe(
        Effect.flatMap((state) =>
          state === undefined || state.availableModes.some((mode) => mode.id === modeId)
            ? runtime.setMode(modeId)
            : Effect.fail(
                new AcpErrors.AcpRequestError({
                  code: -32602,
                  method: "session/set_mode",
                  errorMessage: `This Hermes version does not advertise the required '${modeId}' approval mode. Update Hermes and retry.`,
                }),
              ),
        ),
      ),
  } satisfies AcpSessionRuntime.AcpSessionRuntime["Service"];
});

/**
 * Applies the conversation's model and session-scoped reasoning effort. Returns
 * the model the session runs on afterwards.
 */
export const applyHermesModelSelection = Effect.fn("applyHermesModelSelection")(function* (input: {
  readonly runtime: AcpSessionRuntime.AcpSessionRuntime["Service"];
  readonly currentModel: string | undefined;
  readonly model: string | undefined;
  readonly reasoningEffort: string | undefined;
}) {
  const { runtime, currentModel, model, reasoningEffort } = input;
  const switchModel =
    model !== undefined && model !== HERMES_DEFAULT_MODEL && model !== currentModel;
  if (switchModel) yield* runtime.setSessionModel(model);
  const reasoningOption = (yield* runtime.getConfigOptions).find(
    (option) => option.id === "reasoning_effort",
  );
  if (reasoningOption) {
    yield* runtime.setConfigOption("reasoning_effort", reasoningEffort ?? "default");
  } else if (reasoningEffort && reasoningEffort !== "default") {
    return yield* new AcpErrors.AcpRequestError({
      code: -32602,
      method: "session/set_config_option",
      errorMessage:
        "This Hermes ACP version cannot control reasoning effort. Update Hermes on this environment and retry.",
    });
  }
  return switchModel ? model : currentModel;
});
