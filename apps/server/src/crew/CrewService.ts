import {
  CrewError,
  type CrewAvatarInput,
  type CrewChange,
  type CrewConnectInput,
  type CrewConversationInput,
  type CrewHandoffInput,
  type CrewSendInput,
  type CrewStopDeliveryInput,
  type ThreadId,
} from "@t3tools/contracts";
import { Context, Effect, Layer, Path, Queue, Schema, Stream } from "effect";
import { ServerConfig } from "../config.ts";
import { CrewController } from "./CrewController.ts";
import { fileCrewStore } from "./CrewStore.ts";
import type { CrewDeliveryUpdate } from "./CrewDelivery.ts";
import { createGateway, discoverAppAccounts, loadAppConnection } from "./GrokBotGateway.ts";

const isCrewError = Schema.is(CrewError);

export const fromController = (controller: CrewController) => {
  const attempt = <A>(run: () => Promise<A>) =>
    Effect.tryPromise({
      try: run,
      catch: (error) =>
        isCrewError(error)
          ? error
          : new CrewError({
              code: "connection",
              message: "The Grok Bot connection is unavailable.",
            }),
    });
  return {
    getSnapshot: Effect.sync(() => controller.snapshot()),
    getDeliveryAttempts: Effect.sync(() => controller.deliveryAttempts()),
    getAvatar: (input: CrewAvatarInput) => attempt(() => controller.getAvatar(input)),
    connect: (input: CrewConnectInput) => attempt(() => controller.connect(input)),
    disconnect: attempt(() => controller.disconnect()),
    getConversation: (input: CrewConversationInput) =>
      attempt(() => controller.getConversation(input)),
    send: (input: CrewSendInput) => attempt(() => controller.send(input)),
    claimDelivery: (input: CrewStopDeliveryInput) => attempt(() => controller.claimDelivery(input)),
    markDelivery: (input: CrewDeliveryUpdate) => attempt(() => controller.markDelivery(input)),
    stopDelivery: (input: CrewStopDeliveryInput, originThreadId?: ThreadId) =>
      attempt(() => controller.stopDelivery(input, originThreadId)),
    getHandoff: (input: CrewHandoffInput, originThreadId?: ThreadId) =>
      attempt(() => controller.getHandoff(input.handoffId, originThreadId)),
    changes: Stream.callback<CrewChange>(
      (queue) =>
        Effect.acquireRelease(
          Effect.sync(() =>
            controller.subscribe((event) => {
              // A sliding queue can drop another bot's invalidation, so the newest revision
              // invalidates every visible conversation as well as the crew snapshot.
              Queue.offerUnsafe(queue, { revision: event.revision, botId: null });
            }),
          ),
          (unsubscribe) => Effect.sync(unsubscribe),
        ),
      { bufferSize: 1, strategy: "sliding" },
    ),
  };
};

export class CrewService extends Context.Service<CrewService, ReturnType<typeof fromController>>()(
  "t3/crew/CrewService",
) {}

export const layer = Layer.effect(
  CrewService,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const path = yield* Path.Path;
    const controller = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          CrewController.make({
            store: fileCrewStore(path.join(config.stateDir, "crew-handoffs.json")),
            discoverAccounts: () => discoverAppAccounts(),
            openGateway: async (input) =>
              createGateway(
                await loadAppConnection(
                  input.accountScope === undefined ? {} : { accountScope: input.accountScope },
                ),
              ),
          }),
        catch: () =>
          new CrewError({
            code: "storage",
            message: "Could not open the Grok Bot handoff ledger.",
          }),
      }).pipe(Effect.orDie),
      (controller) => Effect.promise(() => controller.close()),
    );
    return fromController(controller);
  }),
);
