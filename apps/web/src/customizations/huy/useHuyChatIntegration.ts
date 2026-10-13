import type { LegendListRef } from "@legendapp/list/react";
import type { AssistantCitation } from "@t3tools/contracts";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { MessagesTimelineRow } from "../../components/chat/MessagesTimeline.logic";
import { getClientSettings } from "../../hooks/useSettings";
import type { AssistantCitationSourceAnchor } from "../../lib/assistantTextSelection";
import type { ModalThreadContext } from "../../modalKeyboardCommands";
import { modalEmbeddedReturnSurface } from "../../modalKeyboardDom";
import {
  requestModalFocus,
  showModalFeedback,
  useModalKeyboardStore,
} from "../../modalKeyboardStore";
import { captureBlockCitation } from "./readingCite";
import { toolGroupList } from "./toolGroupLists";
import {
  flashReadingMarker,
  markReadingCursor,
  pulseReadingCursor,
  useReadingLampStore,
} from "./readingCursor";
import {
  collectReadingStops,
  findReadingStop,
  findReadingStopElement,
  latestAnswerRow,
  ROW_START_BLOCK,
  readingAnchor,
  readingPlacementLine,
  readingStopControl,
  readingStopRect,
  readingTreeMotion,
  readingView,
  resolveReadingStep,
  rowReadingStops,
  toolCallBlock,
  toolCallIndex,
  visibleReadingStops,
  type ReadingDirection,
  type ReadingEdge,
  type ReadingGranularity,
  type ReadingStop,
} from "./readingStops";

type TimelineHost = {
  /** The displayed thread; ChatView stays mounted across server threads. */
  threadKey: string | null;
  getList: () => LegendListRef | null;
  beforeScroll: (direction: "toward-end" | "away-from-end") => void;
  /** Viewport y of the composer's top edge, which overlays the bottom of the timeline. */
  composerTop: () => number | null;
  /** Inserts a citation into the composer; null while the timeline is a placeholder. */
  cite: ((citation: AssistantCitation, anchor: AssistantCitationSourceAnchor) => boolean) | null;
};

const TIMELINE_COMMANDS = [
  "first",
  "last",
  "next",
  "previous",
  "section.next",
  "section.previous",
  "message.next",
  "message.previous",
  "scroll.down",
  "scroll.up",
  "view.top",
  "view.center",
  "view.bottom",
  "cite",
  "activate",
  "tree.in",
  "tree.out",
] as const;
export type TimelineCommand = (typeof TIMELINE_COMMANDS)[number];

const TIMELINE_COMMAND_EVENT = "t3code:modal-timeline-command";

/**
 * The open conversation owns scrolling and follow state, so Vim commands reach it by event.
 * Returns whether the conversation acted on the command.
 */
export function dispatchTimelineCommand(command: TimelineCommand): boolean {
  return !window.dispatchEvent(
    new CustomEvent(TIMELINE_COMMAND_EVENT, { detail: command, cancelable: true }),
  );
}

const READING_REVEAL_EVENT = "t3code:modal-timeline-reveal";

/**
 * Hands the keyboard back from an embedded page, such as an HTML render whose page left an Escape
 * alone. In Vim mode focus returns to the surface around it, with the reading cursor on its block;
 * otherwise the page just lets go.
 */
export function releaseEmbeddedFocus(frame: HTMLElement): void {
  if (!enabled()) {
    frame.blur();
    return;
  }
  // Read while the frame still has focus: it decides which surface takes it back.
  const surface = modalEmbeddedReturnSurface();
  window.dispatchEvent(new CustomEvent(READING_REVEAL_EVENT, { detail: frame }));
  requestModalFocus(surface, true);
}

const MOTIONS: Partial<
  Record<TimelineCommand, [granularity: ReadingGranularity, direction: ReadingDirection]>
> = {
  next: ["block", "next"],
  previous: ["block", "previous"],
  "section.next": ["section", "next"],
  "section.previous": ["section", "previous"],
  "message.next": ["turn", "next"],
  "message.previous": ["turn", "previous"],
};

const PLACEMENTS: Partial<Record<TimelineCommand, ReadingEdge>> = {
  "view.top": "top",
  "view.center": "center",
  "view.bottom": "bottom",
};
const EDGE_SHARE = { top: 0, center: 0.5, bottom: 1 } as const;

/**
 * Timed scrolls the eye can follow. Block steps glide calmly, since reading continues where they
 * land; jumps to sections and messages stay quick.
 */
const PACES = {
  calm: {
    ease: (t: number) => (1 - Math.cos(Math.PI * t)) / 2,
    duration: (distance: number) => Math.min(560, 360 + distance / 3),
  },
  quick: {
    ease: (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (2 - 2 * t) ** 3 / 2),
    duration: (distance: number) => Math.min(320, 160 + distance / 4),
  },
} as const;
type Pace = keyof typeof PACES;
// Input that scrolls the timeline directly, as opposed to its own glides and layout shifts.
const USER_SCROLL_EVENTS = ["wheel", "touchstart", "pointerdown"] as const;
const enabled = () => getClientSettings().modalKeyboardEnabled;
/** Room kept between a tool call and its group scroller's edges (its edge fades and scroll padding). */
const TOOL_GROUP_EDGE = 24;
const lampOn = () => useReadingLampStore.getState().on;

/** The chat publishes capabilities and timeline access; modal policy stays outside ChatView. */
export function useHuyChatIntegration(context: ModalThreadContext, timeline: TimelineHost) {
  const currentTimeline = useRef(timeline);
  const scheduleFollow = useRef(() => {});
  const resetReading = useRef(() => {});
  useLayoutEffect(() => {
    // Another thread's cursor, landing, or direction must not act on this one.
    if (currentTimeline.current.threadKey !== timeline.threadKey) resetReading.current();
    currentTimeline.current = timeline;
    const previous = useModalKeyboardStore.getState().threadContext;
    if (
      !previous ||
      (Object.keys(context) as (keyof ModalThreadContext)[]).some(
        (key) => previous[key] !== context[key],
      )
    )
      useModalKeyboardStore.setState({ threadContext: context });
    // A thread switch can replace the rows or the scroll node without scrolling.
    scheduleFollow.current();
  });
  useEffect(() => {
    // Scrolls ease toward a target. Landings re-read their target as rows measure, then snap
    // onto it.
    // `target` is null once the landing's row is gone.
    type Jump = { key: string; target: () => number | null; snap: () => void };
    type Glide = {
      node: HTMLElement;
      target: number;
      expected: number;
      frame: number;
      /** When the glide started, to tell the user's own scrolling from layout shifts. */
      since: number;
      jump: Jump | null;
      motion:
        | { kind: "free"; tau: number; time: number }
        | {
            kind: "timed";
            from: number;
            start: number;
            duration: number;
            ease: (progress: number) => number;
          };
    };
    let glide: Glide | null = null;
    // The reading cursor: the block being read. It survives scrolling while any of it stays on
    // screen.
    let cursor: Pick<ReadingStop, "key" | "rowId" | "block"> | null = null;
    // Which way block steps have been reading, so scrolls leave room where reading heads next.
    let trajectory: ReadingDirection | null = null;
    // The latest answer's row once the cursor has been on it or past it, so reading on starts at
    // an answer's beginning only until it has been read.
    let readAnswer: string | null = null;
    const latestAnswer = (list: LegendListRef) => {
      const rows = list.getState().data as readonly MessagesTimelineRow[];
      const index = latestAnswerRow(rows);
      return index < 0 ? null : { index, rowId: rows[index]!.id };
    };
    const noteRead = () => {
      const list = currentTimeline.current.getList();
      const answer = cursor && list ? latestAnswer(list) : null;
      if (!cursor || !list || !answer) return;
      if ((list.getState().indexByKey(cursor.rowId) ?? -1) >= answer.index)
        readAnswer = answer.rowId;
    };
    // Wheel, touch, or pointer input on the timeline: the user is scrolling it themselves.
    let userInputAt = -Infinity;
    let lastStepAt = -Infinity;
    const noteUserInput = () => {
      userInputAt = performance.now();
    };
    const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clampScroll = (node: HTMLElement, top: number) =>
      Math.max(0, Math.min(node.scrollHeight - node.clientHeight, top));
    const timelineNode = () => {
      const list = currentTimeline.current.getList();
      const node: unknown = list?.getScrollableNode();
      return list && node instanceof HTMLElement ? { list, node } : null;
    };
    // Measured, not the timeline's end padding: that keeps a collapsed composer's taller
    // reservation, which would hide readable lines from the cursor.
    const composerInset = (node: HTMLElement) => {
      const top = currentTimeline.current.composerTop();
      return top === null ? 0 : Math.max(0, node.getBoundingClientRect().bottom - top);
    };

    let followFrame: number | null = null;
    let watched: { node: HTMLElement; observer: MutationObserver } | null = null;
    const schedule = () => {
      if (!cursor && !lampOn()) return;
      followFrame ??= requestAnimationFrame(() => {
        followFrame = null;
        follow();
      });
    };
    scheduleFollow.current = schedule;
    // While the cursor or the lamp is showing, scrolling and row changes can move it off screen.
    const watch = (node: HTMLElement | null) => {
      if (watched?.node === node) return;
      if (watched) {
        watched.node.removeEventListener("scroll", schedule, { capture: true });
        for (const type of USER_SCROLL_EVENTS)
          watched.node.removeEventListener(type, noteUserInput);
        watched.observer.disconnect();
      }
      watched = null;
      if (!node) return;
      const observer = new MutationObserver(schedule);
      observer.observe(node, { childList: true, subtree: true });
      // Captured, so a tool group scrolling inside the timeline is followed too.
      node.addEventListener("scroll", schedule, { capture: true, passive: true });
      for (const type of USER_SCROLL_EVENTS)
        node.addEventListener(type, noteUserInput, { passive: true });
      watched = { node, observer };
    };
    const showCursor = (node: HTMLElement) => {
      const lamp = enabled() && lampOn();
      const found = cursor && enabled() ? findReadingStop(node, cursor) : null;
      // A row entered at its start takes the name of the stop it turned out to start with.
      if (cursor && found && found.block !== cursor.block)
        cursor = { key: `${cursor.rowId}#${found.block}`, rowId: cursor.rowId, block: found.block };
      const element = found?.element ?? null;
      if (element) noteRead();
      markReadingCursor(element ? node : null, element, lamp);
      watch(cursor || lamp ? node : null);
    };
    /**
     * A tool call scrolls into view inside its group's own scroller first, clear of the scroller's
     * edge fades, so the timeline then scrolls to where it actually shows.
     */
    const showInToolGroup = (node: HTMLElement) => {
      const element = cursor ? findReadingStopElement(node, cursor) : null;
      const scroller = element?.closest<HTMLElement>("[data-tool-group-scroll]");
      if (!element || !scroller) return;
      const box = scroller.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const margin = Math.min(TOOL_GROUP_EDGE, box.height / 4);
      if (rect.top < box.top + margin || rect.height > box.height - 2 * margin)
        scroller.scrollTop += rect.top - box.top - margin;
      else if (rect.bottom > box.bottom - margin)
        scroller.scrollTop += rect.bottom - box.bottom + margin;
    };
    /**
     * A tool group renders only the calls near its view. Stepping to a neighbor it has not
     * rendered yet asks the group's list to render it; true while that is underway.
     */
    const renderNeighborCall = (node: HTMLElement, direction: ReadingDirection) => {
      const index = cursor ? toolCallIndex(cursor.block) : null;
      if (!cursor || index === null) return false;
      const row = node.querySelector(`[data-timeline-row-id="${CSS.escape(cursor.rowId)}"]`);
      const scroller = row?.querySelector("[data-tool-group-scroll]");
      const calls = scroller ? toolGroupList(scroller) : null;
      const neighbor = index + (direction === "next" ? 1 : -1);
      if (!calls || neighbor < 0 || neighbor >= calls.getState().data.length) return false;
      if (findReadingStop(node, { rowId: cursor.rowId, block: toolCallBlock(neighbor) }))
        return false;
      void calls.scrollToIndex({
        index: neighbor,
        animated: false,
        viewPosition: direction === "next" ? 1 : 0,
      });
      return true;
    };
    let neighborCallFrames = 0;
    /** Where reading starts without a cursor: the first block that begins on screen. */
    const anchor = (list: LegendListRef, node: HTMLElement) => {
      const rect = node.getBoundingClientRect();
      const stops = visibleReadingStops(list, node, rect.top, rect.bottom);
      const view = readingView(node.scrollTop, node.clientHeight, composerInset(node));
      return stops[readingAnchor(stops, view)] ?? null;
    };
    // A cursor scrolled away is dropped, and the next motion starts where reading starts on
    // screen. The lamp always lights a block, so it follows the screen instead.
    const follow = () => {
      const timeline = timelineNode();
      if (!timeline) return;
      const { list, node } = timeline;
      if (!glide?.jump) {
        const element = cursor ? findReadingStopElement(node, cursor) : null;
        if (element) {
          const nodeTop = node.getBoundingClientRect().top;
          const view = readingView(nodeTop, node.clientHeight, composerInset(node));
          const rect = element.getBoundingClientRect();
          // A tool call scrolled out of its group's own scroller is gone too.
          const group = element.closest("[data-tool-group-scroll]")?.getBoundingClientRect();
          const top = Math.max(view.top, group?.top ?? -Infinity);
          const bottom = Math.min(view.bottom, group?.bottom ?? Infinity);
          if (rect.bottom <= top || rect.top >= bottom) cursor = null;
        } else cursor = null;
        if (!cursor) trajectory = null;
        if (!cursor && enabled() && lampOn()) cursor = anchor(list, node);
      }
      showCursor(node);
    };
    const unsubscribeLamp = useReadingLampStore.subscribe(follow);
    resetReading.current = () => {
      stopGlide();
      cursor = null;
      trajectory = null;
      readAnswer = null;
      if (followFrame !== null) cancelAnimationFrame(followFrame);
      followFrame = null;
      watch(null);
      markReadingCursor(null, null, false);
    };

    const stopGlide = () => {
      if (glide) cancelAnimationFrame(glide.frame);
      glide = null;
    };
    const stepGlide = (now: number) => {
      if (!glide) return;
      const { node, jump, motion } = glide;
      if (Math.abs(node.scrollTop - glide.expected) > 1) {
        const byUser = userInputAt >= glide.since;
        stopGlide();
        // The user took over: leave the view where they put it and start reading afresh.
        if (byUser) {
          trajectory = null;
          return schedule();
        }
        // Rows measured or loaded and shifted the list; land on the target anyway.
        return jump?.snap();
      }
      if (jump) {
        const target = jump.target();
        if (target === null) return stopGlide();
        glide.target = target;
      }
      let done: boolean;
      if (motion.kind === "timed") {
        const progress = Math.min(1, (now - motion.start) / motion.duration);
        done = progress >= 1;
        if (!done)
          node.scrollTop = motion.from + (glide.target - motion.from) * motion.ease(progress);
      } else {
        const factor = 1 - Math.exp(-Math.max(0, now - motion.time) / motion.tau);
        motion.time = now;
        const remaining = glide.target - node.scrollTop;
        done = Math.abs(remaining) < 1;
        if (!done) node.scrollTop += remaining * factor;
      }
      if (done) {
        node.scrollTop = glide.target;
        stopGlide();
        return jump?.snap();
      }
      glide.expected = node.scrollTop;
      glide.frame = requestAnimationFrame(stepGlide);
    };
    // Free glides chase an accumulating target so held keys scroll continuously. Landings and
    // pages follow a timed ease at their pace.
    const glideTo = (node: HTMLElement, target: number, jump: Jump | null, pace: Pace | null) => {
      const motion: Glide["motion"] = pace
        ? {
            kind: "timed",
            from: node.scrollTop,
            start: performance.now(),
            duration: PACES[pace].duration(Math.abs(target - node.scrollTop)),
            ease: PACES[pace].ease,
          }
        : glide?.node === node && glide.motion.kind === "free"
          ? glide.motion
          : { kind: "free", tau: 60, time: performance.now() };
      if (glide?.node === node) {
        Object.assign(glide, { target, jump, motion });
        return;
      }
      stopGlide();
      glide = {
        node,
        target,
        jump,
        motion,
        expected: node.scrollTop,
        since: performance.now(),
        frame: requestAnimationFrame(stepGlide),
      };
    };
    /** Where the view will rest once the current glide finishes. */
    const scrollBase = (node: HTMLElement) =>
      glide?.node === node ? glide.target : node.scrollTop;
    const glideBy = (node: HTMLElement, delta: number, pace: Pace | null = null) => {
      const target = clampScroll(node, scrollBase(node) + delta);
      if (reducedMotion()) {
        stopGlide();
        node.scrollTop = target;
        return;
      }
      glideTo(node, target, null, pace);
    };
    /** Scrolls until the stop's `edge` sits `offset` below the top of the timeline. */
    const land = (
      list: LegendListRef,
      node: HTMLElement,
      stop: Pick<ReadingStop, "key" | "rowId" | "block">,
      origin: number | null,
      edge: ReadingEdge,
      offset: number,
      pace: Pace,
      cue: () => void,
    ) => {
      // Re-read as rows measure; an unmounted row only has its estimated top. Rows inserted
      // above shift every index after them, so the row is looked up by id each time.
      const rowIndex = () => list.getState().indexByKey(stop.rowId);
      const measured = () => {
        const element = findReadingStopElement(node, stop);
        if (element) {
          const rect = readingStopRect(element);
          const top = rect.top - node.getBoundingClientRect().top + node.scrollTop;
          return top + rect.height * EDGE_SHARE[edge];
        }
        const index = rowIndex();
        const position = index === undefined ? undefined : list.getState().positionAtIndex(index);
        return origin === null || position === undefined ? null : origin + position;
      };
      const target = () => {
        const edgeAt = measured();
        return edgeAt === null ? null : clampScroll(node, edgeAt - offset);
      };
      // The cue plays as the block starts moving so the eye can follow it; a row that mounts
      // only on arrival plays it there.
      const mounted = findReadingStopElement(node, stop) !== null;
      const snap = () => {
        const index = rowIndex();
        const top = target();
        if (findReadingStopElement(node, stop) && top !== null) node.scrollTop = top;
        else if (index !== undefined)
          void list.scrollToIndex({ index, animated: false, viewPosition: 0, viewOffset: offset });
        showCursor(node);
        if (!mounted && cursor?.key === stop.key) cue();
      };
      showCursor(node);
      if (mounted) cue();
      if (reducedMotion()) {
        stopGlide();
        return snap();
      }
      const start = target();
      // A row that is already gone has nothing to land on.
      if (start === null) return;
      glideTo(node, start, { key: stop.key, target, snap }, pace);
    };
    const move = (
      list: LegendListRef,
      node: HTMLElement,
      granularity: ReadingGranularity,
      direction: ReadingDirection,
    ) => {
      // Scrolling by hand since the last step starts a fresh read.
      if (userInputAt > lastStepAt) trajectory = null;
      lastStepAt = performance.now();
      // Repeats while a scroll is in flight decide from where it will rest.
      const base = scrollBase(node);
      const view = readingView(base, node.clientHeight, composerInset(node));
      // Only `j` without a cursor can start at an unread answer.
      const answer =
        cursor || granularity !== "block" || direction !== "next" ? null : latestAnswer(list);
      const unread = answer && answer.rowId !== readAnswer ? answer.rowId : null;
      const resolve = (stops: readonly ReadingStop[]) => {
        const cursorIndex = cursor ? stops.findIndex((stop) => stop.key === cursor?.key) : -1;
        const step = resolveReadingStep({
          stops,
          cursor: cursorIndex,
          granularity,
          direction,
          view,
          trajectory,
          unreadAnswer: unread ? stops.findIndex((stop) => stop.rowId === unread) : -1,
        });
        return { step, cursorIndex };
      };
      // The step waits a few frames for a tool call its group is rendering, then goes on without.
      if (
        granularity === "block" &&
        neighborCallFrames < 4 &&
        renderNeighborCall(node, direction)
      ) {
        neighborCallFrames += 1;
        requestAnimationFrame(() => move(list, node, granularity, direction));
        return;
      }
      neighborCallFrames = 0;
      // Block steps stay within the mounted rows, so they skip walking the whole list unless
      // they reach its edge; jumps, and the start of an unread answer, may need rows that are
      // not mounted.
      let { stops, origin } = collectReadingStops(
        list,
        node,
        granularity !== "block" || unread !== null,
      );
      let { step, cursorIndex } = resolve(stops);
      if (!step && granularity === "block") {
        ({ stops, origin } = collectReadingStops(list, node, true));
        ({ step, cursorIndex } = resolve(stops));
      }
      // Showing the cursor is not a step, and jumps start a fresh read from their target.
      trajectory = granularity === "block" && cursorIndex >= 0 ? direction : null;
      if (!step) return;
      const pace = granularity === "block" ? "calm" : "quick";
      if (step.kind === "page") return glideBy(node, step.distance, pace);
      const target = stops[step.index]!;
      cursor = target;
      showInToolGroup(node);
      // `[[`/`]]` show why their target is a section, scrolled to or not.
      const cue = granularity === "section" ? flashReadingMarker : pulseReadingCursor;
      // Without a cursor, only an unread answer's start lands, back up the conversation.
      if (step.kind === "land" && cursorIndex < 0)
        currentTimeline.current.beforeScroll("away-from-end");
      if (step.kind === "land")
        land(list, node, target, origin, step.edge, step.line - base, pace, cue);
      else {
        showCursor(node);
        if (granularity === "section") cue();
      }
    };
    /** Vim `zt`/`zz`/`zb`: scrolls the cursor's block to the top, center, or bottom. */
    const place = (list: LegendListRef, node: HTMLElement, edge: ReadingEdge) => {
      trajectory = null;
      cursor ??= anchor(list, node);
      const element = cursor ? findReadingStopElement(node, cursor) : null;
      if (!cursor || !element) return;
      const base = scrollBase(node);
      const offset =
        readingPlacementLine(readingView(base, node.clientHeight, composerInset(node)), edge) -
        base;
      const rect = readingStopRect(element);
      const edgeAt =
        rect.top -
        node.getBoundingClientRect().top +
        node.scrollTop +
        rect.height * EDGE_SHARE[edge];
      currentTimeline.current.beforeScroll(edgeAt - offset > base ? "toward-end" : "away-from-end");
      land(list, node, cursor, null, edge, offset, "quick", pulseReadingCursor);
    };
    const cite = () => {
      const timeline = timelineNode();
      const insertCitation = currentTimeline.current.cite;
      if (!timeline || !insertCitation) return showModalFeedback("Nothing to cite here");
      const { list, node } = timeline;
      cursor ??= anchor(list, node);
      const block = cursor ? findReadingStopElement(node, cursor) : null;
      if (!block) return showModalFeedback("Nothing to cite here");
      showCursor(node);
      const captured = captureBlockCitation(block);
      if ("reason" in captured) return showModalFeedback(captured.reason);
      insertCitation(captured.citation, captured.anchor);
    };
    /**
     * Moves the cursor to a stop, scrolling only as far as it takes to show it. A stop whose row is
     * not mounted lands at the top from the list's estimate.
     */
    const reveal = (
      list: LegendListRef,
      node: HTMLElement,
      stop: Pick<ReadingStop, "key" | "rowId" | "block">,
    ) => {
      trajectory = null;
      cursor = stop;
      showInToolGroup(node);
      const base = scrollBase(node);
      const view = readingView(base, node.clientHeight, composerInset(node));
      const element = findReadingStopElement(node, stop);
      let edge: ReadingEdge | null = "top";
      if (element) {
        const rect = readingStopRect(element);
        const top = rect.top - node.getBoundingClientRect().top + node.scrollTop;
        edge = top < view.top ? "top" : top + rect.height > view.bottom ? "bottom" : null;
      }
      if (!edge) {
        showCursor(node);
        return pulseReadingCursor();
      }
      currentTimeline.current.beforeScroll(edge === "top" ? "away-from-end" : "toward-end");
      const offset = readingPlacementLine(view, edge) - base;
      const origin = element ? null : collectReadingStops(list, node, false).origin;
      land(list, node, stop, origin, edge, offset, "quick", pulseReadingCursor);
    };
    /** `h`/`l` on what folds (a changed-files card, a turn fold): open, close, step in or out. */
    const tree = (event: Event, motion: "in" | "out") => {
      const timeline = timelineNode();
      const element = timeline && cursor ? findReadingStopElement(timeline.node, cursor) : null;
      const action = element ? readingTreeMotion(element, motion) : null;
      if (!timeline || !action) return;
      event.preventDefault();
      if (action.kind === "click") return action.control.click();
      if (action.kind === "none") return;
      const { list, node } = timeline;
      if (action.kind === "next") {
        currentTimeline.current.beforeScroll("toward-end");
        return move(list, node, "block", "next");
      }
      const row = action.element?.closest<HTMLElement>("[data-timeline-row-id]");
      const block = row
        ? rowReadingStops(row).find((stop) => stop.element === action.element)?.block
        : ROW_START_BLOCK;
      if (block === undefined) return;
      reveal(list, node, { key: `${action.rowId}#${block}`, rowId: action.rowId, block });
    };
    /**
     * Enter on a stop with a control, such as a changed file, clicks it. On an HTML render it moves
     * focus into the page, whose unhandled Escape hands it back.
     */
    const activate = (event: Event) => {
      const node = timelineNode()?.node;
      const element = node && cursor ? findReadingStopElement(node, cursor) : null;
      const frame = element?.matches('[data-timeline-row-kind="html-render"]')
        ? element.querySelector("iframe")
        : null;
      if (frame) {
        event.preventDefault();
        frame.focus();
        return;
      }
      const control = element ? readingStopControl(element) : null;
      if (!control) return;
      event.preventDefault();
      control.click();
    };
    const onCommand = (event: Event) => {
      if (!enabled()) return;
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      const command = TIMELINE_COMMANDS.find((candidate) => candidate === detail);
      if (!command) return;
      if (command === "cite") return cite();
      if (command === "activate") return activate(event);
      if (command === "tree.in" || command === "tree.out")
        return tree(event, command === "tree.in" ? "in" : "out");
      const timeline = timelineNode();
      if (!timeline) return;
      const { list, node } = timeline;
      const placement = PLACEMENTS[command];
      if (placement) return place(list, node, placement);
      // Reading stops live follow even when the page stays still.
      currentTimeline.current.beforeScroll(
        command === "first" || command.endsWith("previous") || command === "scroll.up"
          ? "away-from-end"
          : "toward-end",
      );
      const motion = MOTIONS[command];
      if (motion) return move(list, node, ...motion);
      trajectory = null;
      if (command === "scroll.down" || command === "scroll.up")
        return glideBy(node, command === "scroll.down" ? 80 : -80);
      stopGlide();
      node.scrollTo({ top: command === "first" ? 0 : node.scrollHeight, behavior: "instant" });
    };
    /** Puts the cursor on the block holding an element, such as a render handing focus back. */
    const revealAt = (event: Event) => {
      const target: unknown = (event as CustomEvent<unknown>).detail;
      const timeline = timelineNode();
      if (!enabled() || !timeline || !(target instanceof HTMLElement)) return;
      const row = target.closest<HTMLElement>("[data-timeline-row-id]");
      const rowId = row?.dataset.timelineRowId;
      if (!row || !rowId || !timeline.node.contains(row)) return;
      const stops = rowReadingStops(row);
      const stop = stops.find((candidate) => candidate.element.contains(target)) ?? stops[0];
      if (!stop) return;
      reveal(timeline.list, timeline.node, {
        key: `${rowId}#${stop.block}`,
        rowId,
        block: stop.block,
      });
    };
    /**
     * A click puts the cursor on the block under it, in place: what was clicked is already in
     * view. Selecting text is not pointing at a block, so a drag leaves the cursor alone.
     */
    const clickAt = (event: MouseEvent) => {
      const timeline = timelineNode();
      const target = event.target;
      if (!enabled() || event.button !== 0 || !timeline || !(target instanceof Element)) return;
      if (window.getSelection()?.isCollapsed === false) return;
      const row = target.closest<HTMLElement>("[data-timeline-row-id]");
      const rowId = row?.dataset.timelineRowId;
      if (!row || !rowId || !timeline.node.contains(row)) return;
      const stops = rowReadingStops(row);
      // Between an answer's blocks, the nearest one.
      const distance = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        return Math.max(0, rect.top - event.clientY, event.clientY - rect.bottom);
      };
      const stop =
        stops.find((candidate) => candidate.element.contains(target)) ??
        stops.toSorted((left, right) => distance(left.element) - distance(right.element))[0];
      if (!stop) return;
      stopGlide();
      trajectory = null;
      cursor = { key: `${rowId}#${stop.block}`, rowId, block: stop.block };
      showCursor(timeline.node);
    };
    window.addEventListener(TIMELINE_COMMAND_EVENT, onCommand);
    window.addEventListener(READING_REVEAL_EVENT, revealAt);
    window.addEventListener("click", clickAt, true);
    schedule();
    return () => {
      window.removeEventListener(TIMELINE_COMMAND_EVENT, onCommand);
      window.removeEventListener(READING_REVEAL_EVENT, revealAt);
      window.removeEventListener("click", clickAt, true);
      unsubscribeLamp();
      if (followFrame !== null) cancelAnimationFrame(followFrame);
      watch(null);
      markReadingCursor(null, null, false);
      scheduleFollow.current = () => {};
      stopGlide();
      useModalKeyboardStore.setState({ threadContext: null });
    };
  }, []);
}
