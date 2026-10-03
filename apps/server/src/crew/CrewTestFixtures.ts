import { vi } from "vite-plus/test";
import type { CrewHandoff } from "@t3tools/contracts";
import type { CrewStore } from "./CrewStore.ts";
import type { GrokBotGateway, GatewayEvent } from "./GrokBotGateway.ts";

export function memoryStore(initial: readonly CrewHandoff[] = []): CrewStore {
  let state = initial;
  return {
    load: async () => state,
    save: async (next) => {
      state = structuredClone(next);
    },
  };
}

export function fixtureGateway(accountScope = "account-one") {
  let entries: readonly Record<string, unknown>[] = [];
  let nextEvent = Promise.withResolvers<{ event: GatewayEvent; processed: () => void } | null>();
  const send = vi.fn<GrokBotGateway["send"]>(async () => ({ accepted: true }));
  const avatar = vi.fn<GrokBotGateway["avatar"]>(async () => ({ dataUrl: null, version: null }));
  const transcript = vi.fn<GrokBotGateway["transcript"]>(async () => ({
    entries,
    nextBeforeSeq: null,
  }));
  const stopped = vi.fn();
  const gateway: GrokBotGateway = {
    accountScope,
    roster: vi.fn(async () => ({ bots: [{ id: "bot-1", name: "Dummy", isGroup: false }] })),
    transcript,
    avatar,
    send,
    async *events(signal) {
      const abort = () => nextEvent.resolve(null);
      signal.addEventListener("abort", abort, { once: true });
      try {
        while (!signal.aborted) {
          const next = await nextEvent.promise;
          nextEvent = Promise.withResolvers();
          if (!next) return;
          yield next.event;
          next.processed();
        }
      } finally {
        signal.removeEventListener("abort", abort);
        stopped();
      }
    },
  };
  return {
    gateway,
    send,
    avatar,
    transcript,
    stopped,
    setEntries: (value: readonly Record<string, unknown>[]) => {
      entries = value;
    },
    emit: (channel = "agentTranscript") =>
      new Promise<void>((processed) =>
        nextEvent.resolve({ event: { channel, payload: {} }, processed }),
      ),
  };
}
