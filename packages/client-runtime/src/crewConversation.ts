import type { CrewEntry } from "@t3tools/contracts";
import { DateTime, Option } from "effect";

export function canUseCrewReply(entry: CrewEntry): boolean {
  return (
    entry.role === "assistant" &&
    !entry.interBot &&
    !entry.streaming &&
    !entry.unsupportedKind &&
    entry.text.trim().length > 0
  );
}

/** Quiet conversation runs share a timestamp; invalid/missing dates never invent one. */
export function showCrewConversationTimestamp(
  entry: CrewEntry,
  previous: CrewEntry | undefined,
): boolean {
  if (!entry.createdAt) return false;
  const current = DateTime.make(entry.createdAt);
  if (Option.isNone(current)) return false;
  const prior = previous?.createdAt ? DateTime.make(previous.createdAt) : Option.none();
  return (
    Option.isNone(prior) ||
    DateTime.formatLocal(current.value, { dateStyle: "short" }) !==
      DateTime.formatLocal(prior.value, { dateStyle: "short" }) ||
    Math.abs(DateTime.toEpochMillis(current.value) - DateTime.toEpochMillis(prior.value)) >=
      5 * 60 * 1000
  );
}
