import type { EnvironmentId } from "@t3tools/contracts";
import { XIcon } from "lucide-react";
import { useMemo } from "react";
import { cn } from "../../lib/utils";
import { workEntryDisplayIndicatesToolFailure, type WorkLogEntry } from "../../session-logic";
import {
  failedToolIconClassName,
  ToolActivityIconCtx,
  ToolActivityIconView,
  toolIconAcceptsTint,
  workEntryIconName,
} from "../../components/chat/MessagesTimeline";
import { workEntryDisplayLabel } from "../../components/chat/MessagesTimeline.logic";

/** Read-only tool row for Flow session previews, drawn with the main chat's icons and labels. */
export function WorkEntryPreview({
  entry,
  workspaceRoot,
  environmentId,
  resolvedTheme,
}: {
  entry: WorkLogEntry;
  workspaceRoot: string | undefined;
  environmentId: EnvironmentId;
  resolvedTheme: "light" | "dark";
}) {
  const iconContext = useMemo(
    () => ({ activeThreadEnvironmentId: environmentId, resolvedTheme }),
    [environmentId, resolvedTheme],
  );
  const iconName = workEntryIconName(entry);
  const toolIcon = entry.toolIcon ?? entry.toolSource?.icon;
  const failed = workEntryDisplayIndicatesToolFailure(entry);
  // Same label as the main chat's settled rows, so commands show in full.
  const label = workEntryDisplayLabel(entry, workspaceRoot);
  return (
    <ToolActivityIconCtx value={iconContext}>
      <span className="flex min-w-0 items-center gap-1.5 py-0.5 text-xs leading-relaxed text-secondary-label">
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center",
            failed ? failedToolIconClassName : "text-icon-muted",
          )}
          role={failed ? "img" : undefined}
          aria-label={failed ? "Tool call failed" : undefined}
        >
          <ToolActivityIconView
            icon={toolIcon}
            fallbackName={iconName}
            className="block size-3.5 shrink-0 stroke-2"
            muted
          />
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {failed && !toolIconAcceptsTint(iconName, toolIcon) ? (
          <XIcon aria-hidden className={cn("size-3 shrink-0", failedToolIconClassName)} />
        ) : null}
      </span>
    </ToolActivityIconCtx>
  );
}
