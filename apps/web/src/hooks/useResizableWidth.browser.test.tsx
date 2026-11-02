/* oxlint-disable t3code/require-disposable-render -- These fixtures reset synthetic globals and any mounted root together in teardown to exercise keyboard and focus lifetimes. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { render as renderResponsive } from "../../test/render";
import { RESIZABLE_WIDTH_PROPERTY, useResizableWidth } from "./useResizableWidth";

let root: Root;
let container: HTMLDivElement;
let captured = false;
let frame: FrameRequestCallback | undefined;
const cancelAnimationFrame = vi.fn();
let setItem: ReturnType<typeof vi.spyOn<Storage, "setItem">>;

function Panel({
  edge = "left",
  maxWidth = 800,
  storageKey = "test-panel-width",
}: {
  edge?: "left" | "right";
  maxWidth?: number;
  storageKey?: string;
}) {
  const { width, handlers, resizeBy } = useResizableWidth({
    storageKey,
    defaultWidth: 400,
    minWidth: 200,
    maxWidth,
    edge,
  });
  return (
    <aside data-testid="host">
      <output>{width}</output>
      <button
        onClick={() => {
          resizeBy(150);
          resizeBy(150);
        }}
      >
        Grow twice
      </button>
      <button onClick={() => resizeBy(150)}>Grow</button>
      <button onClick={() => resizeBy(-1000)}>Shrink</button>
      <div data-testid="handle" {...handlers} />
    </aside>
  );
}

const host = () => container.querySelector<HTMLElement>("[data-testid=host]")!;
const shownWidth = () => Number(container.querySelector("output")!.textContent);
const liveWidth = () => host().style.getPropertyValue(RESIZABLE_WIDTH_PROPERTY);
const bodyStyle = () => document.body.style;

function handle() {
  const element = container.querySelector<HTMLElement>("[data-testid=handle]")!;
  // Synthetic pointers have no active pointer for the browser to capture.
  element.setPointerCapture = () => {
    captured = true;
  };
  element.hasPointerCapture = () => captured;
  element.releasePointerCapture = () => {
    captured = false;
  };
  return element;
}

function pointer(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "lostpointercapture",
  clientX = 100,
) {
  handle().dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX }),
  );
}

async function render(element = <Panel />) {
  await act(() => root.render(element));
}

async function mountFresh(element = <Panel />) {
  root = createRoot(container);
  await render(element);
}

beforeEach(async () => {
  localStorage.clear();
  captured = false;
  frame = undefined;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 42;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(cancelAnimationFrame);
  setItem = vi.spyOn(Storage.prototype, "setItem");
  container = document.createElement("div");
  document.body.append(container);
  await mountFresh();
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  cancelAnimationFrame.mockClear();
});

describe("panel resize cleanup", () => {
  it.each(["unmount", "lost capture", "blur", "cancel"])(
    "clears the cursor and pending resize after %s",
    async (reason) => {
      await act(() => {
        pointer("pointerdown");
        pointer("pointermove", 50);
      });
      const resizedHost = host();
      await act(() => frame?.(0));
      expect(liveWidth()).toBe("450px");
      expect(resizedHost.style.getPropertyValue("transition-property")).toBe("none");
      expect(shownWidth()).toBe(400);
      await act(() => pointer("pointermove", 25));
      expect(bodyStyle().cursor).toBe("col-resize");
      expect(bodyStyle().userSelect).toBe("none");
      await act(() => {
        if (reason === "unmount") root.unmount();
        if (reason === "lost capture") pointer("lostpointercapture");
        if (reason === "blur") window.dispatchEvent(new Event("blur"));
        if (reason === "cancel") pointer("pointercancel");
      });
      expect(bodyStyle().cursor).toBe("");
      expect(bodyStyle().userSelect).toBe("");
      expect(captured).toBe(false);
      expect(resizedHost.style.getPropertyValue("transition-property")).toBe("");
      expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
      if (reason === "unmount") {
        expect(setItem).not.toHaveBeenCalled();
        await mountFresh();
      } else {
        expect(shownWidth()).toBe(475);
        expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "475");
      }
    },
  );

  it.each(["left", "right"] as const)(
    "uses the release position for a fast %s-edge drag",
    async (edge) => {
      await render(<Panel edge={edge} />);
      await act(() => {
        pointer("pointerdown");
        pointer("pointermove", edge === "left" ? 50 : 150);
        pointer("pointerup", edge === "left" ? 25 : 175);
      });
      expect(shownWidth()).toBe(475);
      expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "475");
      expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    },
  );

  it.each([
    [800, 450],
    [450, 800],
  ])("uses updated bounds during a drag from max %s to %s", async (initialMax, nextMax) => {
    await render(<Panel maxWidth={initialMax} />);
    await act(() => {
      pointer("pointerdown");
      pointer("pointermove", -200);
    });
    await act(() => frame?.(0));
    expect(liveWidth()).toBe(`${Math.min(700, initialMax)}px`);
    await render(<Panel maxWidth={nextMax} />);
    await act(() => pointer("pointermove", -250));
    await act(() => frame?.(0));
    expect(liveWidth()).toBe(`${Math.min(750, nextMax)}px`);
    await act(() => pointer("pointerup", -300));
    expect(shownWidth()).toBe(nextMax);
    expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", String(nextMax));
  });

  it("handles release before any move event", async () => {
    await act(() => {
      pointer("pointerdown");
      pointer("pointerup", 25);
    });
    expect(shownWidth()).toBe(475);
    expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "475");
  });

  it("clamps the release position to the panel bounds", async () => {
    await act(() => {
      pointer("pointerdown");
      pointer("pointerup", -1000);
    });
    expect(shownWidth()).toBe(800);
    expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "800");
  });

  it("saves the final width when release is followed by lost capture", async () => {
    await act(() => {
      pointer("pointerdown");
      pointer("pointermove", 50);
      pointer("pointerup", 50);
      pointer("lostpointercapture", 50);
    });
    expect(shownWidth()).toBe(450);
    expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "450");
    expect(bodyStyle().cursor).toBe("");
    expect(captured).toBe(false);
  });
});

describe("panel width storage changes", () => {
  it("restores separate thread widths without remounting and retains them after reload", async () => {
    await act(() => {
      pointer("pointerdown");
      pointer("pointermove", 50);
      pointer("pointerup", 50);
    });
    expect(shownWidth()).toBe(450);
    await render(<Panel storageKey="thread-b" />);
    expect(shownWidth()).toBe(400);
    await act(() => {
      pointer("pointerdown");
      pointer("pointermove", -100);
      pointer("pointerup", -100);
    });
    expect(shownWidth()).toBe(600);
    await render(<Panel />);
    expect(shownWidth()).toBe(450);
    await act(() => root.unmount());
    await mountFresh(<Panel storageKey="thread-b" />);
    expect(shownWidth()).toBe(600);
  });

  it("cancels an unfinished drag on a thread switch without saving it to either thread", async () => {
    localStorage.setItem("thread-b", "650");
    setItem.mockClear();
    await act(() => {
      pointer("pointerdown");
      pointer("pointermove", 50);
    });
    await act(() => frame?.(0));
    expect(liveWidth()).toBe("450px");
    await act(() => pointer("pointermove", 25));
    await render(<Panel storageKey="thread-b" />);
    expect(shownWidth()).toBe(650);
    expect(liveWidth()).toBe("650px");
    expect(captured).toBe(false);
    expect(bodyStyle().cursor).toBe("");
    await act(() => {
      frame?.(0);
      pointer("pointerup", 25);
    });
    expect(shownWidth()).toBe(650);
    expect(setItem).not.toHaveBeenCalled();
    await render(<Panel />);
    expect(shownWidth()).toBe(400);
  });
});

describe("keyboard resizing", () => {
  it("accumulates repeated steps, clamps them, and persists the width", async () => {
    await act(() => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(shownWidth()).toBe(700);
    expect(localStorage.getItem("test-panel-width")).toBe("700");
    await act(() => container.querySelectorAll<HTMLButtonElement>("button")[1]!.click());
    expect(shownWidth()).toBe(800);
    await act(() => container.querySelectorAll<HTMLButtonElement>("button")[2]!.click());
    expect(shownWidth()).toBe(200);
    expect(localStorage.getItem("test-panel-width")).toBe("200");
  });
});

const STORAGE_KEY = "test:responsive-panel-width";

function ResponsivePanel({ defaultWidth }: { defaultWidth: number }) {
  const { width, setWidth, handlers } = useResizableWidth({
    storageKey: STORAGE_KEY,
    defaultWidth,
    minWidth: 160,
    maxWidth: 560,
    edge: "left",
  });
  return (
    <>
      <button onClick={() => setWidth(350)}>{width}</button>
      <div role="separator" style={{ width: 8, height: 40 }} {...handlers} />
    </>
  );
}

describe("useResizableWidth", () => {
  it("follows a responsive default until the user saves a width", async () => {
    const previous = localStorage.getItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    try {
      // This hook only needs browser storage and React; no navigation is involved.
      await using screen = await renderResponsive(<ResponsivePanel defaultWidth={320} />, {
        router: false,
      });
      expect(screen.container.textContent).toBe("320");
      await screen.rerender(<ResponsivePanel defaultWidth={200} />);
      expect(screen.container.textContent).toBe("200");

      await act(() => screen.container.querySelector("button")!.click());
      await screen.rerender(<ResponsivePanel defaultWidth={180} />);
      expect(screen.container.textContent).toBe("350");

      await screen.unmount();
      await using restored = await renderResponsive(<ResponsivePanel defaultWidth={200} />, {
        router: false,
      });
      expect(restored.container.textContent).toBe("350");
    } finally {
      if (previous === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, previous);
    }
  });

  it("keeps the default responsive after a stationary click and persists an actual drag", async () => {
    const previous = localStorage.getItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    try {
      // This hook only needs browser storage and React; no navigation is involved.
      await using screen = await renderResponsive(<ResponsivePanel defaultWidth={240} />, {
        router: false,
      });
      await screen.getByRole("separator").click();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      await screen.rerender(<ResponsivePanel defaultWidth={256} />);
      expect(screen.container.textContent).toBe("256");

      const handle = screen.container.querySelector<HTMLElement>('[role="separator"]')!;
      // Synthetic drag events have no active browser pointer to capture.
      using _capture = vi.spyOn(handle, "setPointerCapture").mockImplementation(() => {});
      const pointer = { bubbles: true, pointerId: 1, button: 0 };
      await act(() => {
        handle.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, clientX: 500 }));
      });
      await screen.rerender(<ResponsivePanel defaultWidth={280} />);
      await act(() => {
        handle.dispatchEvent(new PointerEvent("pointerup", { ...pointer, clientX: 500 }));
      });
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(screen.container.style.getPropertyValue(RESIZABLE_WIDTH_PROPERTY)).toBe("280px");

      await act(() => {
        handle.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, clientX: 500 }));
        handle.dispatchEvent(new PointerEvent("pointerup", { ...pointer, clientX: 450 }));
      });
      expect(localStorage.getItem(STORAGE_KEY)).toBe("330");
      await screen.rerender(<ResponsivePanel defaultWidth={200} />);
      expect(screen.container.textContent).toBe("330");
    } finally {
      if (previous === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, previous);
    }
  });
});
