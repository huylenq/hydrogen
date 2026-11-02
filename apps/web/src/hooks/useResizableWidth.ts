import * as Schema from "effect/Schema";
import { type PointerEvent as ReactPointerEvent, useLayoutEffect, useRef, useState } from "react";

import { getLocalStorageItem, setLocalStorageItem } from "./useLocalStorage";
import { useResizeDrag } from "./useResizeDrag";

const WidthSchema = Schema.Finite;

/** The host must size itself from this custom property. */
export const RESIZABLE_WIDTH_PROPERTY = "--resizable-width";

export interface UseResizableWidthOptions {
  readonly storageKey: string;
  readonly defaultWidth: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly edge: "left" | "right";
}

export interface ResizableWidthHandlers {
  readonly ref: (node: HTMLElement | null) => (() => void) | undefined;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => void;
}

/** Persist on drag end to avoid a storage write on every animation frame. */
export function useResizableWidth(options: UseResizableWidthOptions): {
  readonly width: number;
  readonly setWidth: (width: number) => void;
  readonly handlers: ResizableWidthHandlers;
  /** Grows (or, with a negative delta, shrinks) the panel within its bounds and persists it. */
  readonly resizeBy: (delta: number) => void;
} {
  const { storageKey, defaultWidth, minWidth, maxWidth, edge } = options;

  const clamp = (value: number): number => {
    if (!Number.isFinite(value)) return defaultWidth;
    return Math.max(minWidth, Math.min(maxWidth, value));
  };

  const readWidth = () => {
    if (typeof window === "undefined") return defaultWidth;
    try {
      const stored = getLocalStorageItem(storageKey, WidthSchema);
      return clamp(stored ?? defaultWidth);
    } catch (error) {
      console.error("Could not read persisted panel width.", error);
      return defaultWidth;
    }
  };
  const [widthState, setWidthState] = useState(() => ({ storageKey, width: readWidth() }));
  if (widthState.storageKey !== storageKey) {
    setWidthState({ storageKey, width: readWidth() });
  }

  const clampedWidth = clamp(widthState.width);
  const latestOptions = useRef({ clamp, storageKey, width: clampedWidth });
  const persist = (key: string, width: number) => {
    try {
      setLocalStorageItem(key, width, WidthSchema);
    } catch (error) {
      console.error("Could not persist panel width.", error);
    }
  };
  const resizeBy = (delta: number) => {
    const current = latestOptions.current;
    const width = current.clamp(current.width + delta);
    // Held keys can step again before the next render.
    latestOptions.current = { ...current, width };
    setWidthState({ storageKey: current.storageKey, width });
    persist(current.storageKey, width);
  };

  const commitWidth = (nextStorageKey: string, nextWidth: number) => {
    // Resizing remains usable for this session when browser storage is unavailable.
    setWidthState({ storageKey: nextStorageKey, width: nextWidth });
    try {
      setLocalStorageItem(nextStorageKey, nextWidth, WidthSchema);
    } catch (error) {
      console.error("Could not persist panel width.", error);
    }
  };

  const drag = useResizeDrag<HTMLElement>((event) => {
    const host = event.currentTarget.parentElement;
    // Disable drag transitions through transition-property; the host renders transition-duration.
    host?.style.setProperty("transition-property", "none");
    // Capture the originating thread; switching storage keys cancels this drag.
    const startStorageKey = storageKey;
    const startWidth = clampedWidth;
    return {
      width: startWidth,
      edge,
      bounds: { min: minWidth, max: maxWidth },
      resize(nextWidth) {
        host?.style.setProperty(RESIZABLE_WIDTH_PROPERTY, `${nextWidth}px`);
        return nextWidth;
      },
      finish(finalWidth) {
        commitWidth(startStorageKey, finalWidth);
      },
      cleanup(committed) {
        host?.style.removeProperty("transition-property");
        if (!committed) {
          host?.style.setProperty(RESIZABLE_WIDTH_PROPERTY, `${latestOptions.current.width}px`);
        }
      },
    };
  });

  // Bounds can change mid-drag (sidebar opens, window narrows), and the render
  // that carries them rewrites the committed width, so re-apply the live pointer position.
  const { cancel, refresh } = drag;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Commits held-key options and abandons the old thread's drag using the new width before paint.
  useLayoutEffect(() => {
    const changedThread = latestOptions.current.storageKey !== storageKey;
    latestOptions.current = { clamp, storageKey, width: clampedWidth };
    if (changedThread) cancel();
  }, [cancel, clamp, clampedWidth, storageKey]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reapplies the live drag pointer position to the DOM before paint when the bounds change
  useLayoutEffect(() => refresh({ min: minWidth, max: maxWidth }), [refresh, minWidth, maxWidth]);

  return {
    width: clampedWidth,
    resizeBy,
    setWidth: (value) => commitWidth(storageKey, clamp(value)),
    handlers: {
      ref: drag.ref,
      onPointerDown: drag.onPointerDown,
      onPointerMove: drag.onPointerMove,
      onPointerUp: drag.onPointerUp,
      onPointerCancel: drag.onPointerCancel,
      onLostPointerCapture: drag.onLostPointerCapture,
    },
  };
}
