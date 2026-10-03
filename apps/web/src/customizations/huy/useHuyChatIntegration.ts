import type { LegendListRef } from "@legendapp/list/react";
import type { AssistantCitation } from "@t3tools/contracts";
import { useEffect, useLayoutEffect, useRef } from "react";
import { getClientSettings } from "../../hooks/useSettings";
import type { AssistantCitationSourceAnchor } from "../../lib/assistantTextSelection";
import type { ModalThreadContext } from "../../modalKeyboardCommands";
import { showModalFeedback, useModalKeyboardStore } from "../../modalKeyboardStore";
import { captureBlockCitation } from "./readingCite";
import {
  flashReadingMarker,
  markReadingCursor,
  pulseReadingCursor,
  useReadingLampStore,
} from "./readingCursor";
import {
  collectReadingStops,
  findReadingStopElement,
  readingAnchor,
  readingView,
  resolveReadingStep,
  visibleReadingStops,
  type ReadingDirection,
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
  "cite",
] as const;
export type TimelineCommand = (typeof TIMELINE_COMMANDS)[number];

const TIMELINE_COMMAND_EVENT = "t3code:modal-timeline-command";

/** The open conversation owns scrolling and follow state, so Vim commands reach it by event. */
export function dispatchTimelineCommand(command: TimelineCommand): void {
  window.dispatchEvent(new CustomEvent(TIMELINE_COMMAND_EVENT, { detail: command }));
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
        watched.node.removeEventListener("scroll", schedule);
        for (const type of USER_SCROLL_EVENTS)
          watched.node.removeEventListener(type, noteUserInput);
        watched.observer.disconnect();
      }
      watched = null;
      if (!node) return;
      const observer = new MutationObserver(schedule);
      observer.observe(node, { childList: true, subtree: true });
      node.addEventListener("scroll", schedule, { passive: true });
      for (const type of USER_SCROLL_EVENTS)
        node.addEventListener(type, noteUserInput, { passive: true });
      watched = { node, observer };
    };
    const showCursor = (node: HTMLElement) => {
      const lamp = enabled() && lampOn();
      const element = cursor && enabled() ? findReadingStopElement(node, cursor) : null;
      markReadingCursor(element ? node : null, element, lamp);
      watch(cursor || lamp ? node : null);
    };
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
          if (rect.bottom <= view.top || rect.top >= view.bottom) cursor = null;
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
      stop: ReadingStop,
      origin: number | null,
      edge: "top" | "bottom",
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
          const rect = element.getBoundingClientRect();
          const top = rect.top - node.getBoundingClientRect().top + node.scrollTop;
          return edge === "top" ? top : top + rect.height;
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
      const resolve = (stops: readonly ReadingStop[]) => {
        const cursorIndex = cursor ? stops.findIndex((stop) => stop.key === cursor?.key) : -1;
        const step = resolveReadingStep({
          stops,
          cursor: cursorIndex,
          granularity,
          direction,
          view,
          trajectory,
        });
        return { step, cursorIndex };
      };
      // Block steps stay within the mounted rows, so they skip walking the whole list unless
      // they reach its edge; jumps may need rows that are not mounted.
      let { stops, origin } = collectReadingStops(list, node, granularity !== "block");
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
      // `h`/`l` show why their target is a section, scrolled to or not.
      const cue = granularity === "section" ? flashReadingMarker : pulseReadingCursor;
      if (step.kind === "land")
        land(list, node, target, origin, step.edge, step.line - base, pace, cue);
      else {
        showCursor(node);
        if (granularity === "section") cue();
      }
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
    const onCommand = (event: Event) => {
      if (!enabled()) return;
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      const command = TIMELINE_COMMANDS.find((candidate) => candidate === detail);
      if (!command) return;
      if (command === "cite") return cite();
      const timeline = timelineNode();
      if (!timeline) return;
      const { list, node } = timeline;
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
    window.addEventListener(TIMELINE_COMMAND_EVENT, onCommand);
    schedule();
    return () => {
      window.removeEventListener(TIMELINE_COMMAND_EVENT, onCommand);
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
