import { GrokBotIcon } from "./GrokBotIcon";
import type {
  CrewBot,
  CrewEntry,
  CrewHandoff,
  CrewSnapshot,
  EnvironmentId,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  canUseCrewReply,
  showCrewConversationTimestamp,
} from "@t3tools/client-runtime/crew-conversation";
import { useParams, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CornerDownLeftIcon,
  LinkIcon,
  RefreshCwIcon,
  SearchIcon,
  UnlinkIcon,
  UnplugIcon,
  XIcon,
} from "lucide-react";
import { Fragment, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useComposerHandleContext } from "../composerHandleContext";
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
  crewDraftSendInput,
  formatCrewReplyDraft,
  type CrewDraftScope,
} from "@t3tools/client-runtime/crew-draft";
import { crewBotSelectionKey, useCrewStore } from "../crewStore";
import { useEnvironment, usePrimaryEnvironmentId } from "../state/environments";
import { useThreadShell, useThreadVisibleTurnItems } from "../state/entities";
import { crewEnvironment } from "../state/crew";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { useAtomQueryRunner } from "../state/use-atom-query-runner";
import { buildThreadRouteParams, resolveThreadRouteRef } from "../threadRoutes";
import { Button } from "./ui/button";
import { GrokBotAvatar } from "./GrokBotAvatar";
import { GrokBotMessage } from "./GrokBotMessage";
import { CrewContextEditor } from "./CrewContextEditor";
import { estimateCrewTokens } from "@t3tools/shared/crewContext";
import { Switch } from "./ui/switch";
import { Badge } from "./ui/badge";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "./ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./ui/empty";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { InputGroup, InputGroupAddon } from "./ui/input-group";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "./ui/popover";
import { ScrollArea } from "./ui/scroll-area";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./ui/select";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { cn } from "../lib/utils";

function commandError(result: {
  readonly cause: Parameters<typeof squashAtomCommandFailure>[0]["cause"];
}): string {
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : "The Grok Bot request failed.";
}

export function CrewPanel() {
  const open = useCrewStore((state) => state.open);
  const chatOpen = useCrewStore((state) => state.chatOpen);
  const params = useParams({ strict: false });
  const routeRef = resolveThreadRouteRef(params);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const askOrigin = useCrewStore((state) => state.askOrigin);
  const environmentId = askOrigin?.environmentId ?? routeRef?.environmentId ?? primaryEnvironmentId;
  const environment = useEnvironment(environmentId);
  if (!open) return null;
  const supported = environment?.serverConfig?.environment.capabilities.crew === true;
  const unavailableMessage = environment?.serverConfig
    ? "Update this environment’s T3 server to connect your bots."
    : "Connect to a T3 environment to use Grok Bot.";

  return (
    <aside
      aria-label="Grok Bot"
      data-crew-panel=""
      className={cn(
        "relative flex min-h-0 shrink-0 bg-background pt-[calc(var(--workspace-controls-top)+var(--workspace-topbar-height))]",
        chatOpen &&
          "before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-border",
      )}
    >
      {environmentId && supported ? (
        <ConnectedCrewPanel
          key={environmentId}
          environmentId={environmentId}
          environmentLabel={environment?.label ?? "this environment"}
          routeRef={routeRef}
        />
      ) : (
        <>
          {chatOpen ? (
            <CrewChatShell>
              <CrewUnavailableChat title="Grok Bot unavailable" description={unavailableMessage} />
            </CrewChatShell>
          ) : null}
          <div className="flex w-(--crew-rail-width) flex-col items-center border-l border-border px-1.5 py-2">
            <Button size="icon-xl" variant="ghost-muted" disabled aria-label="Search bots">
              <SearchIcon />
            </Button>
            <div className="flex-1" />
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    size="icon-xl"
                    variant="ghost-muted"
                    aria-label="Grok Bot unavailable"
                    title="Grok Bot unavailable"
                  />
                }
              >
                <GrokBotIcon />
                <CrewConnectionDot status="disconnected" />
              </PopoverTrigger>
              <PopoverPopup side="left" align="end" className="w-72">
                <PopoverTitle className="text-sm">Grok Bot unavailable</PopoverTitle>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {unavailableMessage}
                </p>
              </PopoverPopup>
            </Popover>
          </div>
        </>
      )}
    </aside>
  );
}

function CrewChatShell({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="Grok Bot chat"
      data-crew-chat=""
      className="flex min-h-0 w-(--crew-chat-width) min-w-0 shrink-0 flex-col border-l border-border bg-background"
    >
      {children}
    </section>
  );
}

function CloseCrewChatButton() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost-muted"
            aria-label="Close bot chat"
            onClick={() => useCrewStore.getState().collapseChat()}
          />
        }
      >
        <XIcon className="size-3.5" />
      </TooltipTrigger>
      <TooltipPopup>Close bot chat</TooltipPopup>
    </Tooltip>
  );
}

function CrewUnavailableChat({ title, description }: { title: string; description: string }) {
  return (
    <>
      <div className="flex min-h-14 items-center justify-between gap-2 border-b border-border/60 px-3">
        <h3 className="truncate text-sm font-medium">{title}</h3>
        <CloseCrewChatButton />
      </div>
      <Empty className="gap-4 p-6 md:p-6">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GrokBotIcon className="size-6" />
          </EmptyMedia>
          <EmptyDescription className="text-xs leading-relaxed">{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </>
  );
}

function CrewConnectionDot({
  status,
  inline = false,
}: {
  status: CrewSnapshot["connection"]["status"];
  inline?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-full ring-2 ring-background",
        !inline && "absolute right-1 bottom-1",
        status === "connected"
          ? "bg-success"
          : status === "error"
            ? "bg-destructive"
            : status === "connecting"
              ? "bg-warning"
              : "bg-muted-foreground/60",
      )}
    />
  );
}

function ConnectedCrewPanel({
  environmentId,
  environmentLabel,
  routeRef,
}: {
  environmentId: EnvironmentId;
  environmentLabel: string;
  routeRef: ScopedThreadRef | null;
}) {
  const snapshotQuery = useEnvironmentQuery(
    crewEnvironment.snapshot({ environmentId, input: undefined }),
  );
  const connect = useAtomCommand(crewEnvironment.connect, { reportFailure: false });
  const disconnect = useAtomCommand(crewEnvironment.disconnect, { reportFailure: false });
  const chatOpen = useCrewStore((state) => state.chatOpen);
  const snapshot = snapshotQuery.data;
  const activeAccountScope = snapshot?.connection.accountScope ?? "";
  const selectionKey = crewBotSelectionKey(environmentId, activeAccountScope);
  const selectedBotId = useCrewStore((state) => state.selectedBotByAccount[selectionKey]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountScope, setAccountScope] = useState("");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const connected = snapshot?.connection.status === "connected";
  const bot = snapshot?.bots.find((item) => item.id === selectedBotId) ?? null;
  const accountScopes = snapshot?.connection.availableAccountScopes ?? [];
  const connectionError = error ?? snapshotQuery.error ?? snapshot?.connection.error;
  const connectionStatus = snapshot?.connection.status ?? "disconnected";
  const statusLabel =
    snapshotQuery.isPending && !snapshot
      ? "Loading…"
      : connectionStatus === "connected"
        ? "Connected"
        : connectionStatus === "connecting"
          ? "Connecting…"
          : connectionError
            ? "Connection error"
            : "Disconnected";
  const filteredBots =
    snapshot?.bots.filter((item) =>
      item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
    ) ?? [];
  const attentionBotIds = new Set(
    snapshot?.handoffs
      .filter(
        (handoff) =>
          handoff.accountScope === activeAccountScope &&
          (handoff.acceptance === "uncertain" ||
            handoff.delegation?.delivery.status === "uncertain" ||
            handoff.delegation?.delivery.status === "failed" ||
            (handoff.delegation?.correlation === "needs_attention" &&
              handoff.delegation.delivery.status !== "stopped" &&
              handoff.delegation.delivery.status !== "delivered")),
      )
      .map((handoff) => handoff.botId),
  );

  async function changeConnection() {
    setBusy(true);
    setError(null);
    const result = connected
      ? await disconnect({ environmentId, input: undefined })
      : await connect({
          environmentId,
          input: accountScope.trim() ? { accountScope: accountScope.trim() } : {},
        });
    if (result._tag === "Failure") setError(commandError(result));
    snapshotQuery.refresh();
    setBusy(false);
  }

  function selectBot(item: CrewBot, toggle: boolean) {
    if (toggle && chatOpen && selectedBotId === item.id) {
      useCrewStore.getState().collapseChat();
    } else {
      useCrewStore.getState().selectBot(environmentId, activeAccountScope, item.id);
    }
    setSearchOpen(false);
  }

  return (
    <>
      {chatOpen ? (
        <CrewChatShell>
          {connected && snapshot && bot && !bot.unavailableReason ? (
            <CrewConversationView
              key={JSON.stringify([activeAccountScope, bot.id, bot.sessionId])}
              environmentId={environmentId}
              routeRef={routeRef}
              bot={bot}
              snapshot={snapshot}
              refreshSnapshot={snapshotQuery.refresh}
            />
          ) : (
            <CrewUnavailableChat
              title={bot?.name ?? (connected ? "Choose a bot" : "Grok Bot disconnected")}
              description={
                bot?.unavailableReason
                  ? `${bot.unavailableReason} Continue in the Grok Bot app.`
                  : connected
                    ? "Select a bot from the rail to open its conversation."
                    : "Use the connection button at the bottom of the rail to reconnect your bots."
              }
            />
          )}
        </CrewChatShell>
      ) : null}
      <nav
        aria-label="Grok Bot bots"
        data-crew-rail=""
        className="relative flex w-(--crew-rail-width) min-h-0 shrink-0 flex-col items-center border-l border-border bg-background py-2"
      >
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <Tooltip>
            <TooltipTrigger
              render={
                <PopoverTrigger
                  render={
                    <Button
                      size="icon-xl"
                      variant="ghost-muted"
                      aria-label="Search bots"
                      disabled={!connected}
                    />
                  }
                />
              }
            >
              <SearchIcon />
            </TooltipTrigger>
            <TooltipPopup side="left">Search bots</TooltipPopup>
          </Tooltip>
          <PopoverPopup side="left" align="start" sideOffset={8} className="w-80" padding="none">
            <div className="space-y-2 border-b border-border/60 p-3">
              <PopoverTitle className="text-xs font-medium text-muted-foreground">
                Bots and groups{" "}
                <span className="ml-1 text-muted-foreground/60">{snapshot?.bots.length}</span>
              </PopoverTitle>
              <Input
                size="compact"
                type="search"
                aria-label="Search bots and groups"
                placeholder="Search bots…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <ScrollArea className="max-h-[min(24rem,60vh)]">
              <div className="space-y-0.5 p-1.5">
                {filteredBots.map((item) => (
                  <Button
                    key={item.id}
                    variant="ghost"
                    className="h-auto w-full justify-start gap-2.5 rounded-md px-2 py-2 text-left sm:h-auto"
                    onClick={() => selectBot(item, false)}
                  >
                    <GrokBotAvatar
                      bot={item}
                      roster={snapshot?.bots}
                      environmentId={environmentId}
                      accountScope={activeAccountScope}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.name}</span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        {item.isGroup ? `${item.memberIds.length} members` : "Bot"}
                      </span>
                    </span>
                    {item.unavailableReason ? (
                      <Badge variant="secondary" size="sm">
                        App only
                      </Badge>
                    ) : null}
                    <ChevronRightIcon className="size-3.5 text-muted-foreground/60" />
                  </Button>
                ))}
                {filteredBots.length === 0 ? (
                  <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                    {search.trim()
                      ? `No bots match “${search}”.`
                      : "Create a bot in Grok Bot, then refresh."}
                  </p>
                ) : null}
              </div>
            </ScrollArea>
          </PopoverPopup>
        </Popover>
        <ScrollArea className="mt-2 min-h-0 w-full flex-1">
          <div className="flex flex-col items-center gap-1.5 py-1">
            {connected
              ? snapshot?.bots.map((item) => {
                  const selected = chatOpen && selectedBotId === item.id;
                  const needsAttention = attentionBotIds.has(item.id);
                  return (
                    <Tooltip key={item.id}>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-xl"
                            className={cn(
                              "relative size-11 rounded-xl p-1 sm:size-11",
                              selected && "bg-accent ring-1 ring-border",
                            )}
                            aria-label={`${item.name}${item.isGroup ? ", group" : ""}${needsAttention ? ", delivery needs attention" : ""}`}
                            aria-pressed={selected}
                            onClick={() => selectBot(item, true)}
                          />
                        }
                      >
                        <GrokBotAvatar
                          bot={item}
                          roster={snapshot?.bots}
                          environmentId={environmentId}
                          accountScope={activeAccountScope}
                          size={34}
                        />
                        {needsAttention ? (
                          <span
                            aria-hidden="true"
                            className="absolute right-0.5 bottom-0.5 size-2 rounded-full bg-warning ring-2 ring-background"
                          />
                        ) : null}
                      </TooltipTrigger>
                      <TooltipPopup side="left" sideOffset={8}>
                        {item.name}
                        {item.isGroup ? " · Group" : ""}
                        {item.unavailableReason ? " · App only" : ""}
                        {needsAttention ? " · Delivery needs attention" : ""}
                      </TooltipPopup>
                    </Tooltip>
                  );
                })
              : null}
            {connected && snapshot?.bots.length === 0 ? (
              <span className="px-1 pt-3 text-center text-[10px] leading-relaxed text-muted-foreground">
                No bots yet
              </span>
            ) : null}
          </div>
        </ScrollArea>
        <div className="mt-2 flex shrink-0 flex-col items-center border-t border-border/60 pt-2">
          <Popover>
            <Tooltip>
              <TooltipTrigger
                render={
                  <PopoverTrigger
                    render={
                      <Button
                        size="icon-xl"
                        variant="ghost-muted"
                        className="h-auto flex-col gap-0.5 px-1 py-1 sm:h-auto"
                        aria-label={`Grok Bot connection: ${statusLabel}`}
                      />
                    }
                  />
                }
              >
                <span className="relative flex size-7 items-center justify-center">
                  <GrokBotIcon />
                  <CrewConnectionDot status={connectionError ? "error" : connectionStatus} />
                </span>
                {!connected ? <span className="text-[10px] font-normal">Connect</span> : null}
              </TooltipTrigger>
              <TooltipPopup side="left">
                {statusLabel} · {environmentLabel}
              </TooltipPopup>
            </Tooltip>
            <PopoverPopup side="left" align="end" sideOffset={8} className="w-80">
              <div className="space-y-4">
                <div>
                  <PopoverTitle className="text-sm">Grok Bot</PopoverTitle>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{environmentLabel}</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <CrewConnectionDot status={connectionError ? "error" : connectionStatus} inline />
                  <span className="flex-1">{statusLabel}</span>
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label="Refresh Grok Bot"
                    title="Refresh bots and connection"
                    onClick={snapshotQuery.refresh}
                    disabled={busy}
                  >
                    <RefreshCwIcon />
                  </Button>
                </div>
                {connected ? (
                  <div className="space-y-1 text-xs">
                    <p className="text-muted-foreground">Connected account</p>
                    <p className="select-text break-all">{activeAccountScope}</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Connect the Grok Bot account saved on {environmentLabel} to see your bots.
                    </p>
                    {accountScopes.length > 0 ? (
                      <Select
                        value={accountScope}
                        onValueChange={(value) => setAccountScope(value ?? "")}
                        disabled={busy}
                      >
                        <SelectTrigger size="sm" className="w-full" aria-label="Grok Bot account">
                          <SelectValue>{accountScope || "Saved account"}</SelectValue>
                        </SelectTrigger>
                        <SelectPopup>
                          <SelectItem value="">Saved account</SelectItem>
                          {accountScopes.map((scope) => (
                            <SelectItem key={scope} value={scope}>
                              {scope}
                            </SelectItem>
                          ))}
                        </SelectPopup>
                      </Select>
                    ) : (
                      <Collapsible>
                        <CollapsibleTrigger
                          render={
                            <Button
                              size="sm"
                              variant="ghost-muted"
                              className="group w-full justify-start"
                            />
                          }
                        >
                          Choose another account
                          <ChevronDownIcon className="ml-auto size-3 transition-transform group-data-panel-open:rotate-180" />
                        </CollapsibleTrigger>
                        <CollapsiblePanel>
                          <div className="space-y-1.5 pt-2">
                            <Input
                              size="sm"
                              aria-label="Grok Bot account"
                              value={accountScope}
                              maxLength={256}
                              disabled={busy}
                              onChange={(event) => setAccountScope(event.target.value)}
                              placeholder="Account ID (optional)"
                            />
                            <p className="text-xs text-muted-foreground">
                              Leave blank to use your saved account.
                            </p>
                          </div>
                        </CollapsiblePanel>
                      </Collapsible>
                    )}
                  </>
                )}
                {connectionError ? (
                  <p role="alert" className="text-xs text-destructive">
                    {connectionError}
                  </p>
                ) : null}
                <Button
                  className="w-full"
                  variant={connected ? "outline" : "default"}
                  size="sm"
                  disabled={
                    busy ||
                    snapshotQuery.isPending ||
                    !snapshot ||
                    connectionStatus === "connecting"
                  }
                  onClick={() => void changeConnection()}
                >
                  {connected ? <UnplugIcon /> : <GrokBotIcon />}
                  {busy
                    ? connected
                      ? "Disconnecting…"
                      : "Connecting…"
                    : connected
                      ? "Disconnect"
                      : "Connect Grok Bot"}
                </Button>
              </div>
            </PopoverPopup>
          </Popover>
        </div>
      </nav>
    </>
  );
}

function CrewConversationView({
  environmentId,
  routeRef,
  bot,
  snapshot,
  refreshSnapshot,
}: {
  environmentId: EnvironmentId;
  routeRef: ScopedThreadRef | null;
  bot: CrewBot;
  snapshot: CrewSnapshot;
  refreshSnapshot: () => void;
}) {
  const connected = snapshot.connection.status === "connected";
  const input = {
    botId: bot.id,
    ...(snapshot.connection.accountScope ? { accountScope: snapshot.connection.accountScope } : {}),
    ...(bot.sessionId ? { sessionId: bot.sessionId } : {}),
  };
  const conversationQuery = useEnvironmentQuery(
    crewEnvironment.conversation({ environmentId, input }),
  );
  const loadConversation = useAtomQueryRunner(crewEnvironment.conversation, {
    reportFailure: false,
    refresh: true,
  });
  const send = useAtomCommand(crewEnvironment.send, { reportFailure: false, reportDefect: false });
  const stopDelivery = useAtomCommand(crewEnvironment.stopDelivery, { reportFailure: false });
  const composerRef = useComposerHandleContext();
  const navigate = useNavigate();
  const [olderEntries, setOlderEntries] = useState<ReadonlyArray<CrewEntry>>([]);
  const [olderCursor, setOlderCursor] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const conversationScrollRef = useRef<HTMLDivElement>(null);
  const followRepliesRef = useRef(true);
  const prependScrollRef = useRef<{ height: number; top: number } | null>(null);
  const conversation = conversationQuery.data;
  const scope: CrewDraftScope | null = conversation
    ? {
        environmentId,
        accountScope: conversation.accountScope,
        botId: conversation.botId,
        sessionId: conversation.sessionId,
      }
    : null;
  const scopeKey = scope ? crewDraftKey(scope) : null;
  const draft = useCrewStore((state) => (scopeKey ? state.drafts[scopeKey] : undefined));
  const askOrigin = useCrewStore((state) => state.askOrigin);
  const currentThread = useThreadShell(routeRef);
  const currentOrigin =
    currentThread && routeRef?.environmentId === environmentId
      ? { environmentId, threadId: routeRef.threadId, title: currentThread.title }
      : null;
  const origin = draft
    ? draft.origin
    : askOrigin?.environmentId === environmentId
      ? askOrigin
      : null;
  const handoffs = snapshot.handoffs.filter(
    (handoff) =>
      handoff.botId === bot.id &&
      (!scope ||
        (handoff.sessionId === scope.sessionId && handoff.accountScope === scope.accountScope)),
  );
  const sourceRef = useMemo(
    () => (origin ? { environmentId: origin.environmentId, threadId: origin.threadId } : null),
    [origin?.environmentId, origin?.threadId],
  );
  const sourceTurnItems = useThreadVisibleTurnItems(sourceRef);
  const contextSources = useMemo(
    () => crewTaskContextSources(sourceRef ? crewTaskContextThread(sourceTurnItems) : null),
    [sourceRef, sourceTurnItems],
  );
  const draftError = draft?.text.trim() ? crewDraftValidationError(draft) : null;
  const receipt = handoffs.find((handoff) => handoff.nonce === draft?.nonce);
  const canStartNew = receipt?.acceptance === "accepted" || receipt?.acceptance === "rejected";
  const entries = [
    ...new Map(
      [...olderEntries, ...(conversation?.entries ?? [])].map((entry) => [entry.id, entry]),
    ).values(),
  ];
  const nextCursor = olderCursor === undefined ? conversation?.nextBeforeSeq : olderCursor;

  useLayoutEffect(() => {
    if (!conversation?.entries && olderEntries.length === 0) return;
    const viewport = conversationScrollRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (!viewport) return;
    // Keep older-history reads in place; follow new replies only while already at the end.
    const prepend = prependScrollRef.current;
    if (prepend) {
      viewport.scrollTop = prepend.top + viewport.scrollHeight - prepend.height;
      prependScrollRef.current = null;
    } else if (followRepliesRef.current) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [conversation?.entries, olderEntries]);

  async function loadOlder() {
    if (nextCursor === null || nextCursor === undefined || loadingOlder) return;
    setLoadingOlder(true);
    const result = await loadConversation({
      environmentId,
      input: {
        ...input,
        ...(scope ? { sessionId: scope.sessionId, accountScope: scope.accountScope } : {}),
        beforeSeq: nextCursor,
      },
    });
    if (result._tag === "Success") {
      const viewport = conversationScrollRef.current?.querySelector<HTMLElement>(
        '[data-slot="scroll-area-viewport"]',
      );
      if (viewport) {
        prependScrollRef.current = { height: viewport.scrollHeight, top: viewport.scrollTop };
      }
      setOlderEntries((previous) => [...result.value.entries, ...previous]);
      setOlderCursor(result.value.nextBeforeSeq);
    } else setNotice(commandError(result));
    setLoadingOlder(false);
  }

  async function sendMessage() {
    if (!scope || !draft || !connected || busy) return;
    const currentDraft = useCrewStore.getState().drafts[crewDraftKey(scope)];
    if (!currentDraft) return;
    const request = crewDraftSendInput(scope, currentDraft);
    if (!request) return;
    // Persist before crossing the wire. Reopening the panel never repeats a send.
    useCrewStore.getState().markAttempted(scope);
    setBusy(true);
    setNotice(null);
    const result = await send({ environmentId, input: request });
    if (result._tag === "Failure") {
      const error = squashAtomCommandFailure(result);
      const failure = classifyCrewSendFailure(error);
      useCrewStore.getState().recoverRejectedDraft(scope, request.nonce, error);
      setNotice(
        failure.disposition === "rejected"
          ? `${failure.message} Your draft is available to edit.`
          : `${failure.message} Delivery could not be confirmed. Refresh the conversation and check its receipt before composing another message.`,
      );
    }
    refreshSnapshot();
    conversationQuery.refresh();
    setBusy(false);
  }

  function unlinkTask() {
    if (!scope || busy || (draft?.attempted && !canStartNew)) return;
    const store = useCrewStore.getState();
    if (draft?.attempted) store.clearDraft(scope);
    store.unlinkDraft(scope);
    setNotice(
      draft?.attempted
        ? "New messages are unlinked. Sent messages keep their originating task."
        : "Question kept. Attached task context removed and automatic delivery disabled.",
    );
  }

  async function stopAutomaticDelivery(handoff: CrewHandoff) {
    const result = await stopDelivery({
      environmentId,
      input: { accountScope: handoff.accountScope, handoffId: handoff.id },
    });
    setNotice(
      result._tag === "Failure"
        ? commandError(result)
        : "Future delivery stopped. This does not cancel the bot or coding work already started.",
    );
    refreshSnapshot();
  }

  function useReply(entry: CrewEntry, handoff?: CrewHandoff) {
    if (!scope || !routeRef || routeRef.environmentId !== environmentId) return;
    if (handoff?.originThreadId && handoff.originThreadId !== routeRef.threadId) return;
    const inserted = composerRef?.current?.insertTextAtEnd(
      formatCrewReplyDraft(scope, bot.name, entry, handoff?.id),
      { ensureLeadingBoundary: true },
    );
    setNotice(
      inserted
        ? "Reply added to the coding task draft. Review it before sending."
        : "Open the coding task composer to use this reply.",
    );
  }

  function replyActions(entry: CrewEntry, handoff?: CrewHandoff) {
    if (!canUseCrewReply(entry)) return null;
    const originElsewhere =
      handoff?.originThreadId &&
      (routeRef?.threadId !== handoff.originThreadId || routeRef.environmentId !== environmentId);
    return originElsewhere ? (
      <Button
        size="sm"
        variant="ghost"
        onClick={() =>
          void navigate({
            to: "/$environmentId/$threadId",
            params: buildThreadRouteParams({ environmentId, threadId: handoff.originThreadId! }),
          })
        }
      >
        Open originating task
      </Button>
    ) : routeRef?.environmentId === environmentId ? (
      <Button size="xs" variant="ghost-muted" onClick={() => useReply(entry, handoff)}>
        <CornerDownLeftIcon className="size-3" /> Use this reply
      </Button>
    ) : null;
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-2 py-2">
        <GrokBotAvatar
          bot={bot}
          roster={snapshot.bots}
          environmentId={environmentId}
          accountScope={snapshot.connection.accountScope}
          size={36}
          animated
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium">{bot.name}</h3>
          <Tooltip>
            <TooltipTrigger render={<p className="truncate text-xs text-muted-foreground" />}>
              {bot.isGroup ? `Group · ${bot.memberIds.length} members` : "Bot conversation"}
            </TooltipTrigger>
            <TooltipPopup>
              Session: {(scope?.sessionId ?? bot.sessionId ?? "Loading") || "Default"}
            </TooltipPopup>
          </Tooltip>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Refresh conversation"
          title="Refresh conversation"
          onClick={() => {
            conversationQuery.refresh();
            refreshSnapshot();
          }}
        >
          <RefreshCwIcon className="size-3.5" />
        </Button>
        <CloseCrewChatButton />
      </div>
      <ScrollArea
        ref={conversationScrollRef}
        className="min-h-0 flex-1"
        onScrollCapture={(event) => {
          const viewport = event.target;
          if (
            !(viewport instanceof HTMLElement) ||
            viewport.dataset.slot !== "scroll-area-viewport"
          )
            return;
          followRepliesRef.current =
            viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 24;
        }}
      >
        <div className="space-y-3 px-3 py-4">
          {handoffs.some((handoff) => handoff.originThreadId) ? (
            <Collapsible>
              <CollapsibleTrigger
                render={
                  <Button size="sm" variant="ghost-muted" className="group w-full justify-start" />
                }
              >
                <LinkIcon className="size-3.5" />
                Task delegations
                <Badge variant="secondary" size="sm">
                  {handoffs.filter((handoff) => handoff.originThreadId).length}
                </Badge>
                <ChevronDownIcon className="ml-auto size-3 transition-transform group-data-panel-open:rotate-180" />
              </CollapsibleTrigger>
              <CollapsiblePanel>
                <div className="space-y-3 pt-2">
                  {handoffs
                    .filter((handoff) => handoff.originThreadId)
                    .slice(-10)
                    .toReversed()
                    .map((handoff) => (
                      <div
                        key={handoff.id}
                        className="space-y-1 border-t border-border pt-2 text-xs"
                      >
                        <p className="font-medium">
                          {crewHandoffStatus(handoff)} · {handoff.replies.length} replies
                        </p>
                        {handoff.delegation?.delivery.error ? (
                          <p className="text-destructive">{handoff.delegation.delivery.error}</p>
                        ) : null}
                        {canStopCrewDelivery(handoff) ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => void stopAutomaticDelivery(handoff)}
                          >
                            Stop automatic delivery
                          </Button>
                        ) : null}
                        <Collapsible>
                          <CollapsibleTrigger
                            render={<Button type="button" size="xs" variant="ghost-muted" />}
                          >
                            View sent context
                          </CollapsibleTrigger>
                          <CollapsiblePanel>
                            <p className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-2">
                              {handoff.wireText ?? handoff.text}
                            </p>
                          </CollapsiblePanel>
                        </Collapsible>
                        <p className="line-clamp-2 text-muted-foreground">{handoff.text}</p>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void navigate({
                              to: "/$environmentId/$threadId",
                              params: { environmentId, threadId: handoff.originThreadId! },
                            })
                          }
                        >
                          Open originating task
                        </Button>
                        {handoff.replies.map((reply) => (
                          <GrokBotMessage
                            key={reply.id}
                            entry={reply}
                            bot={bot}
                            bots={snapshot.bots}
                            environmentId={environmentId}
                            accountScope={snapshot.connection.accountScope}
                            actions={replyActions(reply, handoff)}
                          />
                        ))}
                      </div>
                    ))}
                </div>
              </CollapsiblePanel>
            </Collapsible>
          ) : null}
          {nextCursor !== null && nextCursor !== undefined ? (
            <Button
              className="w-full"
              size="sm"
              variant="ghost"
              disabled={loadingOlder}
              onClick={() => void loadOlder()}
            >
              {loadingOlder ? "Loading…" : "Load older messages"}
            </Button>
          ) : null}
          {conversationQuery.error ? (
            <p role="alert" className="text-xs text-destructive">
              {conversationQuery.error}
            </p>
          ) : null}
          {entries.map((entry, index) => {
            const handoff = handoffs.find((item) =>
              item.replies.some((reply) => reply.id === entry.id),
            );
            return (
              <Fragment key={entry.id}>
                {showCrewConversationTimestamp(entry, entries[index - 1]) ? (
                  <time
                    dateTime={entry.createdAt!}
                    className="block py-2 text-center text-[11px] text-muted-foreground"
                  >
                    {new Date(entry.createdAt!).toLocaleString([], {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                ) : null}
                <GrokBotMessage
                  entry={entry}
                  bot={bot}
                  bots={snapshot.bots}
                  environmentId={environmentId}
                  accountScope={snapshot.connection.accountScope}
                  actions={replyActions(entry, handoff)}
                />
              </Fragment>
            );
          })}
          {conversationQuery.isPending && entries.length === 0 ? (
            <p role="status" className="py-8 text-center text-xs text-muted-foreground">
              Loading conversation…
            </p>
          ) : null}
          {!conversationQuery.isPending && !conversationQuery.error && entries.length === 0 ? (
            <Empty className="gap-3 px-3 py-10 md:p-3 md:py-10">
              <EmptyHeader>
                <EmptyTitle className="text-sm font-medium">Start a conversation</EmptyTitle>
                <EmptyDescription className="text-xs">
                  Send {bot.name} a question or share context from your task.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </div>
      </ScrollArea>
      <form
        className="max-h-[50%] shrink-0 space-y-2 overflow-y-auto border-t border-border/60 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage();
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {origin ? (
            <>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground" />
                  }
                >
                  <LinkIcon className="size-3 shrink-0" />
                  <span className="truncate">
                    {draft?.attempted ? "Originating task: " : "Linked to: "}
                    {origin.title}
                  </span>
                </TooltipTrigger>
                <TooltipPopup>
                  {draft?.attempted ? "Originating task" : "Linked to task"}: {origin.title}
                </TooltipPopup>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost-muted"
                      aria-label="Unlink from task"
                      disabled={!scope || busy || (draft?.attempted && !canStartNew)}
                      onClick={unlinkTask}
                    />
                  }
                >
                  <UnlinkIcon />
                </TooltipTrigger>
                <TooltipPopup>
                  {draft?.attempted
                    ? canStartNew
                      ? "Unlink from task and start a new message"
                      : "Check delivery before starting an unlinked message"
                    : "Unlink from task"}
                </TooltipPopup>
              </Tooltip>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Direct message</p>
          )}
        </div>
        {scope &&
        !draft?.attempted &&
        currentOrigin &&
        origin?.threadId !== currentOrigin.threadId ? (
          <Button
            type="button"
            size="xs"
            variant="ghost-muted"
            className="max-w-full"
            onClick={() => {
              useCrewStore.getState().linkDraft(scope, currentOrigin);
              setNotice(
                draft?.context
                  ? "Linked task changed. Question kept; attached context removed and automatic delivery disabled."
                  : null,
              );
            }}
          >
            <LinkIcon />
            <span className="truncate">Link to {currentOrigin.title}</span>
          </Button>
        ) : null}
        {origin && scope && !draft?.attempted ? (
          <div className="space-y-2">
            <label className="flex items-center justify-between gap-2 text-xs">
              <span>Return reply to coding agent</span>
              <Switch
                size="sm"
                checked={draft?.automaticDelivery ?? false}
                disabled={busy}
                onCheckedChange={(automaticDelivery) =>
                  useCrewStore.getState().updateDraftOptions(scope, { automaticDelivery })
                }
              />
            </label>
            {draft?.automaticDelivery ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                The reply can continue this task when the agent is available. You can stop automatic
                delivery after sending.
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                size="xs"
                variant="ghost-muted"
                disabled={busy}
                onClick={() =>
                  useCrewStore
                    .getState()
                    .updateDraftOptions(scope, { context: draft?.context ? null : {} })
                }
              >
                {draft?.context ? "Remove task context" : "Attach task context"}
              </Button>
              {draft?.context ? (
                <span className="text-[11px] text-muted-foreground">
                  {draft.context.evidence?.length ?? 0} excerpts
                </span>
              ) : null}
            </div>
            {draft?.context ? (
              <CrewContextEditor
                context={draft.context}
                sources={contextSources}
                disabled={busy}
                onChange={(context) =>
                  useCrewStore.getState().updateDraftOptions(scope, { context })
                }
              />
            ) : null}
          </div>
        ) : null}
        <InputGroup className="rounded-2xl bg-muted/20 **:data-[slot=textarea]:max-h-44 **:data-[slot=textarea]:text-sm">
          <Textarea
            unstyled
            aria-label={origin ? "Question and selected task context for bot" : "Message to bot"}
            placeholder={origin ? `Ask ${bot.name} and add context…` : `Message ${bot.name}…`}
            value={draft?.text ?? ""}
            maxLength={32000}
            disabled={!scope || draft?.attempted}
            onChange={(event) => {
              if (scope) useCrewStore.getState().editDraft(scope, event.target.value);
            }}
          />
          <InputGroupAddon align="block-end" className="gap-2 px-2 pb-2">
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              To {bot.name}
            </span>
            {scope && !draft?.attempted && draft?.text ? (
              <Button
                type="button"
                size="xs"
                variant="ghost-muted"
                onClick={() => {
                  useCrewStore.getState().clearDraft(scope);
                  setNotice(null);
                }}
              >
                Clear
              </Button>
            ) : null}
            {scope && draft?.attempted && canStartNew ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  useCrewStore.getState().clearDraft(scope);
                  setNotice(null);
                }}
              >
                New message
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="submit"
                      size="icon-sm"
                      className="rounded-full"
                      aria-label={`Send to ${bot.name}`}
                      disabled={
                        !connected ||
                        !scope ||
                        !draft?.text.trim() ||
                        draft.attempted ||
                        !!draftError ||
                        busy
                      }
                    />
                  }
                >
                  <ArrowUpIcon />
                </TooltipTrigger>
                <TooltipPopup>Send to {bot.name}</TooltipPopup>
              </Tooltip>
            )}
          </InputGroupAddon>
        </InputGroup>
        {draft && !draft.attempted && (draft.text || draft.context) ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>
                ~{estimateCrewTokens(crewDraftBudgetText(draft)).toLocaleString()} tokens ·
                1,000–2,000 suggested
              </span>
              <Select
                value={String(draft.contextTokenBudget ?? 2000)}
                onValueChange={(value) => {
                  if (scope && value)
                    useCrewStore
                      .getState()
                      .updateDraftOptions(scope, { contextTokenBudget: Number(value) });
                }}
              >
                <SelectTrigger size="sm" aria-label="Message token budget" className="w-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {[1000, 2000, 4000].map((budget) => (
                    <SelectItem key={budget} value={String(budget)}>
                      {budget.toLocaleString()} limit
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
            {draftError ? (
              <p role="alert" className="text-xs text-destructive">
                {draftError}
              </p>
            ) : null}
            <Collapsible>
              <CollapsibleTrigger
                render={<Button type="button" size="xs" variant="ghost-muted" className="group" />}
              >
                Preview outgoing message
                <ChevronDownIcon className="size-3 group-data-panel-open:rotate-180" />
              </CollapsibleTrigger>
              <CollapsiblePanel>
                <p className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 text-xs">
                  {crewDraftPreview(draft)}
                </p>
                {draft.automaticDelivery ? (
                  <p className="pt-1 text-[11px] text-muted-foreground">
                    A reply reference and routing instruction are added when sent. The estimate
                    includes them; the full sent message is available in delivery details.
                  </p>
                ) : null}
              </CollapsiblePanel>
            </Collapsible>
          </div>
        ) : null}
        {draft?.attempted ? (
          <div className="space-y-1">
            <p role="status" className="text-xs text-muted-foreground">
              {busy
                ? "Sending…"
                : receipt
                  ? crewHandoffStatus(receipt)
                  : "Delivery unconfirmed. This message will not be resent."}
            </p>
            {receipt && canStopCrewDelivery(receipt) ? (
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => void stopAutomaticDelivery(receipt)}
              >
                Stop automatic delivery
              </Button>
            ) : null}
            {receipt?.delegation?.delivery.error ? (
              <p className="text-xs text-destructive">{receipt.delegation.delivery.error}</p>
            ) : null}
            <Collapsible>
              <CollapsibleTrigger
                render={<Button size="xs" variant="ghost-muted" className="group -ml-1" />}
              >
                Delivery details
                <ChevronDownIcon className="size-3 transition-transform group-data-panel-open:rotate-180" />
              </CollapsibleTrigger>
              <CollapsiblePanel>
                <p className="select-all break-all py-1 text-xs text-muted-foreground">
                  Receipt ID: {draft.nonce}
                </p>
                <p className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 text-xs">
                  {receipt?.wireText ?? crewDraftPreview(draft)}
                </p>
              </CollapsiblePanel>
            </Collapsible>
          </div>
        ) : (
          <p className="px-1 text-[11px] text-muted-foreground">
            Only your question and attached context are shared. File contents and full task history
            are not included automatically.
          </p>
        )}
        {notice ? (
          <p role="status" className="text-xs text-muted-foreground">
            {notice}
          </p>
        ) : null}
      </form>
    </>
  );
}
