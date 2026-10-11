// @effect-diagnostics nodeBuiltinImport:off
import { DateTime, Schema } from "effect";
import * as NodeCrypto from "node:crypto";
import * as NodeTimersPromises from "node:timers/promises";
import {
  CrewError,
  CrewSendInput as CrewSendInputSchema,
  type CrewAvatar,
  type CrewAvatarInput,
  type CrewBot,
  type CrewChange,
  type CrewConnectInput,
  type CrewConversation,
  type CrewConversationInput,
  type CrewHandoff,
  type CrewSendInput,
  type CrewSnapshot,
  type CrewStopDeliveryInput,
  type ThreadId,
} from "@t3tools/contracts";
import { normalizeCrewEntry, reconcileHandoff } from "./CrewEntries.ts";
import {
  claimCrewDelivery,
  markCrewDelivery,
  recoverCrewHandoff,
  stopCrewDelivery,
  type CrewDeliveryUpdate,
} from "./CrewDelivery.ts";
import { formatCrewMessage, validateCrewMessage } from "@t3tools/shared/crewContext";
import type { CrewStore } from "./CrewStore.ts";
import {
  ConnectionLoadError,
  GatewayError,
  type GatewayBot,
  type GrokBotGateway,
} from "./GrokBotGateway.ts";

export interface CrewControllerOptions {
  readonly store: CrewStore;
  readonly openGateway: (input: CrewConnectInput) => Promise<GrokBotGateway>;
  readonly now?: () => string;
  readonly discoverAccounts?: () => Promise<readonly string[]>;
}

const unavailable = () =>
  new CrewError({
    code: "disconnected",
    message: "Connect your account in the Grok Bot panel before using your bots.",
  });
const isCrewError = Schema.is(CrewError);
const decodeSendInput = Schema.decodeUnknownSync(CrewSendInputSchema);
const asCrewError = (error: unknown) =>
  isCrewError(error)
    ? error
    : new CrewError({
        code: "connection",
        message:
          error instanceof ConnectionLoadError || error instanceof GatewayError
            ? error.message
            : "Grok Bot could not complete the request. Reconnect to refresh its saved connection.",
      });
const conversationKey = (botId: string, sessionId: string) => JSON.stringify([botId, sessionId]);
const avatarMetadata = (value: unknown) =>
  typeof value === "string" && value.length > 0 && value.length <= 256 ? value : undefined;
const normalizeBot = (bot: GatewayBot): CrewBot => ({
  id: bot.id,
  name: bot.name ?? bot.id,
  isGroup: bot.isGroup ?? false,
  sessionId: bot.viewerSessionId ?? "",
  memberIds: bot.memberIds ?? [],
  ...(avatarMetadata(bot.avatarShape) === undefined
    ? {}
    : { avatarShape: avatarMetadata(bot.avatarShape) }),
  ...(avatarMetadata(bot.avatarColor) === undefined
    ? {}
    : { avatarColor: avatarMetadata(bot.avatarColor) }),
  ...(avatarMetadata(bot.avatarVersion) === undefined
    ? {}
    : { avatarVersion: avatarMetadata(bot.avatarVersion) }),
  ...(bot.harness === "temporal"
    ? {
        unavailableReason:
          "This bot uses the Temporal team backend. Open it in Grok Bot; this connection currently supports box gateway bots.",
      }
    : {}),
});

/** One server-owned connection and a durable nonce ledger shared by RPC and MCP clients. */
export class CrewController {
  private loadFailure: CrewError | undefined;
  private gateway: GrokBotGateway | undefined;
  private abort: AbortController | undefined;
  private eventsTask: Promise<void> | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<(event: CrewChange) => void>();
  private readonly watched = new Map<string, { botId: string; sessionId: string }>();
  private readonly reads = new Map<string, Promise<CrewConversation>>();
  private readonly avatars = new Map<string, Promise<CrewAvatar>>();
  private refreshTask: Promise<void> | undefined;
  private dirty = false;
  private handoffs: readonly CrewHandoff[] = [];
  private bots: readonly CrewBot[] = [];
  private connection: CrewSnapshot["connection"] = {
    status: "disconnected",
    accountScope: null,
    error: null,
  };
  private revision = 0;
  private connectionGeneration = 0;
  private readonly now: () => string;

  private readonly options: CrewControllerOptions;

  private constructor(options: CrewControllerOptions) {
    this.options = options;
    this.now = options.now ?? (() => DateTime.formatIso(DateTime.nowUnsafe()));
  }

  static async make(options: CrewControllerOptions): Promise<CrewController> {
    const controller = new CrewController(options);
    try {
      const loaded = await options.store.load();
      controller.handoffs = loaded.map((handoff) => recoverCrewHandoff(handoff, controller.now()));
      if (loaded.some((handoff, index) => handoff !== controller.handoffs[index]))
        await options.store.save(controller.handoffs);
    } catch {
      controller.loadFailure = new CrewError({
        code: "storage",
        message:
          "Grok Bot history could not be opened safely. Repair its storage and restart the server before reconnecting.",
      });
      controller.connection = {
        status: "error",
        accountScope: null,
        error: controller.loadFailure.message,
      };
    }
    if (!controller.loadFailure) {
      const connection = await options.store.loadConnection?.();
      if (connection?.enabled && connection.accountScope)
        await controller.connect({ accountScope: connection.accountScope }).catch(() => undefined);
    }
    return controller;
  }

  snapshot(): CrewSnapshot {
    return {
      connection: this.connection,
      bots: this.bots,
      handoffs: this.connection.accountScope
        ? this.handoffs.filter((handoff) => handoff.accountScope === this.connection.accountScope)
        : [],
      revision: this.revision,
    };
  }

  /** Internal receipt recovery must include accounts hidden from the client snapshot. */
  deliveryAttempts(): readonly CrewHandoff[] {
    return this.handoffs.filter((handoff) => handoff.delegation?.delivery.commandId);
  }

  subscribe(listener: (event: CrewChange) => void): () => void {
    this.listeners.add(listener);
    listener({ revision: this.revision, botId: null });
    return () => this.listeners.delete(listener);
  }

  private publish(botId: string | null = null): void {
    this.revision++;
    for (const listener of this.listeners) listener({ revision: this.revision, botId });
  }

  private serialized<A>(action: () => Promise<A>): Promise<A> {
    const result = this.queue.then(action);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async save(handoffs: readonly CrewHandoff[]): Promise<void> {
    await this.options.store.save(handoffs);
    this.handoffs = handoffs;
  }

  private requireGateway(): GrokBotGateway {
    if (this.loadFailure) throw this.loadFailure;
    if (!this.gateway || this.connection.status !== "connected") throw unavailable();
    return this.gateway;
  }

  private watch(target: { botId: string; sessionId: string }): void {
    const key = conversationKey(target.botId, target.sessionId);
    this.watched.delete(key);
    this.watched.set(key, target);
    // Keep event backfills bounded when a long-lived server has a large handoff history.
    if (this.watched.size > 32) {
      const expendable = [...this.watched.keys()].find(
        (candidate) =>
          !this.handoffs.some(
            (handoff) =>
              handoff.accountScope === this.connection.accountScope &&
              handoff.delegation?.delivery.status === "awaiting_reply" &&
              conversationKey(handoff.botId, handoff.sessionId) === candidate,
          ),
      );
      if (expendable) this.watched.delete(expendable);
    }
  }

  private target(input: CrewConversationInput): { botId: string; sessionId: string } {
    if (input.accountScope !== undefined && input.accountScope !== this.gateway?.accountScope)
      throw new CrewError({
        code: "invalid_input",
        message:
          "The connected Grok Bot account changed. Refresh the Grok Bot panel before sending or reading this conversation.",
      });
    const bot = this.bots.find((item) => item.id === input.botId);
    if (!bot)
      throw new CrewError({
        code: "not_found",
        message: "This bot is not in the connected Grok Bot account.",
      });
    if (bot.unavailableReason)
      throw new CrewError({ code: "invalid_input", message: bot.unavailableReason });
    return { botId: bot.id, sessionId: input.sessionId ?? bot.sessionId ?? "" };
  }

  connect(input: CrewConnectInput): Promise<CrewSnapshot> {
    return this.serialized(async () => {
      if (this.loadFailure) throw this.loadFailure;
      this.connectionGeneration++;
      this.abort?.abort();
      this.gateway = undefined;
      this.watched.clear();
      this.avatars.clear();
      this.bots = [];
      this.connection = { status: "connecting", accountScope: null, error: null };
      this.publish();
      try {
        const gateway = await this.options.openGateway(input);
        const roster = await gateway.roster();
        await this.options.store.saveConnection?.({
          accountScope: gateway.accountScope,
          enabled: true,
        });
        this.gateway = gateway;
        this.bots = roster.bots.map(normalizeBot);
        this.connection = { status: "connected", accountScope: gateway.accountScope, error: null };
        for (const handoff of this.handoffs) {
          if (
            handoff.accountScope === gateway.accountScope &&
            (handoff.replies.length === 0 ||
              handoff.replies.some((entry) => entry.streaming) ||
              handoff.delegation?.delivery.status === "awaiting_reply")
          )
            this.watch({ botId: handoff.botId, sessionId: handoff.sessionId });
        }
        const abort = new AbortController();
        this.abort = abort;
        this.eventsTask = this.consumeEvents(gateway, abort.signal);
        this.publish();
        this.scheduleRefresh();
        return this.snapshot();
      } catch (error) {
        const failure = asCrewError(error);
        const accounts =
          input.accountScope === undefined
            ? await this.options.discoverAccounts?.().catch(() => [])
            : undefined;
        this.connection = {
          status: "error",
          accountScope: null,
          error: failure.message,
          ...(accounts && accounts.length > 1 ? { availableAccountScopes: accounts } : {}),
        };
        this.publish();
        throw failure;
      }
    });
  }

  async disconnect(preserveConnection = false): Promise<CrewSnapshot> {
    this.abort?.abort();
    return this.serialized(async () => {
      this.connectionGeneration++;
      const accountScope = this.connection.accountScope;
      this.abort?.abort();
      this.gateway = undefined;
      this.bots = [];
      this.watched.clear();
      this.avatars.clear();
      this.connection = {
        status: this.loadFailure ? "error" : "disconnected",
        accountScope: null,
        error: this.loadFailure?.message ?? null,
      };
      this.publish();
      if (!preserveConnection)
        await this.options.store.saveConnection?.({ accountScope, enabled: false });
      return this.snapshot();
    });
  }

  async close(): Promise<void> {
    await this.disconnect(true);
    await this.eventsTask;
  }

  private async consumeEvents(gateway: GrokBotGateway, signal: AbortSignal): Promise<void> {
    let backoffMs = 1000;
    while (!signal.aborted) {
      try {
        for await (const event of gateway.events(signal)) {
          if (signal.aborted) return;
          backoffMs = 1000;
          if (
            [
              "agents",
              "transcript",
              "agentTranscript",
              "agent",
              "message",
              "promptAcceptance",
            ].some((channel) => event.channel.toLowerCase().includes(channel.toLowerCase()))
          )
            this.scheduleRefresh();
        }
      } catch {
        // The gateway sanitizes transport errors; reconnect reads only, never replay sends.
      }
      if (signal.aborted) return;
      this.connection = {
        ...this.connection,
        error: "Live updates interrupted; reconnecting and checking conversation history.",
      };
      this.publish();
      try {
        await NodeTimersPromises.setTimeout(backoffMs, undefined, { signal });
      } catch {
        return;
      }
      if (signal.aborted) return;
      backoffMs = Math.min(backoffMs * 2, 30000);
      this.scheduleRefresh();
    }
  }

  private scheduleRefresh(): void {
    this.dirty = true;
    if (this.refreshTask) return;
    this.refreshTask = (async () => {
      while (this.dirty) {
        this.dirty = false;
        await this.serialized(async () => {
          const gateway = this.gateway;
          if (!gateway || this.connection.status !== "connected") return;
          try {
            const roster = await gateway.roster();
            this.bots = roster.bots.map(normalizeBot);
            for (const target of this.watched.values()) {
              if (this.bots.some((bot) => bot.id === target.botId && !bot.unavailableReason))
                await this.readConversation(gateway, target);
            }
            this.connection = { ...this.connection, error: null };
            this.publish();
          } catch {
            this.connection = {
              ...this.connection,
              error: "Could not refresh Grok Bot. Reconnect if this continues.",
            };
            this.publish();
          }
        });
      }
    })().finally(() => {
      this.refreshTask = undefined;
    });
  }

  async drain(): Promise<void> {
    await this.refreshTask;
    await this.queue;
  }

  private async readConversation(
    gateway: GrokBotGateway,
    input: CrewConversationInput,
  ): Promise<CrewConversation> {
    const target = this.target(input);
    const page = await gateway.transcript({
      ...target,
      ...(input.beforeSeq === undefined ? {} : { beforeSeq: input.beforeSeq }),
      limit: 100,
    });
    let entries = page.entries.map((entry) =>
      normalizeCrewEntry(entry, this.bots.find((bot) => bot.id === target.botId)?.name ?? "Bot"),
    );
    const pending = this.handoffs.filter(
      (handoff) =>
        handoff.accountScope === gateway.accountScope &&
        handoff.botId === target.botId &&
        handoff.sessionId === target.sessionId &&
        handoff.delegation?.delivery.status === "awaiting_reply",
    );
    let beforeSeq = page.nextBeforeSeq;
    const seen = new Set<number>();
    // On reconnect, recover the exact echo before correlating a reply, even if it moved
    // outside the latest page. The bound leaves very old exchanges pending for review.
    for (
      let pages = 1;
      input.beforeSeq === undefined &&
      pages < 20 &&
      beforeSeq !== undefined &&
      beforeSeq !== null &&
      pending.some(
        (handoff) =>
          !entries.some((entry) => entry.role === "user" && entry.nonce === handoff.nonce),
      );
      pages++
    ) {
      if (seen.has(beforeSeq)) break;
      seen.add(beforeSeq);
      const older = await gateway.transcript({ ...target, beforeSeq, limit: 100 });
      entries.unshift(
        ...older.entries.map((entry) =>
          normalizeCrewEntry(
            entry,
            this.bots.find((bot) => bot.id === target.botId)?.name ?? "Bot",
          ),
        ),
      );
      beforeSeq = older.nextBeforeSeq;
    }
    entries = [...new Map(entries.map((entry) => [entry.id, entry])).values()];
    const handoffs = this.handoffs.map((handoff) =>
      input.beforeSeq === undefined &&
      handoff.accountScope === gateway.accountScope &&
      handoff.botId === target.botId &&
      handoff.sessionId === target.sessionId
        ? reconcileHandoff(handoff, entries, this.now())
        : handoff,
    );
    if (handoffs.some((handoff, index) => handoff !== this.handoffs[index])) {
      await this.save(handoffs);
      this.publish(target.botId);
    }
    return {
      accountScope: gateway.accountScope,
      ...target,
      entries,
      nextBeforeSeq: page.nextBeforeSeq ?? null,
    };
  }

  getConversation(input: CrewConversationInput): Promise<CrewConversation> {
    const key = JSON.stringify(input);
    const existing = this.reads.get(key);
    if (existing) return existing;
    const result = this.serialized(async () => {
      const gateway = this.requireGateway();
      const target = this.target(input);
      this.watch(target);
      return this.readConversation(gateway, input);
    })
      .catch((error: unknown) => {
        throw asCrewError(error);
      })
      .finally(() => this.reads.delete(key));
    this.reads.set(key, result);
    return result;
  }

  getAvatar(input: CrewAvatarInput): Promise<CrewAvatar> {
    try {
      const gateway = this.requireGateway();
      const generation = this.connectionGeneration;
      if (input.accountScope !== gateway.accountScope)
        throw new CrewError({
          code: "invalid_input",
          message: "The connected Grok Bot account changed. Refresh the Grok Bot panel.",
        });
      const bot = this.bots.find((item) => item.id === input.botId);
      if (!bot)
        throw new CrewError({
          code: "not_found",
          message: "This bot is not in the connected Grok Bot account.",
        });
      // The caller's version selects its query atom; only roster metadata selects the server cache.
      const key = JSON.stringify([gateway.accountScope, bot.id, bot.avatarVersion ?? null]);
      const cached = this.avatars.get(key);
      if (cached) return cached;
      // Independent image reads must not hold the queue used for messages and roster refreshes.
      const read = gateway
        .avatar({ botId: bot.id })
        .then((avatar): CrewAvatar => {
          if (
            generation !== this.connectionGeneration ||
            this.gateway !== gateway ||
            this.connection.status !== "connected"
          )
            throw unavailable();
          return { accountScope: gateway.accountScope, botId: bot.id, ...avatar };
        })
        .catch((error: unknown) => {
          if (this.avatars.get(key) === read) this.avatars.delete(key);
          throw asCrewError(error);
        });
      this.avatars.set(key, read);
      if (this.avatars.size > 32) this.avatars.delete(this.avatars.keys().next().value!);
      return read;
    } catch (error) {
      return Promise.reject(asCrewError(error));
    }
  }

  send(input: CrewSendInput): Promise<CrewHandoff> {
    return this.serialized(async () => {
      try {
        input = decodeSendInput(input);
      } catch {
        throw new CrewError({
          code: "invalid_input",
          message: "The message or context has invalid fields or exceeds its size limits.",
        });
      }
      const gateway = this.requireGateway();
      const target = this.target(input);
      if (!input.text.trim() || input.text.length > 32000 || !input.nonce.trim())
        throw new CrewError({
          code: "invalid_input",
          message: "A message and stable nonce are required.",
        });
      const previous = this.handoffs.find(
        (handoff) => handoff.accountScope === gateway.accountScope && handoff.nonce === input.nonce,
      );
      if (previous) {
        const inheritedMax =
          this.handoffs.find((item) => item.id === previous.delegation?.parentHandoffId)?.delegation
            ?.maxRounds ?? 5;
        if (
          previous.botId !== target.botId ||
          previous.sessionId !== target.sessionId ||
          previous.text !== input.text ||
          previous.originThreadId !== (input.originThreadId ?? null) ||
          JSON.stringify(previous.context ?? null) !== JSON.stringify(input.context ?? null) ||
          Boolean(previous.delegation) !== Boolean(input.automaticDelivery) ||
          (previous.delegation?.parentHandoffId ?? null) !== (input.parentHandoffId ?? null) ||
          (input.maxRounds !== undefined &&
            previous.delegation?.maxRounds !== Math.min(input.maxRounds, inheritedMax)) ||
          (previous.contextTokenBudget ?? 2000) !== (input.contextTokenBudget ?? 2000)
        )
          throw new CrewError({
            code: "nonce_conflict",
            message: "This nonce belongs to a different message. Do not reuse it.",
          });
        return previous;
      }
      const now = this.now();
      const id = NodeCrypto.randomUUID();
      const parent = input.parentHandoffId
        ? this.handoffs.find((item) => item.id === input.parentHandoffId)
        : undefined;
      if (
        input.parentHandoffId &&
        (!input.automaticDelivery ||
          !parent?.delegation ||
          parent.originThreadId !== input.originThreadId ||
          parent.accountScope !== gateway.accountScope ||
          parent.botId !== target.botId ||
          parent.sessionId !== target.sessionId ||
          !["accepted", "delivered"].includes(parent.delegation.delivery.status))
      )
        throw new CrewError({
          code: "invalid_input",
          message:
            "A follow-up must belong to the same task, account, bot, and conversation as its delivered parent.",
        });
      const rootHandoffId = parent?.delegation?.rootHandoffId ?? id;
      const maxRounds = Math.min(
        input.maxRounds ?? parent?.delegation?.maxRounds ?? 3,
        parent?.delegation?.maxRounds ?? 5,
      );
      const round = parent
        ? this.handoffs.filter((item) => item.delegation?.rootHandoffId === rootHandoffId).length +
          1
        : 1;
      if (input.automaticDelivery) {
        if (!input.originThreadId)
          throw new CrewError({
            code: "invalid_input",
            message: "Link a task before enabling automatic reply delivery.",
          });
        if (round > maxRounds)
          throw new CrewError({
            code: "invalid_input",
            message:
              "This delegation reached its automatic follow-up limit. Ask the user before starting another exchange.",
          });
        if (
          this.handoffs.some(
            (item) =>
              item.accountScope === gateway.accountScope &&
              item.botId === target.botId &&
              item.sessionId === target.sessionId &&
              item.id !== parent?.id &&
              item.acceptance !== "rejected" &&
              item.delegation &&
              ["awaiting_reply", "ready", "claimed", "accepted", "uncertain"].includes(
                item.delegation.delivery.status,
              ),
          )
        )
          throw new CrewError({
            code: "invalid_input",
            message:
              "This bot conversation already has an unresolved delegation. Read it or stop automatic delivery before starting another.",
          });
      }
      const replyMarker = input.automaticDelivery
        ? `[t3-reply:${NodeCrypto.randomUUID()}]`
        : undefined;
      const wireText = formatCrewMessage({ text: input.text, context: input.context, replyMarker });
      // Existing plain manual messages keep their 32,000-character allowance. Briefs and
      // automatic requests enforce the selected estimate against the complete wire text.
      const validation =
        input.context || input.automaticDelivery || input.contextTokenBudget !== undefined
          ? validateCrewMessage(wireText, input.contextTokenBudget ?? 2000)
          : wireText.length > 32000
            ? "The complete message exceeds 32,000 characters."
            : null;
      if (validation) throw new CrewError({ code: "invalid_input", message: validation });
      let handoff: CrewHandoff = {
        id,
        accountScope: gateway.accountScope,
        originThreadId: input.originThreadId ?? null,
        ...target,
        nonce: input.nonce,
        text: input.text,
        createdAt: now,
        updatedAt: now,
        acceptance: "pending",
        echoEntryId: null,
        replies: [],
        ...(input.context ? { context: input.context } : {}),
        ...(input.contextTokenBudget !== undefined
          ? { contextTokenBudget: input.contextTokenBudget }
          : {}),
        ...(wireText !== input.text ? { wireText } : {}),
        ...(replyMarker
          ? {
              delegation: {
                replyMarker,
                correlation: "awaiting",
                rootHandoffId,
                parentHandoffId: parent?.id ?? null,
                round,
                maxRounds,
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
            }
          : {}),
      };
      // The only dispatch path is after a durable intent. An interrupted attempt stays uncertain.
      await this.save([...this.handoffs, handoff]);
      this.watch(target);
      this.publish(target.botId);
      try {
        const result = await gateway.send({
          ...target,
          text: wireText,
          clientNonce: input.nonce,
        });
        handoff = {
          ...handoff,
          acceptance:
            result.accepted === true
              ? "accepted"
              : result.accepted === false
                ? "rejected"
                : "uncertain",
          updatedAt: this.now(),
        };
      } catch {
        handoff = { ...handoff, acceptance: "uncertain", updatedAt: this.now() };
      }
      try {
        await this.save(this.handoffs.map((item) => (item.id === handoff.id ? handoff : item)));
      } catch {
        // The disk still holds the pending intent. Keep the live view equally conservative.
        this.handoffs = this.handoffs.map((item) =>
          item.id === handoff.id
            ? { ...item, acceptance: "uncertain", updatedAt: this.now() }
            : item,
        );
        this.publish(target.botId);
        this.scheduleRefresh();
        throw new CrewError({
          code: "storage",
          message:
            "The message was dispatched but its acceptance could not be saved. Its nonce is reserved; do not send it again with a new nonce.",
        });
      }
      this.publish(target.botId);
      this.scheduleRefresh();
      return handoff;
    }).catch((error: unknown) => {
      throw asCrewError(error);
    });
  }

  getHandoff(id: string, originThreadId?: ThreadId): Promise<CrewHandoff> {
    return this.serialized(async () => {
      if (this.loadFailure) throw this.loadFailure;
      const handoff = this.handoffs.find((item) => item.id === id);
      if (!handoff || (originThreadId !== undefined && handoff.originThreadId !== originThreadId))
        throw new CrewError({
          code: "not_found",
          message: "No handoff is available in this thread.",
        });
      const gateway = this.gateway;
      if (gateway && gateway.accountScope === handoff.accountScope) {
        let page = await this.readConversation(gateway, handoff);
        let entries = [...page.entries];
        const seenCursors = new Set<number>();
        // Read older history only when an explicit handoff read needs to locate its exact echo.
        for (
          let pages = 1;
          pages < 20 &&
          !entries.some((entry) => entry.role === "user" && entry.nonce === handoff.nonce) &&
          page.nextBeforeSeq !== null;
          pages++
        ) {
          if (seenCursors.has(page.nextBeforeSeq)) break;
          seenCursors.add(page.nextBeforeSeq);
          page = await this.readConversation(gateway, {
            ...handoff,
            beforeSeq: page.nextBeforeSeq,
          });
          entries.unshift(...page.entries);
        }
        entries = Array.from(new Map(entries.map((entry) => [entry.id, entry])).values());
        const latest = this.handoffs.find((item) => item.id === id)!;
        const reconciled = reconcileHandoff(latest, entries, this.now());
        if (latest !== reconciled) {
          await this.save(this.handoffs.map((item) => (item.id === id ? reconciled : item)));
          this.publish(handoff.botId);
        }
        return reconciled;
      }
      return handoff;
    }).catch((error: unknown) => {
      throw asCrewError(error);
    });
  }

  claimDelivery(input: CrewStopDeliveryInput): Promise<CrewHandoff | null> {
    return this.serialized(async () => {
      this.requireGateway();
      if (input.accountScope !== this.connection.accountScope) return null;
      const handoff = this.handoffs.find(
        (item) => item.id === input.handoffId && item.accountScope === input.accountScope,
      );
      const claimed = handoff ? claimCrewDelivery(handoff, this.now()) : null;
      if (!claimed) return null;
      await this.save(this.handoffs.map((item) => (item.id === claimed.id ? claimed : item)));
      this.publish(claimed.botId);
      return claimed.delegation?.delivery.status === "claimed" ? claimed : null;
    });
  }

  markDelivery(input: CrewDeliveryUpdate): Promise<CrewHandoff> {
    return this.serialized(async () => {
      if (this.loadFailure) throw this.loadFailure;
      const handoff = this.handoffs.find((item) => item.id === input.handoffId);
      if (!handoff?.delegation || handoff.delegation.delivery.commandId !== input.commandId)
        throw new CrewError({
          code: "not_found",
          message: "No matching Grok Bot delivery attempt exists.",
        });
      const updated = markCrewDelivery(handoff, input, this.now());
      if (updated === handoff) return handoff;
      await this.save(this.handoffs.map((item) => (item.id === updated.id ? updated : item)));
      this.publish(updated.botId);
      return updated;
    });
  }

  stopDelivery(input: CrewStopDeliveryInput, originThreadId?: ThreadId): Promise<CrewHandoff> {
    return this.serialized(async () => {
      if (this.loadFailure) throw this.loadFailure;
      const handoff = this.handoffs.find(
        (item) =>
          item.id === input.handoffId &&
          item.accountScope === input.accountScope &&
          (originThreadId === undefined || item.originThreadId === originThreadId),
      );
      if (!handoff)
        throw new CrewError({
          code: "not_found",
          message: "No handoff is available in this task and account.",
        });
      const stopped = stopCrewDelivery(handoff, this.now());
      if (stopped === handoff) return handoff;
      await this.save(this.handoffs.map((item) => (item.id === stopped.id ? stopped : item)));
      this.publish(stopped.botId);
      return stopped;
    });
  }
}
