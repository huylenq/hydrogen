import { describeModalCommand } from "../modalKeyboardCommands";
import { useAtomValue } from "@effect/atom-react";
import {
  MODAL_COMMANDS,
  resolveModalSequence,
  type ModalCommand,
} from "@t3tools/client-runtime/keyboard";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { runAppCommand } from "../appCommands";
import { useComposerHandleContext } from "../composerHandleContext";
import { useClientSettings, useUpdateClientSettings } from "../hooks/useSettings";
import { isShortcutBound, resolveShortcutCommand, shortcutLabelForCommand } from "../keybindings";
import { isTerminalFocused } from "../lib/terminalFocus";
import {
  activateModalItem,
  captureModalReturnFocus,
  modalEmbeddedReturnSurface,
  modalSurfaceRoot,
  focusModalSurface,
  flowSessionActionTarget,
  modalEventIsEditable,
  modalEventIsEmbedded,
  modalEventIsQuestion,
  modalOverlayOpen,
  modalSurfaceItems,
  moveModalArea,
  moveModalFocus,
  rememberModalFocus,
} from "../modalKeyboardDom";
import {
  clearModalSequence,
  closeModalHelp,
  toggleModalHelp,
  requestModalFocus,
  useModalKeyboardStore,
  showModalFeedback,
} from "../modalKeyboardStore";
import { primaryServerKeybindingsAtom } from "../state/server";
import { toggleFlowMode, toggleFlowOverview } from "../customizations/huy/toggleFlowMode";
import { escapeToFlowOverview } from "../customizations/huy/flowSessionInspection";
import { useFlowStore } from "../flowStore";
import { installFlowGridWindowFocus } from "../customizations/huy/flowGridWindowFocus";
import { toggleReadingLamp, useReadingLampStore } from "../customizations/huy/readingCursor";
import { dispatchTimelineCommand } from "../customizations/huy/useHuyChatIntegration";
import {
  DIFF_VIM_LAYERED_BINDINGS,
  diffVimTargetFor,
  focusedDiffVimTarget,
  isDiffVimCommand,
} from "../customizations/huy/diffVim";
import { useSidebar } from "./ui/sidebar";
import { resolveThreadRouteRef } from "../threadRoutes";
import {
  toggleSessionImportance,
  useSessionImportanceStore,
} from "../customizations/huy/sessionImportance";

const GROUP_LABELS: Record<string, string> = {
  g: "Go",
  w: "Workspace",
  t: "Thread actions",
  f: "Find",
  y: "Copy",
};
const keyLabel = (key: string) => (key === " " ? "Space" : key);

export function ModalKeyboard({
  hasThread,
  workingSessionGrid = false,
}: {
  hasThread: boolean;
  workingSessionGrid?: boolean;
}) {
  const enabled = useClientSettings((settings) => settings.modalKeyboardEnabled);
  const updateSettings = useUpdateClientSettings();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const composer = useComposerHandleContext();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const routeRef = resolveThreadRouteRef(useParams({ strict: false }));
  const openThreadKey = hasThread && routeRef ? scopedThreadKey(routeRef) : null;
  const { open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar } = useSidebar();
  const flowOpen = useFlowStore((state) => state.open);
  const readingLamp = useReadingLampStore((state) => state.on);
  const state = useModalKeyboardStore();
  const importantKeys = useSessionImportanceStore((state) => state.keys);
  const [hintPrefix, setHintPrefix] = useState<readonly string[] | null>(null);

  const sessionTarget = useCallback(
    () =>
      flowSessionActionTarget(
        openThreadKey && state.threadContext?.isServer
          ? { key: openThreadKey, title: state.threadContext.title }
          : null,
      ),
    [openThreadKey, state.threadContext],
  );

  const describe = useCallback(
    (command: ModalCommand) => {
      const session =
        command === "thread.important" || command === "thread.snooze" ? sessionTarget() : null;
      return describeModalCommand(command, {
        thread: hasThread ? state.threadContext : null,
        surface: state.surface,
        sidebarOpen: isMobile ? openMobile : open,
        flowOpen,
        previousSurface: state.previousSurface,
        workingSessionGrid:
          workingSessionGrid ||
          (typeof document !== "undefined" &&
            modalSurfaceRoot("conversation")?.dataset.modalGrid === "working-sessions"),
        readingLamp,
        sessionTarget: session
          ? { title: session.title, important: importantKeys.has(session.key) }
          : null,
      });
    },
    [
      hasThread,
      state.threadContext,
      state.surface,
      isMobile,
      openMobile,
      open,
      flowOpen,
      state.previousSurface,
      workingSessionGrid,
      readingLamp,
      sessionTarget,
      importantKeys,
    ],
  );

  useEffect(() => {
    if (!enabled) return;
    return installFlowGridWindowFocus();
  }, [enabled]);

  useEffect(() => {
    if (!state.feedback) return;
    const timer = window.setTimeout(() => useModalKeyboardStore.setState({ feedback: null }), 3500);
    return () => window.clearTimeout(timer);
  }, [state.feedback]);

  useLayoutEffect(() => {
    if (!enabled || !state.focusRequest || hasThread) return;
    const surface = state.focusRequest;
    if (surface === "flow" && !flowOpen) {
      useFlowStore.getState().setOpen(true);
      return;
    }
    if (surface === "sidebar" && !(isMobile ? openMobile : open)) {
      if (isMobile) setOpenMobile(true);
      else setOpen(true);
      return;
    }
    if (!focusModalSurface(surface)) focusModalSurface("conversation");
    useModalKeyboardStore.setState({ focusRequest: null });
  }, [
    enabled,
    hasThread,
    isMobile,
    open,
    openMobile,
    flowOpen,
    setOpen,
    setOpenMobile,
    state.focusRequest,
  ]);

  useLayoutEffect(() => {
    clearModalSequence();
    if (enabled) requestModalFocus(pathname.startsWith("/settings") ? "sidebar" : "conversation");
    else closeModalHelp();
  }, [enabled, pathname]);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-modal-keyboard", enabled);
    return () => document.documentElement.removeAttribute("data-modal-keyboard");
  }, [enabled]);

  useEffect(() => {
    if (!state.pending.length) return;
    const timer = window.setTimeout(() => setHintPrefix(state.pending), 250);
    return () => window.clearTimeout(timer);
  }, [state.pending]);

  useEffect(() => {
    clearModalSequence();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- A replacement keymap invalidates the pending sequence.
  }, [keybindings]);

  useEffect(() => {
    const execute = (command: ModalCommand) => {
      const description = describe(command);
      if (description.reason) {
        showModalFeedback(description.reason);
        return;
      }
      if (
        [
          "threadSwitcher.toggle",
          "filePicker.toggle",
          "projectSearch.toggle",
          "modelPicker.toggle",
          "composer.reasoning",
          "chat.new",
        ].includes(command)
      )
        captureModalReturnFocus();
      switch (command) {
        case "thread.important": {
          const session = sessionTarget();
          if (session) {
            const focused = document.activeElement;
            const grid = focused?.closest('[data-modal-grid="working-sessions"]');
            const bar = focused?.closest('[data-modal-surface="flow"]');
            const important = toggleSessionImportance(session.key);
            // Priority sorting can remount a preview in another row. Restore its keyed bookmark.
            if (grid || bar) requestModalFocus(grid ? "conversation" : "flow");
            showModalFeedback(
              `${important ? "Marked important" : "Removed important flag"}: ${session.title}`,
            );
          }
          return;
        }
        case "focus.previous": {
          const previous = useModalKeyboardStore.getState().previousSurface;
          if (previous) requestModalFocus(previous);
          return;
        }
        case "focus.flow":
          requestModalFocus("flow");
          return;
        case "focus.conversation":
          // Escape resolves to this command in Normal mode. From an inspected
          // Flow session it returns to the working-session grid first.
          if (!escapeToFlowOverview()) requestModalFocus("conversation");
          return;
        case "sidebar.toggle":
          toggleSidebar();
          if (
            (isMobile ? openMobile : open) &&
            useModalKeyboardStore.getState().surface === "sidebar"
          ) {
            if (hasThread) requestModalFocus("conversation");
            else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          }
          return;
        case "flow.toggle": {
          const enabled = toggleFlowMode({ isMobile, open, openMobile, setOpen, setOpenMobile });
          if (!enabled && useModalKeyboardStore.getState().surface === "flow")
            requestModalFocus("conversation");
          return;
        }
        case "flow.overview.toggle":
          toggleFlowOverview({ isMobile, open, openMobile, setOpen, setOpenMobile });
          requestModalFocus("conversation");
          return;
        case "rightPanel.toggle":
          runAppCommand(command);
          if (useModalKeyboardStore.getState().surface === "rightPanel")
            requestModalFocus("conversation");
          return;
        case "composer":
          if (!composer?.current) return;
          useModalKeyboardStore.setState({ mode: "insert" });
          composer.current.focusAtEnd();
          return;
        case "threadSwitcher.toggle":
          runAppCommand("threadSwitcher.toggle");
          return;
        case "settings":
          void navigate({ to: "/settings/keybindings" });
          return;
        case "help":
          toggleModalHelp();
          return;
        case "activate":
          if (useModalKeyboardStore.getState().surface === "conversation" && hasThread) {
            // What the reading cursor is on (a changed file, a fold, a tool call) takes Enter;
            // otherwise it writes.
            if (!dispatchTimelineCommand("activate")) execute("composer");
            return;
          }
          if (useModalKeyboardStore.getState().surface === "rightPanel") {
            if (!runAppCommand("rightPanel.enter"))
              showModalFeedback("This panel is still loading; try Enter again");
            return;
          }
          activateModalItem();
          return;
        case "focus.left":
        case "focus.right":
          moveModalArea(command === "focus.left" ? "left" : "right");
          return;
        case "reading.lamp":
          toggleReadingLamp();
          return;
        case "reading.cite":
          dispatchTimelineCommand("cite");
          return;
        case "section.next":
        case "section.previous":
        case "message.next":
        case "message.previous":
        case "scroll.down":
        case "scroll.up":
        case "view.top":
        case "view.center":
        case "view.bottom":
          dispatchTimelineCommand(command);
          return;
        case "left":
        case "right":
          // In an open conversation h/l work what folds under the reading cursor.
          if (useModalKeyboardStore.getState().surface === "conversation" && hasThread) {
            if (!dispatchTimelineCommand(command === "left" ? "tree.out" : "tree.in"))
              showModalFeedback("Nothing to open or close at the reading cursor");
          } else moveModalFocus(command);
          return;
        case "first":
        case "last":
        case "next":
        case "previous":
          if (useModalKeyboardStore.getState().surface === "conversation" && hasThread)
            dispatchTimelineCommand(command);
          else moveModalFocus(command);
          return;
        default:
          if (!runAppCommand(command)) {
            showModalFeedback("This command is not available in the current view");
          }
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.key === "Process"
      )
        return;
      if (
        event
          .composedPath()
          .some(
            (target) => target instanceof Element && target.closest("[data-keybinding-capture]"),
          )
      )
        return;
      const terminal = isTerminalFocused();
      // Let beforeKey consume terminal escape commands, including their keyup protocol state.
      if (terminal) return;
      const command = resolveShortcutCommand(event, keybindings);
      const consume = () => {
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      if (command === "keyboard.toggleModal") {
        consume();
        if (!event.repeat) updateSettings({ modalKeyboardEnabled: !enabled });
        return;
      }
      if (!enabled) return;
      const current = useModalKeyboardStore.getState();
      if (command === "keyboard.normal") {
        consume();
        if (!event.repeat && !modalOverlayOpen())
          requestModalFocus(modalEmbeddedReturnSurface(), true);
        return;
      }
      if (modalOverlayOpen()) {
        clearModalSequence();
        return;
      }
      const diffHost = diffVimTargetFor(event);
      // Control+J/K scroll unless an app shortcut uses the chord in any context: this listener
      // cannot see the context the app's own dispatch checks (`mod` is Control off Mac). A focused
      // diff also takes Vim's Control+D/U/F/B page motions on the same terms.
      const controlScroll =
        event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey &&
        (diffHost ? /^[jkdufb]$/ : /^[jk]$/).test(event.key) &&
        !isShortcutBound(event, keybindings);
      // A focused diff takes magit's Alt+1/Alt+2 levels. Option changes `key` on Mac, so read `code`.
      const altLevel =
        diffHost &&
        event.altKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        /^Digit[12]$/.test(event.code) &&
        !isShortcutBound(event, keybindings)
          ? `Alt+${event.code.slice("Digit".length)}`
          : null;
      if (
        !controlScroll &&
        !altLevel &&
        (event.metaKey ||
          event.ctrlKey ||
          event.altKey ||
          (event.shiftKey && /^[1-9]$/.test(event.key)))
      ) {
        clearModalSequence();
        return;
      }
      // ProseMirror consumes Escape at the editor even without an open menu.
      // Return to normal mode during capture, after yielding to overlays and embedded surfaces.
      if (
        event.key === "Escape" &&
        !event.repeat &&
        !modalEventIsEmbedded(event) &&
        (modalEventIsEditable(event) || modalEventIsQuestion(event))
      ) {
        consume();
        requestModalFocus("conversation");
        return;
      }
      if (
        !diffHost &&
        (modalEventIsEmbedded(event) || modalEventIsEditable(event) || modalEventIsQuestion(event))
      )
        return;
      if (current.help && (event.key === "Escape" || event.key === "?")) {
        consume();
        if (!event.repeat) closeModalHelp();
        return;
      }
      const key =
        altLevel ??
        (controlScroll
          ? `Ctrl+${event.key}`
          : event.key === " " && event.shiftKey
            ? "Shift+Space"
            : event.key === "Tab" && event.shiftKey
              ? "Shift+Tab"
              : event.key);
      const available = (action: ModalCommand) => {
        if (action === "activate") {
          const target = event.target;
          return (
            current.surface === "conversation" ||
            modalSurfaceItems(current.surface).some((item) => item === target) ||
            (current.surface === "rightPanel" && target === modalSurfaceRoot("rightPanel"))
          );
        }
        return true;
      };
      const result = diffHost
        ? resolveModalSequence(
            current.pending,
            key,
            event.repeat,
            (action) => (isDiffVimCommand(action) ? diffHost.available(action) : available(action)),
            DIFF_VIM_LAYERED_BINDINGS,
          )
        : resolveModalSequence(current.pending, key, event.repeat, available);
      if (result.kind === "pass") return;
      consume();
      if (result.kind === "pending") {
        if (result.keys !== current.pending)
          useModalKeyboardStore.setState({ pending: result.keys });
      } else {
        clearModalSequence();
        if (result.kind !== "command") return;
        const command = result.command;
        if (!isDiffVimCommand(command)) execute(command);
        // An Escape the diff has no use for focuses the conversation, as everywhere else.
        else if (!diffHost?.run(command) && command === "diff.escape")
          execute("focus.conversation");
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (!enabled) return;
      clearModalSequence();
      if (modalOverlayOpen()) {
        captureModalReturnFocus(event.relatedTarget);
        return;
      }
      if (event.target instanceof HTMLElement) {
        rememberModalFocus(event.target);
        useModalKeyboardStore.setState({ mode: modalEventIsEditable(event) ? "insert" : "normal" });
      }
    };
    const cancel = () => clearModalSequence();
    const cancelOnPointer = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-modal-keyboard-hud]"))
        return;
      clearModalSequence();
    };
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocus);
    window.addEventListener("blur", cancel);
    document.addEventListener("compositionstart", cancel);
    document.addEventListener("pointerdown", cancelOnPointer, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocus);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("compositionstart", cancel);
      document.removeEventListener("pointerdown", cancelOnPointer, true);
    };
  }, [
    describe,
    sessionTarget,
    composer,
    enabled,
    hasThread,
    isMobile,
    keybindings,
    navigate,
    open,
    openMobile,
    setOpen,
    setOpenMobile,
    toggleSidebar,
    updateSettings,
  ]);

  if (!enabled) return null;
  const hints = state.help || (state.pending.length > 0 && hintPrefix === state.pending);
  if (!hints && !state.feedback) return null;
  const prefix = state.help ? [] : state.pending;
  const diffHost = focusedDiffVimTarget();
  const entries = (diffHost ? DIFF_VIM_LAYERED_BINDINGS : MODAL_COMMANDS).filter(
    (binding) => state.help || prefix.every((key, index) => binding.keys[index] === key),
  );
  const groups = new Map<string, { label: string; reason: string | null; matching: boolean }>();
  for (const binding of entries) {
    const rest = binding.keys.slice(prefix.length);
    const key = state.help ? binding.keys.map(keyLabel).join(" ") : keyLabel(rest[0] ?? "");
    const description = isDiffVimCommand(binding.command)
      ? {
          label: binding.label,
          reason:
            diffHost?.available(binding.command) === false ? "Select lines with v first" : null,
        }
      : describe(binding.command);
    groups.set(key, {
      label:
        !state.help && rest.length > 1
          ? (GROUP_LABELS[rest[0] ?? ""] ?? "Commands")
          : description.label,
      reason: !state.help && rest.length > 1 ? null : description.reason,
      matching: state.pending.every((part, index) => binding.keys[index] === part),
    });
  }

  return (
    <div
      className={
        hasThread
          ? "pointer-events-none relative z-50 mx-auto w-fit max-w-full"
          : "pointer-events-none fixed bottom-3 left-1/2 z-50 -translate-x-1/2"
      }
      data-modal-keyboard-hud
    >
      <div className="absolute bottom-full left-1/2 w-max max-w-[90vw] -translate-x-1/2">
        {state.feedback ? (
          <div
            role="status"
            className="mb-2 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm"
          >
            {state.feedback}
          </div>
        ) : null}
        {hints ? (
          <div
            className="pointer-events-auto mb-2 max-h-[60vh] w-[min(34rem,90vw)] overflow-y-auto rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg"
            role="region"
            aria-label="Modal keyboard help"
          >
            <div className="mb-3 flex justify-between text-sm font-medium">
              <span>
                {state.help ? "Keyboard reference" : state.pending.map(keyLabel).join(" → ")}
              </span>
              <button
                type="button"
                className="text-muted-foreground"
                onClick={state.help ? closeModalHelp : clearModalSequence}
                aria-label="Close keyboard help"
              >
                Esc to cancel
              </button>
            </div>
            {state.threadContext && hasThread ? (
              <p className="mb-3 break-words text-xs text-muted-foreground">
                Thread actions target: {state.threadContext.title}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs">
              {[...groups].map(([key, entry]) => (
                <div
                  key={key}
                  data-modal-command={key}
                  data-prefix-match={entry.matching}
                  className={`flex justify-between gap-3 rounded px-1 py-0.5 ${state.pending.length && entry.matching ? "bg-primary/10" : ""} ${entry.matching ? "" : "opacity-40"}`}
                >
                  <kbd className="font-mono font-medium">{key}</kbd>
                  <span className="text-right text-foreground">
                    {entry.label}
                    {entry.reason ? (
                      <span className="block text-3xs text-muted-foreground">{entry.reason}</span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
            {state.help ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {shortcutLabelForCommand(keybindings, "keyboard.normal")} returns control from the
                terminal. Shortcuts stay active while this reference is open. Text fields keep
                native editing.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
