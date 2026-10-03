import type { LegendListRef } from "@legendapp/list/react";
import { CHAT_LIST_ANCHOR_OFFSET } from "@t3tools/shared/chatList";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { MessagesTimelineRow } from "../../components/chat/MessagesTimeline.logic";
import { getClientSettings } from "../../hooks/useSettings";
import type { ModalThreadContext } from "../../modalKeyboardCommands";
import { useModalKeyboardStore } from "../../modalKeyboardStore";

type TimelineHost = {
  getList: () => LegendListRef | null;
  beforeScroll: (direction: "toward-end" | "away-from-end") => void;
};

/**
 * Picks the user row J/K lands on, starting from the row at the reading line. K first returns
 * to the start of a user message the reader is partway through.
 */
export function userMessageJumpIndex(
  isUser: readonly boolean[],
  current: number,
  aligned: boolean,
  direction: "next" | "previous",
): number | null {
  if (direction === "previous" && !aligned && isUser[current]) return current;
  const step = direction === "next" ? 1 : -1;
  for (let index = current + step; index >= 0 && index < isUser.length; index += step)
    if (isUser[index]) return index;
  return null;
}

/** Outlines the landed bubble briefly so the eye finds it; a snapped row may mount a few frames late. */
function flashUserMessage(node: HTMLElement, rowId: string, attempts = 6) {
  requestAnimationFrame(() => {
    const bubble = node.querySelector<HTMLElement>(
      `[data-timeline-row-id="${CSS.escape(rowId)}"] [data-user-message-bubble]`,
    );
    if (!bubble) {
      if (attempts > 0) flashUserMessage(node, rowId, attempts - 1);
      return;
    }
    bubble.removeAttribute("data-modal-flash");
    void bubble.offsetWidth; // Restart the animation when landing on the same bubble again.
    bubble.setAttribute("data-modal-flash", "");
    bubble.addEventListener("animationend", () => bubble.removeAttribute("data-modal-flash"), {
      once: true,
    });
  });
}

/** The chat publishes capabilities and timeline access; modal policy stays outside ChatView. */
export function useHuyChatIntegration(context: ModalThreadContext, timeline: TimelineHost) {
  const currentTimeline = useRef(timeline);
  useLayoutEffect(() => {
    currentTimeline.current = timeline;
    const previous = useModalKeyboardStore.getState().threadContext;
    if (
      !previous ||
      (Object.keys(context) as (keyof ModalThreadContext)[]).some(
        (key) => previous[key] !== context[key],
      )
    )
      useModalKeyboardStore.setState({ threadContext: context });
  });
  useEffect(() => {
    // j/k ease toward an accumulating target so held keys glide instead of stepping. J/K glide
    // faster toward a message, re-reading its position as rows measure, then snap onto it.
    type Glide = {
      node: HTMLElement;
      target: number;
      expected: number;
      frame: number;
      time: number;
      tau: number;
      jump: { index: number; target: () => number; snap: () => void } | null;
    };
    let glide: Glide | null = null;
    const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clampScroll = (node: HTMLElement, top: number) =>
      Math.max(0, Math.min(node.scrollHeight - node.clientHeight, top));
    const stopGlide = () => {
      if (glide) cancelAnimationFrame(glide.frame);
      glide = null;
    };
    const stepGlide = (now: number) => {
      if (!glide) return;
      const { node, jump } = glide;
      // A wheel, drag, or layout jump moved the timeline under us; yield to it.
      if (Math.abs(node.scrollTop - glide.expected) > 1) {
        stopGlide();
        return jump?.snap();
      }
      if (jump) glide.target = jump.target();
      const factor = 1 - Math.exp(-Math.max(0, now - glide.time) / glide.tau);
      glide.time = now;
      const remaining = glide.target - node.scrollTop;
      if (Math.abs(remaining) < 1) {
        node.scrollTop = glide.target;
        stopGlide();
        return jump?.snap();
      }
      node.scrollTop += remaining * factor;
      glide.expected = node.scrollTop;
      glide.frame = requestAnimationFrame(stepGlide);
    };
    const glideTo = (node: HTMLElement, target: number, tau: number, jump: Glide["jump"]) => {
      if (glide?.node === node) {
        Object.assign(glide, { target, tau, jump });
        return;
      }
      stopGlide();
      glide = {
        node,
        target,
        tau,
        jump,
        expected: node.scrollTop,
        time: performance.now(),
        frame: requestAnimationFrame(stepGlide),
      };
    };
    const glideBy = (node: HTMLElement, delta: number) => {
      const base = glide?.node === node && !glide.jump ? glide.target : node.scrollTop;
      const target = clampScroll(node, base + delta);
      if (reducedMotion()) {
        stopGlide();
        node.scrollTop = target;
        return;
      }
      glideTo(node, target, 60, null);
    };
    const jumpToUserMessage = (list: LegendListRef, direction: "next" | "previous") => {
      const state = list.getState();
      const rows = state.data as readonly MessagesTimelineRow[];
      const node = list.getScrollableNode();
      const nodeTop = node.getBoundingClientRect().top;
      const line = nodeTop + CHAT_LIST_ANCHOR_OFFSET;
      let current = -1;
      let currentTop = -Infinity;
      // Scroll offset of list position 0, which includes Legend's header and padding.
      let origin: number | null = null;
      for (const element of node.querySelectorAll<HTMLElement>("[data-timeline-row-id]")) {
        const index = state.indexByKey(element.dataset.timelineRowId ?? "");
        const position = index === undefined ? undefined : state.positionAtIndex(index);
        if (index === undefined || position === undefined) continue;
        const top = element.getBoundingClientRect().top;
        origin ??= top - nodeTop + node.scrollTop - position;
        if (top > line + 2 || top <= currentTop) continue;
        current = index;
        currentTop = top;
      }
      let aligned = Math.abs(currentTop - line) <= 2;
      // Mid-glide positions are stale, so repeats continue from the message in flight.
      if (glide?.jump) {
        current = glide.jump.index;
        aligned = true;
      }
      const isUser = rows.map((row) => row.kind === "message" && row.message.role === "user");
      const index = userMessageJumpIndex(isUser, current, aligned, direction);
      if (index === null) return;
      const rowId = rows[index]?.id ?? "";
      const snap = () => {
        void list.scrollToIndex({
          index,
          animated: false,
          viewPosition: 0,
          viewOffset: CHAT_LIST_ANCHOR_OFFSET,
        });
        flashUserMessage(node, rowId);
      };
      const position = state.positionAtIndex(index);
      if (origin === null || position === undefined || reducedMotion()) {
        stopGlide();
        return snap();
      }
      const base = origin;
      const target = () =>
        clampScroll(
          node,
          base + (list.getState().positionAtIndex(index) ?? position) - CHAT_LIST_ANCHOR_OFFSET,
        );
      glideTo(node, target(), 30, { index, target, snap });
    };
    const moveTimeline = (event: Event) => {
      if (!getClientSettings().modalKeyboardEnabled) return;
      const motion: unknown = (event as CustomEvent<unknown>).detail;
      if (
        motion !== "first" &&
        motion !== "last" &&
        motion !== "next" &&
        motion !== "previous" &&
        motion !== "message.next" &&
        motion !== "message.previous"
      )
        return;
      const host = currentTimeline.current;
      const list = host.getList();
      const node: unknown = list?.getScrollableNode();
      if (!list || !(node instanceof HTMLElement)) return;
      host.beforeScroll(
        motion === "next" || motion === "last" || motion === "message.next"
          ? "toward-end"
          : "away-from-end",
      );
      if (motion === "message.next" || motion === "message.previous")
        return jumpToUserMessage(list, motion === "message.next" ? "next" : "previous");
      if (motion === "next" || motion === "previous")
        return glideBy(node, motion === "next" ? 80 : -80);
      stopGlide();
      node.scrollTo({ top: motion === "first" ? 0 : node.scrollHeight, behavior: "instant" });
    };
    window.addEventListener("t3code:modal-timeline-motion", moveTimeline);
    return () => {
      window.removeEventListener("t3code:modal-timeline-motion", moveTimeline);
      stopGlide();
      useModalKeyboardStore.setState({ threadContext: null });
    };
  }, []);
}
