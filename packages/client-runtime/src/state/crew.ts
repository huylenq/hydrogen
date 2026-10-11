import { WS_METHODS } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

/** One account-scoped crew service per environment, shared by every client surface. */
export function createCrewEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const events = createEnvironmentRpcSubscriptionAtomFamily(runtime, {
    label: "environment-data:crew:events",
    tag: WS_METHODS.crewSubscribe,
  });
  const scheduler = createAtomCommandScheduler();
  const connectionConcurrency = {
    mode: "serial",
    key: ({ environmentId }: { readonly environmentId: string }) => environmentId,
  } as const;
  return {
    events,
    avatar: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:crew:avatar",
      tag: WS_METHODS.crewGetAvatar,
      staleTimeMs: 300_000,
    }),
    snapshot: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:crew:snapshot",
      tag: WS_METHODS.crewGetSnapshot,
      staleTimeMs: 30_000,
      refreshTrigger: ({ environmentId }) => events({ environmentId, input: undefined }),
    }),
    conversation: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:crew:conversation",
      tag: WS_METHODS.crewGetConversation,
      staleTimeMs: 30_000,
      refreshTrigger: ({ environmentId, input }) =>
        input.beforeSeq === undefined ? events({ environmentId, input: undefined }) : undefined,
    }),
    handoff: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:crew:handoff",
      tag: WS_METHODS.crewGetHandoff,
      staleTimeMs: 30_000,
      refreshTrigger: ({ environmentId }) => events({ environmentId, input: undefined }),
    }),
    connect: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:crew:connect",
      tag: WS_METHODS.crewConnect,
      scheduler,
      concurrency: connectionConcurrency,
    }),
    disconnect: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:crew:disconnect",
      tag: WS_METHODS.crewDisconnect,
      scheduler,
      concurrency: connectionConcurrency,
    }),
    send: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:crew:send",
      tag: WS_METHODS.crewSend,
      scheduler,
      concurrency: {
        mode: "singleFlight",
        key: ({ environmentId, input }) => JSON.stringify([environmentId, input]),
      },
    }),
    stopDelivery: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:crew:stop-delivery",
      tag: WS_METHODS.crewStopDelivery,
      scheduler,
      concurrency: {
        mode: "singleFlight",
        key: ({ environmentId, input }) => JSON.stringify([environmentId, input]),
      },
    }),
  };
}
