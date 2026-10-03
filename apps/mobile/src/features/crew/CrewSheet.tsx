import type {
  CrewBot,
  CrewEntry,
  CrewHandoff,
  CrewSendInput,
  CrewSnapshot,
  EnvironmentId,
  ThreadId,
} from "@t3tools/contracts";
import {
  canStopCrewDelivery,
  classifyCrewSendFailure,
  crewDraftBudgetText,
  crewDraftKey,
  crewDraftPreview,
  crewDraftValidationError,
  crewHandoffStatus,
  crewTaskContextSources,
  crewTaskContextThread,
  type CrewDraftContext,
  formatCrewReplyDraft,
  type CrewDraftScope,
} from "@t3tools/client-runtime/crew-draft";
import {
  canUseCrewReply,
  showCrewConversationTimestamp,
} from "@t3tools/client-runtime/crew-conversation";
import { estimateCrewTokens } from "@t3tools/shared/crewContext";
import * as Cause from "effect/Cause";
import { randomUUID } from "expo-crypto";
import { type ComponentRef, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText as Text, AppTextInput as TextInput } from "../../components/AppText";
import { SymbolView } from "../../components/AppSymbol";
import { ControlPill } from "../../components/ControlPill";
import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { GrokBotIcon } from "../../components/GrokBotIcon";
import { StatusPill } from "../../components/StatusPill";
import { connectionTone } from "../connection/connectionTone";
import { cn } from "../../lib/cn";
import { crewEnvironment } from "../../state/crew";
import {
  clearCrewIntent,
  readCrewIntent,
  releaseRejectedCrewIntent,
  reserveCrewIntent,
} from "../../state/crew-intents";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { GrokBotAvatar } from "./GrokBotAvatar";
import { CrewContextEditor } from "./CrewContextEditor";
import { CrewConversationMessage } from "./CrewConversationMessage";
import { ThemedSwitch } from "../../components/ThemedSwitch";
import { useThreadVisibleTurnItems } from "../../state/use-thread-detail";

export interface CrewSheetProps {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel?: string | null;
  readonly threadId?: ThreadId;
  readonly onUseReply?: (text: string) => void;
  readonly onClose: () => void;
}

export function CrewSheet(props: CrewSheetProps) {
  const insets = useSafeAreaInsets();
  const query = useEnvironmentQuery(
    crewEnvironment.snapshot({ environmentId: props.environmentId, input: undefined }),
  );
  const connect = useAtomCommand(crewEnvironment.connect, { reportFailure: false });
  const disconnect = useAtomCommand(crewEnvironment.disconnect, { reportFailure: false });
  const [botId, setBotId] = useState<string | null>(null);
  const [account, setAccount] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const snapshot = query.data;
  const connected = snapshot?.connection.status === "connected";
  const bot = snapshot?.bots.find((item) => item.id === botId);
  const savedScopes = snapshot?.connection.availableAccountScopes ?? [];
  const connectionStatus = snapshot?.connection.status;
  const status = connectionTone(
    connectionStatus === "disconnected"
      ? "available"
      : (connectionStatus ?? (query.error ? "error" : "connecting")),
  );
  const statusLabel =
    connectionStatus === "disconnected"
      ? "Disconnected"
      : snapshot || query.error
        ? status.label
        : "Loading";
  const visibleBots = (snapshot?.bots ?? []).filter((item) =>
    item.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const errorMessage = error ?? query.error ?? snapshot?.connection.error;

  async function changeConnection() {
    setBusy(true);
    setError(null);
    try {
      const result = connected
        ? await disconnect({ environmentId: props.environmentId, input: undefined })
        : await connect({
            environmentId: props.environmentId,
            input: account.trim() ? { accountScope: account.trim() } : {},
          });
      if (result._tag === "Failure") {
        const failure = Cause.squash(result.cause);
        setError(
          failure instanceof Error ? failure.message : "Could not change the Grok Bot connection.",
        );
      } else if (connected) setBotId(null);
      query.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 bg-sheet"
        style={{
          paddingTop: Platform.OS === "android" ? insets.top : 12,
          paddingBottom: insets.bottom,
        }}
      >
        <View className="min-h-16 flex-row items-center gap-3 border-b border-header-border bg-header px-4 py-2">
          {bot ? (
            <ControlPill
              icon="chevron.left"
              accessibilityLabel="Back to Grok Bot roster"
              onPress={() => setBotId(null)}
            />
          ) : null}
          {bot ? (
            <GrokBotAvatar
              environmentId={props.environmentId}
              accountScope={snapshot?.connection.accountScope ?? null}
              bot={bot}
              roster={snapshot?.bots}
              size={36}
              animated={connected && !bot.unavailableReason}
            />
          ) : (
            <GrokBotIcon size={32} />
          )}
          <View className="min-w-0 flex-1 gap-0.5">
            <Text numberOfLines={1} className="text-lg font-t3-bold">
              {bot?.name ?? "Grok Bot"}
            </Text>
            <Text numberOfLines={1} className="text-xs text-foreground-muted">
              {bot ? "Grok Bot · " : ""}
              {props.environmentLabel ?? "This environment"}
            </Text>
          </View>
          <ControlPill icon="xmark" accessibilityLabel="Close Grok Bot" onPress={props.onClose} />
        </View>
        {errorMessage ? (
          <View accessibilityRole="alert" className="px-4 pt-3">
            <ErrorBanner message={errorMessage} />
          </View>
        ) : null}
        {snapshot && bot && connected && snapshot.connection.accountScope ? (
          bot.unavailableReason ? (
            <View className="p-4">
              <EmptyState
                title="Continue in Grok Bot"
                detail={bot.unavailableReason}
                actionLabel="Back to bots"
                onAction={() => setBotId(null)}
              />
            </View>
          ) : (
            <Conversation
              key={JSON.stringify([
                props.environmentId,
                snapshot.connection.accountScope,
                bot.id,
                bot.sessionId,
              ])}
              {...props}
              bot={bot}
              snapshot={snapshot}
              refreshSnapshot={query.refresh}
            />
          )
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ padding: 16, gap: 20 }}
          >
            <View className="gap-3 rounded-[22px] border border-border bg-card p-4">
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-row items-center gap-2">
                  <SymbolView name="link" size={16} tintColorClassName="accent-icon-muted" />
                  <Text className="text-sm font-t3-medium">Connection</Text>
                </View>
                <StatusPill {...status} label={statusLabel} size="compact" />
              </View>
              {connected && snapshot?.connection.accountScope ? (
                <Text selectable numberOfLines={1} className="text-xs text-foreground-muted">
                  Account: {snapshot.connection.accountScope}
                </Text>
              ) : null}
              {!connected ? (
                <Text className="text-sm leading-normal text-foreground-muted">
                  Use the account signed in to Grok Bot on{" "}
                  {props.environmentLabel ?? "this environment"} to talk with your existing bots.
                </Text>
              ) : null}
              {!connected && (accountOpen || savedScopes.length > 0) ? (
                <View className="gap-2">
                  <Text className="text-xs font-t3-medium text-foreground-muted">Account</Text>
                  {savedScopes.map((savedScope) => (
                    <Pressable
                      key={savedScope}
                      accessibilityRole="radio"
                      accessibilityLabel={`Account ${savedScope}`}
                      accessibilityState={{ checked: account === savedScope }}
                      disabled={busy}
                      onPress={() => setAccount(savedScope)}
                      className="flex-row items-center gap-2 rounded-xl bg-subtle px-3 py-3"
                    >
                      <Text numberOfLines={1} className="flex-1 text-sm">
                        {savedScope}
                      </Text>
                      {account === savedScope ? (
                        <SymbolView name="checkmark" size={15} tintColorClassName="accent-icon" />
                      ) : null}
                    </Pressable>
                  ))}
                  {savedScopes.length === 0 ? (
                    <TextInput
                      accessibilityLabel="Grok Bot account scope"
                      placeholder="Saved account (optional)"
                      value={account}
                      onChangeText={setAccount}
                      editable={!busy}
                      autoCapitalize="none"
                      autoCorrect={false}
                      className="min-h-11 py-2 text-sm"
                    />
                  ) : null}
                </View>
              ) : null}
              <View className="flex-row flex-wrap items-center justify-between gap-3">
                <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-2">
                  <ControlPill
                    variant={connected ? "pill" : "primary"}
                    label={busy ? "Working…" : connected ? "Disconnect" : "Connect"}
                    disabled={busy || !snapshot}
                    onPress={() => void changeConnection()}
                  />
                  {!connected && savedScopes.length === 0 ? (
                    <ControlPill
                      variant="pill"
                      label={accountOpen ? "Hide account" : "Choose account"}
                      onPress={() => setAccountOpen(!accountOpen)}
                    />
                  ) : null}
                </View>
                <ControlPill
                  icon="arrow.clockwise"
                  accessibilityLabel="Refresh Grok Bot connection and roster"
                  disabled={query.isPending}
                  onPress={query.refresh}
                />
              </View>
            </View>
            {!snapshot && query.isPending ? (
              <View className="items-center gap-3 py-8">
                <ActivityIndicator colorClassName="accent-icon-muted" />
                <Text className="text-sm text-foreground-muted">Loading Grok Bot…</Text>
              </View>
            ) : null}
            {connected && snapshot && snapshot.bots.length > 0 ? (
              <>
                <View className="gap-2">
                  <Text className="px-1 text-sm text-foreground-muted">
                    {props.threadId
                      ? "Choose a bot to ask from this task."
                      : "Choose a bot or group to open its conversation."}
                  </Text>
                  {snapshot.bots.length > 5 ? (
                    <TextInput
                      accessibilityLabel="Find a Grok Bot"
                      placeholder="Find a bot or group"
                      value={search}
                      onChangeText={setSearch}
                      autoCorrect={false}
                      autoCapitalize="none"
                      clearButtonMode="while-editing"
                      className="min-h-11 py-2 text-sm"
                    />
                  ) : null}
                </View>
                {[false, true].map((isGroup) => {
                  const group = visibleBots.filter((item) => item.isGroup === isGroup);
                  if (group.length === 0) return null;
                  return (
                    <View key={String(isGroup)} className="gap-2">
                      <Text className="px-1 text-xs font-t3-medium uppercase tracking-wide text-foreground-muted">
                        {isGroup ? "Groups" : "Bots"} · {group.length}
                      </Text>
                      <View className="overflow-hidden rounded-[22px] border border-border bg-card">
                        {group.map((item, index) => (
                          <Pressable
                            key={item.id}
                            accessibilityRole="button"
                            accessibilityLabel={`${item.name}, ${item.isGroup ? "group" : "bot"}${item.unavailableReason ? ", open in Grok Bot" : ""}`}
                            onPress={() => setBotId(item.id)}
                            className={cn(
                              "min-h-17 flex-row items-center gap-3 px-4 py-3 active:bg-subtle",
                              index > 0 && "border-t border-border-subtle",
                            )}
                          >
                            <GrokBotAvatar
                              environmentId={props.environmentId}
                              accountScope={snapshot.connection.accountScope}
                              bot={item}
                              roster={snapshot.bots}
                            />
                            <View className="min-w-0 flex-1 gap-0.5">
                              <Text numberOfLines={1} className="text-base font-t3-medium">
                                {item.name}
                              </Text>
                              <Text numberOfLines={1} className="text-xs text-foreground-muted">
                                {item.unavailableReason
                                  ? "Continue in Grok Bot"
                                  : item.isGroup
                                    ? `${item.memberIds.length} members`
                                    : "Open conversation"}
                              </Text>
                            </View>
                            <SymbolView
                              name="chevron.right"
                              size={12}
                              tintColorClassName="accent-icon-subtle"
                            />
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  );
                })}
                {visibleBots.length === 0 ? (
                  <EmptyState
                    title="No matching bots"
                    detail="Try another name."
                    actionLabel="Clear search"
                    onAction={() => setSearch("")}
                  />
                ) : null}
              </>
            ) : connected && snapshot ? (
              <EmptyState
                title="No bots yet"
                detail="Create a bot in Grok Bot, then refresh this list."
                actionLabel="Refresh bots"
                onAction={query.refresh}
              />
            ) : null}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Conversation(
  props: CrewSheetProps & { bot: CrewBot; snapshot: CrewSnapshot; refreshSnapshot: () => void },
) {
  const [text, setText] = useState("");
  const [nonce, setNonce] = useState(randomUUID);
  const [context, setContext] = useState<CrewDraftContext | undefined>(undefined);
  const [automaticDelivery, setAutomaticDelivery] = useState(false);
  const [contextTokenBudget, setContextTokenBudget] = useState(2000);
  const [contextOpen, setContextOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingOriginThreadId, setPendingOriginThreadId] = useState<ThreadId | null>(
    props.threadId ?? null,
  );
  const [intent, setIntent] = useState<CrewSendInput | null>(null);
  const [loadedScopeKey, setLoadedScopeKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operation, setOperation] = useState<"sending" | "starting-new" | null>(null);
  const busy = operation !== null;
  const sending = useRef(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const initialScrollDone = useRef(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [expandedHandoffId, setExpandedHandoffId] = useState<string | null>(null);
  const query = useEnvironmentQuery(
    crewEnvironment.conversation({
      environmentId: props.environmentId,
      input: {
        accountScope: props.snapshot.connection.accountScope!,
        botId: props.bot.id,
        ...(props.bot.sessionId ? { sessionId: props.bot.sessionId } : {}),
      },
    }),
  );
  const send = useAtomCommand(crewEnvironment.send, { reportFailure: false, reportDefect: false });
  const stopDelivery = useAtomCommand(crewEnvironment.stopDelivery, { reportFailure: false });
  const scope = useMemo<CrewDraftScope>(
    () => ({
      environmentId: props.environmentId,
      accountScope: props.snapshot.connection.accountScope!,
      botId: props.bot.id,
      sessionId: query.data?.sessionId ?? props.bot.sessionId ?? "",
    }),
    [
      props.environmentId,
      props.snapshot.connection.accountScope,
      props.bot.id,
      props.bot.sessionId,
      query.data?.sessionId,
    ],
  );
  const scopeKey = crewDraftKey(scope);
  const ready = loadedScopeKey === scopeKey && query.data?.accountScope === scope.accountScope;
  const scopedHandoffs = props.snapshot.handoffs.filter(
    (item) =>
      item.accountScope === scope.accountScope &&
      item.botId === scope.botId &&
      item.sessionId === scope.sessionId,
  );
  const savedHandoff = intent ? scopedHandoffs.find((item) => item.nonce === intent.nonce) : null;
  const handoffQuery = useEnvironmentQuery(
    savedHandoff
      ? crewEnvironment.handoff({
          environmentId: props.environmentId,
          input: { handoffId: savedHandoff.id },
        })
      : null,
  );
  const handoff = handoffQuery.data ?? savedHandoff;
  const canStartNew = handoff?.acceptance === "accepted" || handoff?.acceptance === "rejected";
  const visibleOriginThreadId = intent ? (intent.originThreadId ?? null) : pendingOriginThreadId;
  const sourceTurnItems = useThreadVisibleTurnItems({
    environmentId: props.environmentId,
    threadId: visibleOriginThreadId,
  });
  const contextSources = useMemo(
    () =>
      crewTaskContextSources(
        visibleOriginThreadId ? crewTaskContextThread(sourceTurnItems) : null,
      ),
    [sourceTurnItems, visibleOriginThreadId],
  );
  const pendingDraft = {
    text,
    ...(context ? { context } : {}),
    automaticDelivery,
    contextTokenBudget,
    attempted: false,
    nonce: "",
    origin: null,
  };
  const draftError = text.trim() ? crewDraftValidationError(pendingDraft) : null;
  const originLabel = visibleOriginThreadId
    ? visibleOriginThreadId === props.threadId
      ? "Linked to this task"
      : "Linked to another task"
    : "Direct message";

  useEffect(() => {
    let active = true;
    void readCrewIntent(scope)
      .then((saved) => {
        if (!active) return;
        setIntent(saved);
        setNonce(saved?.nonce ?? randomUUID());
        setText(saved?.text ?? "");
        setContext(saved?.context);
        setAutomaticDelivery(saved?.automaticDelivery ?? false);
        setContextTokenBudget(saved?.contextTokenBudget ?? 2000);
        setLoadedScopeKey(scopeKey);
      })
      .catch(() => {
        if (active) setError("Could not read the previous send. Reopen Grok Bot before sending.");
      });
    return () => {
      active = false;
    };
  }, [scope, scopeKey]);

  async function sendMessage() {
    if (sending.current || intent || !ready || !text.trim() || draftError) return;
    sending.current = true;
    setOperation("sending");
    setError(null);
    const input: CrewSendInput = {
      accountScope: scope.accountScope,
      botId: scope.botId,
      sessionId: scope.sessionId,
      text,
      nonce,
      ...(context ? { context } : {}),
      ...(pendingOriginThreadId && automaticDelivery ? { automaticDelivery: true } : {}),
      contextTokenBudget,
      ...(pendingOriginThreadId ? { originThreadId: pendingOriginThreadId } : {}),
    };
    try {
      await reserveCrewIntent(scope, input);
      setIntent(input);
      Keyboard.dismiss();
      const result = await send({ environmentId: props.environmentId, input });
      if (result._tag === "Failure") {
        const error = Cause.squash(result.cause);
        const failure = classifyCrewSendFailure(error);
        if (failure.disposition === "rejected") {
          try {
            if (await releaseRejectedCrewIntent(scope, input.nonce, error)) {
              setIntent(null);
              setError(`${failure.message} Your draft is available to edit.`);
            } else {
              setError(`${failure.message} Reopen Grok Bot to review the saved message.`);
            }
          } catch {
            setError(
              `${failure.message} Could not release the saved message. It remains locked to prevent another send.`,
            );
          }
        } else {
          setError(
            `${failure.message} Delivery is uncertain. Refresh to inspect the handoff; this message will not be resent.`,
          );
        }
      }
      query.refresh();
      props.refreshSnapshot();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not save the message before sending.",
      );
    } finally {
      setOperation(null);
      sending.current = false;
    }
  }

  async function newMessage(nextOriginThreadId = pendingOriginThreadId) {
    if (!canStartNew || busy) return;
    setOperation("starting-new");
    try {
      await clearCrewIntent(scope);
      setIntent(null);
      setNonce(randomUUID());
      setPendingOriginThreadId(nextOriginThreadId);
      setText("");
      setContext(undefined);
      setAutomaticDelivery(false);
      setContextTokenBudget(2000);
      setError(null);
      setReceiptOpen(false);
    } catch {
      setError("Could not clear the previous message.");
    } finally {
      setOperation(null);
    }
  }

  async function stopAutomaticDelivery(item: CrewHandoff) {
    const result = await stopDelivery({
      environmentId: props.environmentId,
      input: { accountScope: item.accountScope, handoffId: item.id },
    });
    if (result._tag === "Failure") {
      const failure = Cause.squash(result.cause);
      setError(failure instanceof Error ? failure.message : "Could not stop automatic delivery.");
    } else
      setNotice(
        "Future delivery stopped. This does not cancel the bot or coding work already started.",
      );
    refreshConversation();
  }

  function useReply(entry: CrewEntry) {
    if (!canUseCrewReply(entry)) return;
    const source = scopedHandoffs.find((item) =>
      item.replies.some((reply) => reply.id === entry.id),
    );
    if (source?.originThreadId && source.originThreadId !== props.threadId) return;
    props.onUseReply?.(formatCrewReplyDraft(scope, props.bot.name, entry, source?.id));
    props.onClose();
  }

  function refreshConversation() {
    query.refresh();
    handoffQuery.refresh();
    props.refreshSnapshot();
  }

  const sendingIntent = operation === "sending";
  const deliveryLabel = sendingIntent
    ? "Sending"
    : handoff?.acceptance === "accepted"
      ? "Accepted"
      : handoff?.acceptance === "rejected"
        ? "Rejected"
        : "Unconfirmed";
  const deliveryTone = connectionTone(
    handoff?.acceptance === "accepted"
      ? "connected"
      : handoff?.acceptance === "rejected"
        ? "error"
        : "reconnecting",
  );
  const entries = query.data?.entries ?? [];

  return (
    <>
      <View className="flex-row items-center justify-between gap-3 px-4 py-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <StatusPill {...connectionTone("connected")} size="compact" />
          <Text numberOfLines={1} className="min-w-0 flex-1 text-xs text-foreground-muted">
            {props.bot.isGroup ? "Group conversation" : "Conversation"}
          </Text>
        </View>
        <View className="flex-row gap-2">
          <ControlPill
            icon="arrow.down.circle"
            accessibilityLabel="Go to latest messages"
            disabled={entries.length === 0}
            onPress={() => scrollRef.current?.scrollToEnd({ animated: true })}
          />
          <ControlPill
            icon="arrow.clockwise"
            accessibilityLabel="Refresh conversation and delivery"
            disabled={query.isPending}
            onPress={refreshConversation}
          />
        </View>
      </View>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 16 }}
        onContentSizeChange={() => {
          if (!initialScrollDone.current && entries.length > 0) {
            initialScrollDone.current = true;
            scrollRef.current?.scrollToEnd({ animated: false });
          }
        }}
      >
        {query.error ? (
          <View accessibilityRole="alert">
            <ErrorBanner message={query.error} />
          </View>
        ) : null}
        {query.isPending && !query.data ? (
          <View className="items-center gap-3 py-8">
            <ActivityIndicator colorClassName="accent-icon-muted" />
            <Text className="text-sm text-foreground-muted">Loading conversation…</Text>
          </View>
        ) : null}
        {!query.isPending && !query.error && entries.length === 0 ? (
          <EmptyState
            title="Start a conversation"
            detail={`Write a message to ${props.bot.name}. Only the text you choose is shared.`}
            variant="plain"
          />
        ) : null}
        {query.data?.nextBeforeSeq != null ? (
          <Text className="px-2 text-center text-xs leading-normal text-foreground-muted">
            Recent messages · older history is available in the web Grok Bot panel.
          </Text>
        ) : null}
        {scopedHandoffs
          .filter((item) => item.originThreadId)
          .slice(-10)
          .toReversed()
          .map((item) => (
            <View key={item.id} className="gap-2 rounded-xl border border-border bg-card p-3">
              <Text className="text-xs font-t3-medium">{crewHandoffStatus(item)}</Text>
              <Text numberOfLines={2} className="text-sm text-foreground-muted">
                {item.text}
              </Text>
              <Text className="text-xs text-foreground-muted">
                {item.originThreadId === props.threadId ? "This task" : "Another task"} ·{" "}
                {item.replies.length} replies
              </Text>
              <ControlPill
                variant="pill"
                label={expandedHandoffId === item.id ? "Hide sent context" : "View sent context"}
                onPress={() => setExpandedHandoffId(expandedHandoffId === item.id ? null : item.id)}
              />
              {expandedHandoffId === item.id ? (
                <View className="max-h-52 rounded-xl bg-subtle p-3">
                  <ScrollView nestedScrollEnabled>
                    <Text selectable className="text-xs">
                      {item.wireText ?? item.text}
                    </Text>
                  </ScrollView>
                </View>
              ) : null}
              {item.delegation?.delivery.error ? (
                <Text className="text-xs text-foreground-muted">
                  {item.delegation.delivery.error}
                </Text>
              ) : null}
              {canStopCrewDelivery(item) ? (
                <ControlPill
                  variant="pill"
                  label="Stop automatic delivery"
                  onPress={() => void stopAutomaticDelivery(item)}
                />
              ) : null}
            </View>
          ))}
        {entries.map((entry, index) => {
          const source = scopedHandoffs.find((item) =>
            item.replies.some((reply) => reply.id === entry.id),
          );
          const linkedToAnotherTask = Boolean(
            source?.originThreadId && source.originThreadId !== props.threadId,
          );
          return (
            <View key={entry.id} className="gap-3">
              {showCrewConversationTimestamp(entry, entries[index - 1]) && entry.createdAt ? (
                <Text className="py-1 text-center text-xs text-foreground-muted">
                  {new Date(entry.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
              ) : null}
              <CrewConversationMessage
                entry={entry}
                bot={props.bot}
                roster={props.snapshot.bots}
                environmentId={props.environmentId}
                accountScope={props.snapshot.connection.accountScope}
                linkedToAnotherTask={linkedToAnotherTask}
                onUseReply={
                  props.onUseReply && canUseCrewReply(entry) && !linkedToAnotherTask
                    ? () => useReply(entry)
                    : undefined
                }
              />
            </View>
          );
        })}
      </ScrollView>
      <ScrollView
        style={{ maxHeight: "55%", flexGrow: 0 }}
        className="border-t border-border bg-card"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
      >
        {error ? (
          <View accessibilityRole="alert">
            <ErrorBanner message={error} />
          </View>
        ) : null}
        <View className="flex-row items-center justify-between gap-2">
          <View className="min-w-0 flex-1 flex-row items-center gap-2">
            <SymbolView
              name={visibleOriginThreadId ? "link" : "text.bubble"}
              size={14}
              tintColorClassName="accent-icon-muted"
            />
            <Text className="min-w-0 flex-1 text-xs font-t3-medium text-foreground-muted">
              {originLabel}
            </Text>
          </View>
          {visibleOriginThreadId && (!intent || (canStartNew && !busy)) ? (
            <ControlPill
              label="Unlink from task"
              variant="pill"
              disabled={!ready || busy}
              onPress={() => {
                if (intent) void newMessage(null);
                else {
                  setPendingOriginThreadId(null);
                  setContext(undefined);
                  setAutomaticDelivery(false);
                  setNotice(
                    "Question kept. Attached task context removed and automatic delivery disabled.",
                  );
                }
              }}
            />
          ) : !intent && props.threadId ? (
            <ControlPill
              label="Link to this task"
              variant="pill"
              disabled={!ready || busy}
              onPress={() => {
                setPendingOriginThreadId(props.threadId ?? null);
                setContext(undefined);
                setAutomaticDelivery(false);
                setNotice(null);
              }}
            />
          ) : null}
        </View>
        {intent && visibleOriginThreadId && canStartNew ? (
          <Text className="text-xs leading-normal text-foreground-muted">
            Unlink starts an empty direct message. The submitted message stays linked.
          </Text>
        ) : null}
        {intent ? (
          <>
            <View className="flex-row items-center justify-between gap-3">
              <StatusPill {...deliveryTone} label={deliveryLabel} size="compact" />
              <ControlPill
                icon={receiptOpen ? "chevron.up" : "chevron.down"}
                label="Message details"
                variant="pill"
                onPress={() => setReceiptOpen(!receiptOpen)}
              />
            </View>
            <Text className="text-sm text-foreground-muted">
              {sendingIntent
                ? "Sending this message once…"
                : handoff?.acceptance === "accepted"
                  ? crewHandoffStatus(handoff)
                  : handoff?.acceptance === "rejected"
                    ? "The message was rejected. You can compose a new one."
                    : "Delivery could not be confirmed. Check its status before composing another message."}
            </Text>
            {handoff && canStopCrewDelivery(handoff) ? (
              <ControlPill
                variant="pill"
                label="Stop automatic delivery"
                onPress={() => void stopAutomaticDelivery(handoff)}
              />
            ) : null}
            {handoff?.delegation?.delivery.error ? (
              <Text className="text-xs text-foreground-muted">
                {handoff.delegation.delivery.error}
              </Text>
            ) : null}
            {receiptOpen ? (
              <View className="max-h-40 rounded-xl bg-subtle p-3">
                <ScrollView nestedScrollEnabled>
                  <Text selectable className="text-sm">
                    {handoff?.wireText ?? crewDraftPreview(intent)}
                  </Text>
                  <Text selectable className="mt-3 text-xs text-foreground-muted">
                    {intent.originThreadId ? `Task: ${intent.originThreadId}` : "Direct message"}
                    {"\n"}Receipt: {intent.nonce}
                    {"\n"}Account: {scope.accountScope}
                    {"\n"}Session: {scope.sessionId || "Default"}
                  </Text>
                </ScrollView>
              </View>
            ) : null}
            <View className="flex-row items-center justify-between gap-3">
              <Text className="min-w-0 flex-1 text-xs leading-normal text-foreground-muted">
                {handoff?.replies.length
                  ? `${handoff.replies.length} replies received. ${handoff.delegation ? crewHandoffStatus(handoff) : "Use a reply in your task draft."}`
                  : "A reply does not mark the coding task complete."}
              </Text>
              {canStartNew ? (
                <ControlPill
                  label="New message"
                  variant="primary"
                  disabled={busy}
                  onPress={() => void newMessage()}
                />
              ) : (
                <ControlPill
                  label="Check delivery"
                  icon="arrow.clockwise"
                  variant="pill"
                  disabled={busy}
                  onPress={refreshConversation}
                />
              )}
            </View>
          </>
        ) : (
          <>
            {pendingOriginThreadId ? (
              <View className="gap-2">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="min-w-0 flex-1 text-xs">Return reply to coding agent</Text>
                  <ThemedSwitch
                    accessibilityLabel="Return reply to coding agent"
                    value={automaticDelivery}
                    disabled={!ready || busy}
                    onValueChange={setAutomaticDelivery}
                  />
                </View>
                {automaticDelivery ? (
                  <Text className="text-xs text-foreground-muted">
                    The reply can continue this task when the agent is available.
                  </Text>
                ) : null}
                <View className="flex-row flex-wrap gap-2">
                  <ControlPill
                    variant="pill"
                    label={context ? "Edit task context" : "Attach task context"}
                    disabled={!ready || busy}
                    onPress={() => {
                      setContext(context ?? {});
                      setContextOpen(true);
                    }}
                  />
                  {context ? (
                    <ControlPill
                      variant="pill"
                      label="Remove context"
                      onPress={() => setContext(undefined)}
                    />
                  ) : null}
                </View>
              </View>
            ) : null}
            <TextInput
              accessibilityLabel="Message to Grok Bot"
              placeholder={
                pendingOriginThreadId
                  ? "Ask a question and include the context to share…"
                  : "Write a message…"
              }
              multiline
              maxLength={32000}
              value={text}
              onChangeText={setText}
              editable={ready && !busy}
              className="max-h-36 min-h-24 text-sm"
            />
            {text || context ? (
              <View className="gap-2">
                <View className="flex-row flex-wrap items-center justify-between gap-2">
                  <Text className="text-xs text-foreground-muted">
                    ~{estimateCrewTokens(crewDraftBudgetText(pendingDraft)).toLocaleString()} tokens
                  </Text>
                  <ControlPill
                    variant="pill"
                    label={`${contextTokenBudget.toLocaleString()} limit`}
                    accessibilityLabel="Change message token budget"
                    onPress={() =>
                      setContextTokenBudget(
                        contextTokenBudget === 1000
                          ? 2000
                          : contextTokenBudget === 2000
                            ? 4000
                            : 1000,
                      )
                    }
                  />
                  <ControlPill
                    variant="pill"
                    label={previewOpen ? "Hide preview" : "Preview message"}
                    onPress={() => setPreviewOpen(!previewOpen)}
                  />
                </View>
                {draftError ? <ErrorBanner message={draftError} /> : null}
                {previewOpen ? (
                  <View className="max-h-36 rounded-xl bg-subtle p-3">
                    <ScrollView nestedScrollEnabled>
                      <Text selectable className="text-xs">
                        {crewDraftPreview(pendingDraft)}
                      </Text>
                      {automaticDelivery ? (
                        <Text className="mt-2 text-xs text-foreground-muted">
                          A reply reference and routing instruction are added on send; their size is
                          included above.
                        </Text>
                      ) : null}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
            ) : null}
            <View className="flex-row items-center justify-between gap-4">
              <Text className="min-w-0 flex-1 text-xs leading-normal text-foreground-muted">
                Only your question and attached context are shared. 1,000–2,000 tokens suggested.
              </Text>
              <ControlPill
                icon="arrow.up"
                label="Send"
                accessibilityLabel={`Send message to ${props.bot.name}`}
                variant="primary"
                disabled={!ready || busy || !text.trim() || !!draftError}
                onPress={() => void sendMessage()}
              />
            </View>
          </>
        )}
        {notice ? <Text className="text-xs text-foreground-muted">{notice}</Text> : null}
      </ScrollView>
      {contextOpen && context && !intent ? (
        <CrewContextEditor
          context={context}
          sources={contextSources}
          onChange={setContext}
          onClose={() => setContextOpen(false)}
        />
      ) : null}
    </>
  );
}
