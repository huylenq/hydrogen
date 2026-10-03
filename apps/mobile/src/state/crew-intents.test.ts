import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { CrewError, EnvironmentId, type CrewSendInput } from "@t3tools/contracts";
import type { CrewDraftScope } from "@t3tools/client-runtime/crew-draft";

const storage = vi.hoisted(() => ({
  files: new Map<string, string>(),
  failWrites: false,
  failDeletes: false,
}));
vi.mock("expo-crypto", async () => {
  const { createHash } = await import("node:crypto");
  return {
    CryptoDigestAlgorithm: { SHA256: "sha256" },
    digestStringAsync: async (_algorithm: string, text: string) =>
      createHash("sha256").update(text).digest("hex"),
  };
});
vi.mock("expo-file-system", () => ({
  Paths: { document: "sandbox" },
  File: class {
    readonly uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }
    get exists() {
      return storage.files.has(this.uri);
    }
    async text() {
      return storage.files.get(this.uri)!;
    }
    delete() {
      if (storage.failDeletes) throw new Error("delete failed");
      storage.files.delete(this.uri);
    }
  },
}));
vi.mock("../lib/atomic-file", () => ({
  writeFileAtomically: async (file: { uri: string }, text: string) => {
    if (storage.failWrites) throw new Error("disk full");
    storage.files.set(file.uri, text);
  },
}));

import {
  clearCrewIntent,
  readCrewIntent,
  releaseRejectedCrewIntent,
  reserveCrewIntent,
} from "./crew-intents";

const scope: CrewDraftScope = {
  environmentId: EnvironmentId.make("environment-a"),
  accountScope: "account-a",
  botId: "dummy",
  sessionId: "",
};
const input: CrewSendInput = {
  accountScope: scope.accountScope,
  botId: scope.botId,
  sessionId: scope.sessionId,
  nonce: "one-message",
  text: "Hello",
};
beforeEach(() => {
  storage.files.clear();
  storage.failWrites = false;
  storage.failDeletes = false;
});

describe("mobile crew send intents", () => {
  it("recovers the exact attempted message and refuses a second send reservation", async () => {
    await reserveCrewIntent(scope, input);
    expect(await readCrewIntent(scope)).toEqual(input);
    await expect(reserveCrewIntent(scope, { ...input, nonce: "retry" })).rejects.toThrow(
      "Review the previous message",
    );
    expect(await readCrewIntent(scope)).toEqual(input);
  });
  it("isolates the same bot across environments, accounts, and sessions", async () => {
    await reserveCrewIntent(scope, input);
    for (const other of [
      { ...scope, environmentId: EnvironmentId.make("environment-b") },
      { ...scope, accountScope: "account-b" },
      { ...scope, sessionId: "new-session" },
    ]) {
      expect(await readCrewIntent(other)).toBeNull();
    }
  });
  it("serializes simultaneous reservations so only one can precede dispatch", async () => {
    const results = await Promise.allSettled([
      reserveCrewIntent(scope, input),
      reserveCrewIntent(scope, { ...input, nonce: "second" }),
    ]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
  });
  it("fails closed on corrupt history and failed persistence", async () => {
    storage.failWrites = true;
    await expect(reserveCrewIntent(scope, input)).rejects.toThrow("disk full");
    expect(await readCrewIntent(scope)).toBeNull();
    storage.failWrites = false;
    await reserveCrewIntent(scope, input);
    for (const key of storage.files.keys()) storage.files.set(key, "broken json");
    await expect(readCrewIntent(scope)).rejects.toThrow();
    await expect(reserveCrewIntent(scope, input)).rejects.toThrow("Review the previous message");
  });
  it("permits a new intent only after the user clears the previous one", async () => {
    await reserveCrewIntent(scope, input);
    await clearCrewIntent(scope);
    expect(await readCrewIntent(scope)).toBeNull();
    await reserveCrewIntent(scope, { ...input, nonce: "new-message" });
    expect((await readCrewIntent(scope))?.nonce).toBe("new-message");
  });

  it("releases only a proven rejected attempt, with no replacement reservation", async () => {
    await reserveCrewIntent(scope, input);
    const error = new CrewError({ code: "invalid_input", message: "Another request is pending" });
    expect(await releaseRejectedCrewIntent(scope, "stale-nonce", error)).toBe(false);
    expect(await readCrewIntent(scope)).toEqual(input);
    expect(await releaseRejectedCrewIntent(scope, input.nonce, error)).toBe(true);
    expect(await readCrewIntent(scope)).toBeNull();
    expect(storage.files.size).toBe(0);
    // A later explicit send can reserve the same intended payload and nonce.
    await reserveCrewIntent(scope, input);
    expect(await readCrewIntent(scope)).toEqual(input);
  });

  it("keeps ambiguous attempts recoverable and blocks another reservation", async () => {
    await reserveCrewIntent(scope, input);
    for (const error of [
      new Error("socket closed"),
      new CrewError({ code: "storage", message: "Could not save receipt" }),
    ]) {
      expect(await releaseRejectedCrewIntent(scope, input.nonce, error)).toBe(false);
      expect(await readCrewIntent(scope)).toEqual(input);
      await expect(reserveCrewIntent(scope, input)).rejects.toThrow("Review the previous message");
    }
  });

  it("retains the durable attempt when clearing a proven rejection fails", async () => {
    await reserveCrewIntent(scope, input);
    storage.failDeletes = true;
    await expect(
      releaseRejectedCrewIntent(
        scope,
        input.nonce,
        new CrewError({ code: "invalid_input", message: "Request rejected" }),
      ),
    ).rejects.toThrow("delete failed");
    expect(await readCrewIntent(scope)).toEqual(input);
    await expect(reserveCrewIntent(scope, input)).rejects.toThrow("Review the previous message");
  });
});
