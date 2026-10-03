import { CrewSendInput } from "@t3tools/contracts";
import {
  classifyCrewSendFailure,
  crewDraftKey,
  type CrewDraftScope,
} from "@t3tools/client-runtime/crew-draft";
import * as Schema from "effect/Schema";
import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { File, Paths } from "expo-file-system";
import { writeFileAtomically } from "../lib/atomic-file";
import { SerializedAsyncQueue } from "../lib/serialized-async-queue";

const queue = new SerializedAsyncQueue();
const decode = Schema.decodeUnknownSync(CrewSendInput);

async function intentFile(scope: CrewDraftScope) {
  const key = await digestStringAsync(CryptoDigestAlgorithm.SHA256, crewDraftKey(scope));
  return new File(Paths.document, "crew-intents", `${key}.json`);
}

export async function readCrewIntent(scope: CrewDraftScope): Promise<CrewSendInput | null> {
  return queue.run(async () => {
    const file = await intentFile(scope);
    return file.exists ? decode(JSON.parse(await file.text())) : null;
  });
}

/** Persist before RPC. An interrupted send can only be inspected, never replayed on mount. */
export async function reserveCrewIntent(
  scope: CrewDraftScope,
  input: CrewSendInput,
): Promise<void> {
  return queue.run(async () => {
    const file = await intentFile(scope);
    if (file.exists) throw new Error("Review the previous message before starting another.");
    await writeFileAtomically(file, JSON.stringify(input));
  });
}

export async function clearCrewIntent(scope: CrewDraftScope): Promise<void> {
  return queue.run(async () => {
    const file = await intentFile(scope);
    if (file.exists) file.delete();
  });
}

/** Release only the rejected attempt, and keep it reserved if durable cleanup fails. */
export async function releaseRejectedCrewIntent(
  scope: CrewDraftScope,
  nonce: string,
  error: unknown,
): Promise<boolean> {
  if (classifyCrewSendFailure(error).disposition !== "rejected") return false;
  return queue.run(async () => {
    const file = await intentFile(scope);
    if (!file.exists || decode(JSON.parse(await file.text())).nonce !== nonce) return false;
    file.delete();
    return true;
  });
}
