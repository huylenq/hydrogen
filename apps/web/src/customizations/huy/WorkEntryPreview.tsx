import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { observeVisibleAnimation } from "../../lib/visibleAnimation";
import { workEntryDisplayIndicatesToolFailure, type WorkLogEntry } from "../../session-logic";
import {
  ActivityShimmerOverlay,
  failedToolIconClassName,
  ToolActivityIconView,
  toolIconAcceptsTint,
  workEntryIconName,
  type WorkEntryIconName,
} from "../../components/chat/MessagesTimeline";
import { workEntryDisplayLabel } from "../../components/chat/MessagesTimeline.logic";

// Flow preview rows draw icons through the chat's `ToolActivityIconView`, so a
// parent must provide `ToolActivityIconCtx`.

const PREVIEW_ROW_CLASS = "flex min-w-0 items-center gap-1.5 py-0.5 text-xs leading-relaxed";

function PreviewIcon({
  className,
  failed = false,
  ...icon
}: Parameters<typeof ToolActivityIconView>[0] & { failed?: boolean }) {
  return (
    <span
      className="flex size-4 shrink-0 items-center justify-center"
      role={failed ? "img" : undefined}
      aria-label={failed ? "Tool call failed" : undefined}
    >
      <ToolActivityIconView
        {...icon}
        className={cn("block size-3.5 shrink-0 stroke-2", className)}
      />
    </span>
  );
}

/** Read-only tool row for Flow session previews, drawn with the main chat's icons and labels. An `active` row shines like the chat's live tool row. */
export function WorkEntryPreview({
  entry,
  workspaceRoot,
  active = false,
}: {
  entry: WorkLogEntry;
  workspaceRoot: string | undefined;
  active?: boolean;
}) {
  const iconName = workEntryIconName(entry);
  const toolIcon = entry.toolIcon ?? entry.toolSource?.icon;
  const failed = workEntryDisplayIndicatesToolFailure(entry);
  // Same label as the main chat's settled rows, so commands show in full.
  const label = workEntryDisplayLabel(entry, workspaceRoot);
  return (
    <span
      ref={active ? observeVisibleAnimation : undefined}
      className={cn(PREVIEW_ROW_CLASS, "text-secondary-label")}
    >
      <PreviewIcon
        icon={toolIcon}
        fallbackName={iconName}
        className={failed ? failedToolIconClassName : "text-icon-muted"}
        muted
        failed={failed}
      />
      <span className={cn("min-w-0 flex-1 truncate", active && "live-tool-shine")}>{label}</span>
      {failed && !toolIconAcceptsTint(iconName, toolIcon) ? (
        <XIcon aria-hidden className={cn("size-3 shrink-0", failedToolIconClassName)} />
      ) : null}
    </span>
  );
}

export interface LiveStatus {
  label: string;
  iconName: WorkEntryIconName;
  /** Gets the main chat's sweeping highlight. */
  sweeping: boolean;
}

/** A live status row at preview size, such as "Thinking". */
export function LiveStatusPreview({ label, iconName, sweeping }: LiveStatus) {
  const content = (highlighted: boolean): ReactNode => (
    <span
      className={cn(PREVIEW_ROW_CLASS, highlighted ? "text-foreground" : "text-secondary-label")}
    >
      <PreviewIcon
        icon={undefined}
        fallbackName={iconName}
        className={highlighted ? "text-foreground" : "text-icon-muted"}
        muted={!highlighted}
      />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
  return (
    <span
      ref={sweeping ? observeVisibleAnimation : undefined}
      className="relative block w-fit max-w-full overflow-hidden"
    >
      {content(false)}
      {sweeping ? <ActivityShimmerOverlay>{content(true)}</ActivityShimmerOverlay> : null}
    </span>
  );
}
