import { describe, expect, it } from "@effect/vitest";
import type { CrewEntry } from "@t3tools/contracts";
import { canUseCrewReply, showCrewConversationTimestamp } from "./crewConversation.ts";

const reply: CrewEntry = {
  id: "reply",
  role: "assistant",
  author: "Bot",
  text: "**Done**",
  createdAt: "2026-09-04T04:08:00Z",
  streaming: false,
  nonce: null,
  unsupportedKind: null,
};

describe("Grok Bot conversation presentation", () => {
  it("offers only complete, readable replies for insertion in a coding task", () => {
    expect(canUseCrewReply(reply)).toBe(true);
    for (const entry of [
      { ...reply, role: "user" as const },
      { ...reply, streaming: true },
      { ...reply, unsupportedKind: "widget" },
      { ...reply, text: "  " },
      { ...reply, interBot: { direction: "outgoing" as const, botId: "peer", botName: "Peer" } },
    ])
      expect(canUseCrewReply(entry)).toBe(false);
  });

  it("keeps timestamps out of a continuous exchange and adds one after an idle gap", () => {
    expect(showCrewConversationTimestamp(reply, undefined)).toBe(true);
    expect(
      showCrewConversationTimestamp({ ...reply, createdAt: "2026-09-04T04:09:00Z" }, reply),
    ).toBe(false);
    expect(
      showCrewConversationTimestamp({ ...reply, createdAt: "2026-09-04T04:14:00Z" }, reply),
    ).toBe(true);
  });

  it("handles missing or invalid timestamps without displaying an invalid date", () => {
    expect(showCrewConversationTimestamp({ ...reply, createdAt: "invalid" }, reply)).toBe(false);
    expect(showCrewConversationTimestamp({ ...reply, createdAt: null }, reply)).toBe(false);
    expect(showCrewConversationTimestamp(reply, { ...reply, createdAt: "invalid" })).toBe(true);
  });
});
