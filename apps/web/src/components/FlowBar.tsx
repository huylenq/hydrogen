import { registerAppCommands, type AppCommand } from "../appCommands";
import { getClientSettings } from "../hooks/useSettings";
import { requestModalFocus, useModalKeyboardStore } from "../modalKeyboardStore";
import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useParams, useRouter } from "@tanstack/react-router";

import { isCommandPaletteOpen } from "../commandPaletteBus";
import { useFlowStore } from "../flowStore";
import { useFlowModel } from "../hooks/useFlowModel";
import {
  resolveShortcutCommand,
  threadJumpIndexFromCommand,
  threadTraversalDirectionFromCommand,
} from "../keybindings";
import { isTerminalFocused } from "../lib/terminalFocus";
import { isModelPickerOpen } from "../modelPickerVisibility";
import { useEnvironments } from "../state/environments";
import { useProjects } from "../state/entities";
import { primaryServerKeybindingsAtom } from "../state/server";
import { buildThreadRouteParams, resolveThreadRouteTarget } from "../threadRoutes";
import { useComposerDraftStore } from "../composerDraftStore";
import { returnToFlowOverview } from "../customizations/huy/flowSessionInspection";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { cn } from "../lib/utils";
import {
  flowNavigationTarget,
  flowThreadKey,
  isFlowSessionInspection,
  nextFlowThread,
  type FlowAttentionStatus,
} from "./Flow.logic";
import { ProjectFavicon } from "./ProjectFavicon";
import { ArrowLeftIcon, FolderCodeIcon } from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

export const FLOW_STATUS_CLASS: Record<FlowAttentionStatus, string> = {
  Approval: "text-amber-700 dark:text-amber-300",
  Input: "text-indigo-600 dark:text-indigo-300",
  Failed: "text-red-700 dark:text-red-300",
  "Plan ready": "text-violet-600 dark:text-violet-300",
  Review: "text-emerald-700 dark:text-emerald-300",
};

function projectKey(thread: EnvironmentThreadShell): string {
  return `${thread.environmentId}:${thread.projectId}`;
}

export function FlowBar() {
  const projects = useProjects();
  const { environments } = useEnvironments();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const router = useRouter();
  const routeTarget = resolveThreadRouteTarget(
    useParams({
      strict: false,
      select: (params) => params,
    }),
  );
  const draft = useComposerDraftStore((state) =>
    routeTarget?.kind === "draft" ? state.getDraftSession(routeTarget.draftId) : null,
  );
  const routeRef =
    routeTarget?.kind === "server"
      ? routeTarget.threadRef
      : draft
        ? (draft.promotedTo ?? scopeThreadRef(draft.environmentId, draft.threadId))
        : null;
  const activeThreadKey = routeRef === null ? null : scopedThreadKey(routeRef);
  const model = useFlowModel();
  const inspectedThreadKey = useFlowStore((state) => state.inspectedThreadKey);
  const nextThread = useMemo(
    () =>
      nextFlowThread(
        model,
        activeThreadKey,
        new Set(
          environments
            .filter((environment) => environment.connection.phase === "connected")
            .map((environment) => environment.environmentId),
        ),
      ),
    [model, activeThreadKey, environments],
  );
  const nextThreadKey = nextThread
    ? scopedThreadKey(scopeThreadRef(nextThread.environmentId, nextThread.id))
    : null;
  const projectByKey = useMemo(
    () => new Map(projects.map((project) => [`${project.environmentId}:${project.id}`, project])),
    [projects],
  );
  const environmentLabelById = useMemo(
    () =>
      new Map(environments.map((environment) => [environment.environmentId, environment.label])),
    [environments],
  );
  const showEnvironment = environments.length > 1;

  const navigateToThread = useCallback(
    (thread: EnvironmentThreadShell) => {
      useFlowStore.getState().inspectSession(flowThreadKey(thread));
      void router.navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id)),
      });
    },
    [router],
  );

  useEffect(() => {
    const executeNavigation = (command: AppCommand) => {
      const flowNavigation = command === "flow.previous" || command === "flow.next";
      if (
        !flowNavigation &&
        getClientSettings().modalKeyboardEnabled &&
        useModalKeyboardStore.getState().surface !== "flow"
      )
        return false;
      const direction =
        command === "flow.previous"
          ? "previous"
          : command === "flow.next"
            ? "next"
            : threadTraversalDirectionFromCommand(command);
      const targetIndex = threadJumpIndexFromCommand(command);
      let target = targetIndex !== null ? model.attention[targetIndex]?.thread : undefined;
      if (direction !== null) {
        target = flowNavigationTarget(model, activeThreadKey, direction) ?? undefined;
      }
      if (!target) return false;
      navigateToThread(target);
      return true;
    };
    const unregisterCommands = registerAppCommands(executeNavigation);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isCommandPaletteOpen()) return;
      const command = resolveShortcutCommand(event, keybindings, {
        context: {
          terminalFocus: isTerminalFocused(),
          modelPickerOpen: isModelPickerOpen(),
        },
      });
      if (command && executeNavigation(command)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      unregisterCommands();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeThreadKey, keybindings, model, navigateToThread]);

  useLayoutEffect(() => {
    const state = useModalKeyboardStore.getState();
    if (
      getClientSettings().modalKeyboardEnabled &&
      state.mode === "normal" &&
      state.surface === "flow" &&
      document.activeElement === document.body
    ) {
      requestModalFocus("flow");
    }
  });

  const moveCardFocus = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const cards = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[data-flow-card]") ??
        [],
    );
    const currentIndex = cards.indexOf(event.currentTarget);
    const nextIndex = event.key === "ArrowLeft" ? currentIndex - 1 : currentIndex + 1;
    const next = cards[nextIndex];
    if (!next) return;
    event.preventDefault();
    next.focus();
    next.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" });
  };

  return (
    <section
      aria-label="Flow bar"
      className="flex h-full min-w-0 flex-1 items-stretch gap-3 py-2"
      data-flow=""
      data-modal-surface="flow"
      tabIndex={-1}
    >
      {isFlowSessionInspection(model, activeThreadKey, inspectedThreadKey) ? (
        <button
          type="button"
          className="pointer-events-auto [-webkit-app-region:no-drag] my-auto flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          onClick={returnToFlowOverview}
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
          Back to previews
        </button>
      ) : null}
      <div
        className={cn(
          "relative min-w-0 overflow-hidden",
          model.attention.length > 0 ? "flex-1" : "hidden",
        )}
      >
        <div className="pointer-events-auto [-webkit-app-region:no-drag] relative flex h-full w-max max-w-full gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {model.attention.map((entry) => {
            const threadKey = scopedThreadKey(
              scopeThreadRef(entry.thread.environmentId, entry.thread.id),
            );
            const isActive = threadKey === activeThreadKey;
            const project = projectByKey.get(projectKey(entry.thread));
            const projectTitle = project?.title ?? "Unknown project";
            const environmentLabel = environmentLabelById.get(entry.thread.environmentId);
            return (
              <button
                key={threadKey}
                type="button"
                data-flow-card=""
                data-modal-key={threadKey}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex w-[300px] shrink-0 flex-col justify-center gap-1.5 rounded-md border border-border/70 bg-background/50 px-3 py-2 text-left backdrop-blur-xl backdrop-saturate-150 outline-hidden hover:bg-background/65 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  isActive && "border-primary/50 bg-accent/75 hover:bg-accent/85",
                )}
                onClick={() => navigateToThread(entry.thread)}
                onKeyDown={moveCardFocus}
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    {project ? (
                      <ProjectFavicon project={project} className="size-3.5 shrink-0" />
                    ) : null}
                    <span className="truncate text-xs font-medium text-foreground">
                      {entry.thread.title}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {formatRelativeTimeLabel(entry.timestamp)}
                  </span>
                </div>
                <div className="flex min-w-0 items-center gap-2 text-[11px] leading-3">
                  <span className={cn("shrink-0 font-medium", FLOW_STATUS_CLASS[entry.status])}>
                    {entry.status}
                  </span>
                  {threadKey === nextThreadKey ? (
                    <span className="shrink-0 text-muted-foreground">Next</span>
                  ) : null}
                  <span aria-hidden className="text-muted-foreground/40">
                    ·
                  </span>
                  <span className="truncate text-muted-foreground">
                    {showEnvironment && environmentLabel
                      ? `${environmentLabel} · ${projectTitle}`
                      : projectTitle}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {model.bench.length > 0 ? (
        <aside
          aria-label="Working sessions"
          className={cn(
            "ml-auto w-max min-w-0 pl-3",
            model.attention.length > 0 ? "max-w-[50%]" : "max-w-full",
          )}
        >
          <div className="pointer-events-auto [-webkit-app-region:no-drag] grid h-full auto-cols-[2rem] grid-flow-col grid-rows-1 items-center gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {model.bench.map((entry) => {
              const threadKey = scopedThreadKey(
                scopeThreadRef(entry.thread.environmentId, entry.thread.id),
              );
              const project = projectByKey.get(projectKey(entry.thread));
              const projectTitle = project?.title ?? "Unknown project";
              const environmentLabel = environmentLabelById.get(entry.thread.environmentId);
              const context =
                showEnvironment && environmentLabel
                  ? `${environmentLabel} · ${projectTitle}`
                  : projectTitle;
              return (
                <Tooltip key={threadKey}>
                  <TooltipTrigger
                    render={<button />}
                    type="button"
                    aria-current={threadKey === activeThreadKey ? "page" : undefined}
                    aria-label={`${entry.thread.title} · ${context}`}
                    data-flow-card=""
                    data-modal-key={threadKey}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md border border-transparent outline-hidden hover:bg-background/65 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      threadKey === activeThreadKey &&
                        "border-primary/50 bg-accent/75 hover:bg-accent/85",
                    )}
                    onClick={() => navigateToThread(entry.thread)}
                  >
                    {project ? (
                      <ProjectFavicon project={project} className="size-4 shrink-0" />
                    ) : (
                      <FolderCodeIcon className="size-4 text-muted-foreground" aria-hidden />
                    )}
                  </TooltipTrigger>
                  <TooltipPopup side="bottom">
                    {entry.thread.title} · {context}
                  </TooltipPopup>
                </Tooltip>
              );
            })}
          </div>
        </aside>
      ) : null}
    </section>
  );
}
