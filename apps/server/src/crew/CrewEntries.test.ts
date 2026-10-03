import { describe, expect, it } from "vite-plus/test";
import { ThreadId, type CrewHandoff } from "@t3tools/contracts";
import { claimCrewDelivery, matchesCrewReply } from "./CrewDelivery.ts";
import { normalizeCrewEntry, reconcileHandoff } from "./CrewEntries.ts";

describe("Grok Bot transcript normalization", () => {
  it("preserves group member authors, timestampMs and send-message streaming", () => {
    expect(
      normalizeCrewEntry(
        {
          id: "reply",
          kind: "send-message",
          author: { id: "specialist", name: "Researcher" },
          timestampMs: 0,
          streaming: true,
          message: { type: "text", content: "Working" },
        },
        "Group",
      ),
    ).toMatchObject({
      id: "reply",
      author: "Researcher",
      authorBotId: "specialist",
      createdAt: "1970-01-01T00:00:00.000Z",
      streaming: true,
      text: "Working",
      role: "assistant",
      unsupportedKind: null,
    });
  });
  it("preserves exact user echo nonce and user identity", () => {
    expect(
      normalizeCrewEntry(
        {
          id: "echo",
          kind: "message",
          role: "user",
          fromUser: { name: "Huy" },
          clientNonce: "exact-nonce",
          isStreaming: false,
          content: "Context",
        },
        "Bot",
      ),
    ).toMatchObject({
      author: "Huy",
      nonce: "exact-nonce",
      role: "user",
      text: "Context",
      streaming: false,
    });
  });
  it("keeps unsupported cards inert with stable identities", () => {
    const card = {
      id: "approval",
      kind: "send-message",
      message: { type: "approval", command: "dangerous" },
    };
    expect(normalizeCrewEntry(card, "Bot")).toMatchObject({
      id: "approval",
      unsupportedKind: "send-message:approval",
      text: "",
    });
    const unknown = { kind: "future-card", payload: { state: 1 } };
    expect(normalizeCrewEntry(unknown, "Bot").id).toBe(normalizeCrewEntry(unknown, "Bot").id);
  });

  it("classifies bot-to-bot messages by native participant markers, preserving the body", () => {
    const incoming = normalizeCrewEntry(
      {
        id: "incoming",
        kind: "message",
        role: "user",
        content: "A finding from the other bot",
        fromAgent: { id: "peer", name: "Peer" },
        toAgent: { id: "current", name: "Current", kind: "agent" },
      },
      "Current",
    );
    expect(incoming).toMatchObject({
      role: "system",
      text: "A finding from the other bot",
      interBot: { direction: "incoming", botId: "peer", botName: "Peer" },
    });
    const outgoing = normalizeCrewEntry(
      {
        id: "outgoing",
        kind: "message",
        role: "assistant",
        content: "Please review this",
        toAgent: { id: "peer", name: "Peer", kind: "agent" },
      },
      "Current",
    );
    expect(outgoing).toMatchObject({
      role: "system",
      text: "Please review this",
      interBot: { direction: "outgoing", botId: "peer", botName: "Peer" },
    });
  });

  it("keeps group replies and non-agent recipients distinct from bot activity", () => {
    const groupReply = normalizeCrewEntry(
      {
        kind: "send-message",
        author: { id: "peer", name: "Peer" },
        message: { type: "text", content: "An answer for the group" },
      },
      "Group",
    );
    expect(groupReply).toMatchObject({ role: "assistant", authorBotId: "peer" });
    expect(groupReply).not.toHaveProperty("interBot");
    const external = normalizeCrewEntry(
      {
        kind: "message",
        role: "assistant",
        content: "An external message",
        toAgent: { id: "channel", name: "Peer", kind: "channel" },
      },
      "Bot",
    );
    expect(external).not.toHaveProperty("interBot");
    expect(external).not.toHaveProperty("authorBotId");
  });

  it("keeps recognized activity inert when its peer identity is missing or malformed", () => {
    for (const marker of [
      { fromAgent: {} },
      { fromAgent: { id: 42, name: ["unknown"] } },
      { toAgent: { kind: "agent", id: {}, name: false } },
    ]) {
      const entry = normalizeCrewEntry(
        { kind: "message", role: "assistant", content: "Body", ...marker },
        "Bot",
      );
      expect(entry).toMatchObject({
        role: "system",
        interBot: { botId: null, botName: null },
      });
    }
    expect(
      normalizeCrewEntry({ kind: "message", role: "user", content: "Hello", fromAgent: [] }, "Bot"),
    ).not.toHaveProperty("interBot");
  });

  it("does not mistake marked bot traffic for a task reply or an intervening human message", () => {
    const now = "2026-09-06T00:00:00.000Z";
    const marker = "[t3-reply:task]";
    const handoff: CrewHandoff = {
      id: "handoff",
      accountScope: "account",
      originThreadId: ThreadId.make("thread"),
      botId: "current",
      sessionId: "session",
      nonce: "request-nonce",
      text: "Review this",
      createdAt: now,
      updatedAt: now,
      acceptance: "accepted",
      echoEntryId: null,
      replies: [],
      delegation: {
        replyMarker: marker,
        correlation: "awaiting",
        rootHandoffId: "handoff",
        parentHandoffId: null,
        round: 1,
        maxRounds: 1,
        delivery: {
          status: "awaiting_reply",
          commandId: null,
          messageId: null,
          text: null,
          entryIds: [],
          error: null,
          updatedAt: now,
        },
      },
    };
    const echo = normalizeCrewEntry(
      {
        id: "echo",
        kind: "message",
        role: "user",
        content: "Review this",
        clientNonce: handoff.nonce,
      },
      "Current",
    );
    const incoming = normalizeCrewEntry(
      {
        id: "incoming",
        kind: "message",
        role: "user",
        content: `Peer result\n${marker}`,
        fromAgent: { id: "peer", name: "Peer" },
      },
      "Current",
    );
    const outgoing = normalizeCrewEntry(
      {
        id: "outgoing",
        kind: "message",
        role: "assistant",
        content: `Forwarded task\n${marker}`,
        toAgent: { id: "peer", name: "Peer", kind: "agent" },
      },
      "Current",
    );
    const traffic = [echo, outgoing, incoming];
    expect(matchesCrewReply(outgoing, marker)).toBe(false);
    expect(matchesCrewReply(incoming, marker)).toBe(false);
    expect(reconcileHandoff(handoff, traffic, now)).toMatchObject({
      replies: [],
      delegation: { correlation: "awaiting", delivery: { status: "awaiting_reply" } },
    });
    const answer = normalizeCrewEntry(
      {
        id: "answer",
        kind: "send-message",
        message: { type: "text", content: `Final review\n${marker}` },
      },
      "Current",
    );
    const reconciled = reconcileHandoff(handoff, [...traffic, answer], now);
    expect(reconciled.replies.map((entry) => entry.id)).toEqual(["answer"]);
    expect(reconciled.delegation?.correlation).toBe("matched");
    expect(claimCrewDelivery(reconciled, now)?.delegation?.delivery.entryIds).toEqual(["answer"]);
  });
});
