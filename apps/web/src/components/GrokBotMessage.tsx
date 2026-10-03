import type { CrewBot, CrewEntry, EnvironmentId } from "@t3tools/contracts";
import { ChevronRightIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { cn } from "../lib/utils";
import { GrokBotMarkdown } from "./GrokBotMarkdown";
import { GrokBotAvatar } from "./GrokBotAvatar";
import { GrokBotIcon } from "./GrokBotIcon";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "./ui/collapsible";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

export function GrokBotMessage({
  entry,
  bot,
  bots,
  environmentId,
  accountScope,
  actions,
}: {
  entry: CrewEntry;
  bot: CrewBot;
  bots: readonly CrewBot[];
  environmentId: EnvironmentId;
  accountScope: string | null;
  actions?: ReactNode;
}) {
  const timestamp =
    entry.createdAt && Number.isFinite(Date.parse(entry.createdAt))
      ? new Date(entry.createdAt).toLocaleString()
      : undefined;
  const body = (
    <>
      {entry.text ? <GrokBotMarkdown text={entry.text} /> : null}
      {entry.unsupportedKind ? (
        <p className="text-xs text-muted-foreground">
          Open Grok Bot to view or act on this content.
        </p>
      ) : null}
      {entry.streaming ? (
        <p className="mt-1 text-xs text-muted-foreground">Receiving reply…</p>
      ) : null}
    </>
  );

  if (entry.interBot) {
    const peer = bots.find((item) => item.id === entry.interBot?.botId);
    return (
      <Collapsible className="py-1">
        <CollapsibleTrigger className="group mx-auto flex max-w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <span className="shrink-0">
            {entry.interBot.direction === "incoming" ? "Message from" : "Messaged"}
          </span>
          {peer ? (
            <GrokBotAvatar
              bot={peer}
              environmentId={environmentId}
              accountScope={accountScope}
              size={19}
            />
          ) : (
            <GrokBotIcon className="size-4 shrink-0" />
          )}
          <span className="truncate">{peer?.name ?? entry.interBot.botName ?? "another bot"}</span>
          <ChevronRightIcon className="size-3 shrink-0 transition-transform group-data-panel-open:rotate-90" />
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <div className="mx-2 mt-2 rounded-2xl bg-foreground/[0.065] px-3 py-2.5 text-foreground/90">
            {body}
          </div>
        </CollapsiblePanel>
      </Collapsible>
    );
  }

  if (entry.role === "system" || entry.role === "unknown") {
    return <div className="px-3 py-1 text-center text-xs text-muted-foreground">{body}</div>;
  }

  const outgoing = entry.role === "user";
  const authorBot = bots.find((item) => item.id === entry.authorBotId);
  return (
    <article
      className={cn(
        "group/crew-message relative flex min-w-0 flex-col",
        outgoing ? "items-end" : "items-start",
      )}
    >
      {bot.isGroup && !outgoing ? (
        <div className="mb-1 flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
          {authorBot ? (
            <GrokBotAvatar
              bot={authorBot}
              environmentId={environmentId}
              accountScope={accountScope}
              size={19}
            />
          ) : null}
          <span>{entry.author || authorBot?.name || bot.name}</span>
        </div>
      ) : null}
      <MessageTimestamp timestamp={timestamp}>
        <div
          className={cn(
            "relative min-w-0 rounded-[20px] px-3.5 py-2.5 text-foreground",
            outgoing ? "max-w-[85%] bg-foreground/[0.14]" : "max-w-[92%] bg-foreground/[0.065]",
          )}
        >
          {body}
          {actions ? (
            <div className="pointer-events-none absolute -top-3 right-2 z-10 flex rounded-md bg-popover p-0.5 text-popover-foreground opacity-0 shadow-sm ring-1 ring-border transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 group-hover/crew-message:pointer-events-auto group-hover/crew-message:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
              {actions}
            </div>
          ) : null}
        </div>
      </MessageTimestamp>
    </article>
  );
}

function MessageTimestamp({
  children,
  timestamp,
}: {
  children: ReactElement;
  timestamp: string | undefined;
}) {
  if (!timestamp) return children;
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipPopup>{timestamp}</TooltipPopup>
    </Tooltip>
  );
}
