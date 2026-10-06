import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useModalKeyboardStore } from "../../modalKeyboardStore";
import "./flowOverviewTransition.css";

// A route that has not reached the opened session by then is not coming; swap anyway.
const ROUTE_WAIT_MS = 400;

type ViewTransition = {
  readonly ready: Promise<void>;
  readonly finished: Promise<void>;
  skipTransition(): void;
};
type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void>) => ViewTransition;
};

/** Elements that morph into their counterpart on the other side, keyed by
 * `view-transition-name`. A part missing on one side just fades. */
type SessionParts = {
  readonly [name in "flow-session" | "flow-session-title" | "flow-session-icon"]?:
    | HTMLElement
    | null
    | undefined;
};

/** The transition in flight; starting another or leaving the chat layout retires it. */
let activeRun: { retire: () => void } | null = null;

/** The session box plus its favicon and title, which fly to their counterparts. */
function sessionParts(box: HTMLElement | null, label: HTMLElement | null): SessionParts {
  return {
    "flow-session": box,
    "flow-session-title": label?.querySelector<HTMLElement>("[data-flow-session-title]"),
    "flow-session-icon": label?.querySelector<HTMLElement>("[data-flow-session-icon]"),
  };
}

function tileParts(sessionKey: string | null): SessionParts {
  if (sessionKey === null) return {};
  const tile = document.querySelector<HTMLElement>(
    `[data-modal-grid="working-sessions"] [data-modal-key="${CSS.escape(sessionKey)}"]`,
  );
  return sessionParts(tile, tile);
}

/** In a session, the Flow bar's current card carries the favicon and title. */
function paneParts(): SessionParts {
  return sessionParts(
    document.querySelector<HTMLElement>("main[data-slot='sidebar-inset']"),
    document.querySelector<HTMLElement>('[data-flow-card][aria-current="page"]'),
  );
}

/** The grid restores its cursor from the `conversation` bookmark, which ChatView's
 * items share; point it back at the session being left. */
function bookmarkSessionTile(sessionKey: string): void {
  const { bookmarks } = useModalKeyboardStore.getState();
  useModalKeyboardStore.setState({
    bookmarks: {
      ...bookmarks,
      conversation: { key: sessionKey, index: bookmarks.conversation?.index ?? 0 },
    },
  });
}

/** Swap between the working-session grid and a session, zooming the session's tile
 * into the chat pane (enter) or the chat pane back into its tile (exit). */
function runFlowOverviewTransition({
  direction,
  sessionKey,
  beforeCommit,
  commit,
}: {
  direction: "enter" | "exit";
  sessionKey: string | null;
  beforeCommit: Promise<void> | null;
  /** Shows the view wanted now and reports whether that is the overview. */
  commit: () => boolean;
}): boolean {
  const transitionDocument = document as ViewTransitionDocument;
  if (
    !transitionDocument.startViewTransition ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return false;

  activeRun?.retire();
  // Names belong to this run: a retired run must not clear names a newer run set on
  // the same element, nor touch the DOM once its deferred update finally runs.
  let retired = false;
  const named: HTMLElement[] = [];
  const name = (parts: SessionParts) => {
    if (retired) return;
    for (const [transitionName, element] of Object.entries(parts)) {
      if (!element) continue;
      element.style.viewTransitionName = transitionName;
      named.push(element);
    }
  };
  const unname = () => {
    for (const element of named.splice(0)) element.style.viewTransitionName = "";
  };

  name(direction === "enter" ? tileParts(sessionKey) : paneParts());
  const root = transitionDocument.documentElement;
  root.dataset.flowTransition = direction;
  const transition = transitionDocument.startViewTransition(async () => {
    await beforeCommit;
    // The run that retired this one commits the view it wants.
    if (retired) return;
    unname();
    // The wanted view may have flipped back while the route was awaited.
    name(commit() ? tileParts(sessionKey) : paneParts());
  });
  const run = {
    retire: () => {
      retired = true;
      unname();
      transition.skipTransition();
      if (activeRun !== run) return;
      activeRun = null;
      delete root.dataset.flowTransition;
    },
  };
  activeRun = run;
  // A skipped or aborted transition only loses its animation.
  transition.ready.catch(() => undefined);
  void transition.finished.then(run.retire, run.retire);
  return true;
}

/** Drop the in-flight transition and its names, e.g. when the chat layout unmounts. */
function retireFlowOverviewTransition(): void {
  activeRun?.retire();
}

/** The view `FlowOverviewBoundary` shows: trails `overview` through a view transition.
 * `sessionKey` is the session being opened; entering waits (up to `ROUTE_WAIT_MS`) for
 * the route to reach it, so the swap doesn't show the previous route's chat. */
export function useFlowOverviewTransition({
  overview,
  sessionKey,
  routeKey,
}: {
  overview: boolean;
  sessionKey: string | null;
  routeKey: string | null;
}): boolean {
  const [shown, setShown] = useState(overview);
  // Read when the wanted view changes, not tracked: a route landing mid-transition
  // must not restart it.
  const latest = useRef({ overview, sessionKey, routeKey });
  const releaseRouteWait = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    latest.current = { overview, sessionKey, routeKey };
    // Release once the route reaches the session wanted now (it may have changed since
    // the transition started), or once the overview is wanted again.
    if (overview || sessionKey === null || sessionKey === routeKey) releaseRouteWait.current?.();
  }, [overview, sessionKey, routeKey]);

  useLayoutEffect(() => retireFlowOverviewTransition, []);

  useLayoutEffect(() => {
    if (shown === overview) return;
    const { sessionKey, routeKey } = latest.current;
    const enter = !overview;
    if (!enter && routeKey !== null) bookmarkSessionTile(routeKey);
    releaseRouteWait.current?.();
    const routeReached =
      enter && sessionKey !== null && sessionKey !== routeKey
        ? new Promise<void>((resolve) => {
            const release = () => {
              if (releaseRouteWait.current === release) releaseRouteWait.current = null;
              resolve();
            };
            releaseRouteWait.current = release;
            window.setTimeout(release, ROUTE_WAIT_MS);
          })
        : null;
    const animated = runFlowOverviewTransition({
      direction: enter ? "enter" : "exit",
      sessionKey: enter ? sessionKey : routeKey,
      beforeCommit: routeReached,
      commit: () => {
        const next = latest.current.overview;
        flushSync(() => setShown(next));
        return next;
      },
    });
    if (!animated) setShown(overview);
  }, [overview, shown]);

  return shown;
}
