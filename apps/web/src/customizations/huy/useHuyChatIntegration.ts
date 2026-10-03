import { useEffect, useLayoutEffect, useRef } from "react";
import { getClientSettings } from "../../hooks/useSettings";
import type { ModalThreadContext } from "../../modalKeyboardCommands";
import { useModalKeyboardStore } from "../../modalKeyboardStore";

type TimelineHost = {
  getScrollableNode: () => unknown;
  beforeScroll: (direction: "toward-end" | "away-from-end") => void;
};

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
    const moveTimeline = (event: Event) => {
      if (!getClientSettings().modalKeyboardEnabled) return;
      const motion: unknown = (event as CustomEvent<unknown>).detail;
      if (motion !== "first" && motion !== "last" && motion !== "next" && motion !== "previous")
        return;
      const host = currentTimeline.current;
      const node = host.getScrollableNode();
      if (!(node instanceof HTMLElement)) return;
      host.beforeScroll(motion === "next" || motion === "last" ? "toward-end" : "away-from-end");
      const top =
        motion === "first"
          ? 0
          : motion === "last"
            ? node.scrollHeight
            : node.scrollTop + (motion === "next" ? 80 : -80);
      node.scrollTo({ top, behavior: "instant" });
    };
    window.addEventListener("t3code:modal-timeline-motion", moveTimeline);
    return () => {
      window.removeEventListener("t3code:modal-timeline-motion", moveTimeline);
      useModalKeyboardStore.setState({ threadContext: null });
    };
  }, []);
}
