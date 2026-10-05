import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { useModalKeyboardStore, type ModalSurface } from "./modalKeyboardStore";
import { registerAppCommands } from "./appCommands";
import {
  captureModalReturnFocus,
  focusModalSurface,
  modalGridTargetIndex,
  modalOverlayOpen,
  modalPickerFinalFocus,
  moveModalArea,
  moveModalFocus,
} from "./modalKeyboardDom";

function dialog({
  rightPanel = false,
  modal = true,
  nonblocking = false,
  role = "dialog",
  visible = true,
}: {
  rightPanel?: boolean;
  modal?: boolean;
  nonblocking?: boolean;
  role?: "alertdialog" | "dialog";
  visible?: boolean;
} = {}) {
  const attributes = new Map([
    ["role", role],
    ...(modal ? [["aria-modal", "true"] as const] : []),
    ...(rightPanel ? [["data-modal-right-panel-sheet", ""] as const] : []),
    ...(nonblocking ? [["data-modal-keyboard-nonblocking", ""] as const] : []),
  ]);
  return {
    dataset: {},
    hasAttribute: (name: string) => attributes.has(name),
    getClientRects: () => (visible ? [{ width: 500, height: 800 }] : []),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  useModalKeyboardStore.setState(useModalKeyboardStore.getInitialState(), true);
});

describe("workspace keyboard overlay detection", () => {
  it.each([true, false])(
    "keeps workspace commands available with the right-panel sheet (modal=%s)",
    (modal) => {
      // Beside the Grok rail the sheet remains a dialog, but stops being modal.
      // Both presentations belong to workspace navigation.
      vi.stubGlobal("document", {
        querySelectorAll: () => [dialog({ rightPanel: true, modal })],
      });

      expect(modalOverlayOpen()).toBe(false);
    },
  );

  it.each([true, false])(
    "suspends workspace commands for a separate visible dialog (modal=%s)",
    (modal) => {
      vi.stubGlobal("document", {
        querySelectorAll: () => [dialog({ rightPanel: true, modal: false }), dialog({ modal })],
      });

      expect(modalOverlayOpen()).toBe(true);
    },
  );

  it.each(["dialog", "alertdialog"] as const)(
    "keeps workspace commands available with a nonblocking %s notification",
    (role) => {
      vi.stubGlobal("document", {
        querySelectorAll: () => [dialog({ modal: false, nonblocking: true, role })],
      });

      expect(modalOverlayOpen()).toBe(false);
    },
  );

  it("restores workspace commands after a kept-mounted dialog becomes hidden", () => {
    vi.stubGlobal("document", {
      querySelectorAll: () => [
        dialog({ rightPanel: true, modal: false }),
        dialog({ visible: false }),
      ],
    });

    expect(modalOverlayOpen()).toBe(false);
  });
});

describe("horizontal modal navigation", () => {
  function setup(surface: ModalSurface, selected: number, length = 3) {
    const items = Array.from({ length }, () => ({
      matches: () => false,
      closest: () => null,
      getClientRects: () => [{}],
      contains: () => false,
      focus: vi.fn(),
      click: vi.fn(),
      scrollIntoView: vi.fn(),
    }));
    vi.stubGlobal("document", {
      activeElement: items[selected] ?? null,
      querySelector: () => ({ querySelectorAll: () => items }),
    });
    useModalKeyboardStore.setState({ surface, focusRequest: null });
    return items;
  }

  it("keeps h/l inside the conversation and sidebar", () => {
    for (const surface of ["conversation", "sidebar"] as const) {
      const items = setup(surface, 1);
      moveModalFocus("left");
      moveModalFocus("right");
      expect(useModalKeyboardStore.getState().focusRequest).toBeNull();
      expect(items.every((item) => item.focus.mock.calls.length === 0)).toBe(true);
    }
  });

  it("moves between areas with w h / w l, stopping at the outer edges", () => {
    useModalKeyboardStore.setState({ threadContext: null });
    setup("conversation", -1, 0);
    moveModalArea("left");
    expect(useModalKeyboardStore.getState().focusRequest).toBe("sidebar");
    setup("sidebar", 1);
    moveModalArea("left");
    expect(useModalKeyboardStore.getState().focusRequest).toBeNull();
    moveModalArea("right");
    expect(useModalKeyboardStore.getState().focusRequest).toBe("conversation");
    // Without a thread there is no right panel to enter.
    setup("conversation", -1, 0);
    moveModalArea("right");
    expect(useModalKeyboardStore.getState().focusRequest).toBeNull();
    setup("rightPanel", 0);
    moveModalArea("left");
    expect(useModalKeyboardStore.getState().focusRequest).toBe("conversation");
  });

  it("moves within Flow cards without activating them or leaving the row", () => {
    const items = setup("flow", 1);
    moveModalFocus("left");
    expect(items[0]?.focus).toHaveBeenCalledOnce();
    expect(items.every((item) => item.click.mock.calls.length === 0)).toBe(true);
    expect(useModalKeyboardStore.getState().focusRequest).toBeNull();
  });

  it("selects adjacent panel tabs and stays at the first tab", () => {
    const items = setup("rightPanel", 1);
    moveModalFocus("left");
    expect(items[0]?.focus).toHaveBeenCalledOnce();
    expect(items[0]?.click).toHaveBeenCalledOnce();
    expect(useModalKeyboardStore.getState().focusRequest).toBeNull();
    setup("rightPanel", 0);
    moveModalFocus("left");
    expect(useModalKeyboardStore.getState().focusRequest).toBeNull();
  });

  it("does nothing in an empty panel and clamps at the final tab", () => {
    setup("rightPanel", -1, 0);
    moveModalFocus("left");
    expect(useModalKeyboardStore.getState().focusRequest).toBeNull();
    const items = setup("rightPanel", 2);
    moveModalFocus("right");
    expect(items[2]?.focus).toHaveBeenCalledOnce();
    expect(useModalKeyboardStore.getState().focusRequest).toBeNull();
  });
});

describe("working-session grid navigation", () => {
  const rect = (left: number, top: number, width = 100, height = 100) => ({
    bottom: top + height,
    left,
    right: left + width,
    top,
  });

  it("moves horizontally within a row and vertically to the nearest column", () => {
    const rects = [rect(0, 0), rect(120, 0), rect(0, 120), rect(120, 120)];
    expect(modalGridTargetIndex(rects, 0, "right")).toBe(1);
    expect(modalGridTargetIndex(rects, 1, "left")).toBe(0);
    expect(modalGridTargetIndex(rects, 0, "next")).toBe(2);
    expect(modalGridTargetIndex(rects, 2, "previous")).toBe(0);
  });

  it("chooses the nearest horizontal position in a centered short row", () => {
    const rects = [rect(0, 0), rect(120, 0), rect(240, 0), rect(60, 120), rect(180, 120)];
    expect(modalGridTargetIndex(rects, 0, "next")).toBe(3);
    expect(modalGridTargetIndex(rects, 2, "next")).toBe(4);
    expect(modalGridTargetIndex(rects, 3, "previous")).toBe(0);
  });

  it("reports grid edges instead of wrapping to another row", () => {
    const rects = [rect(0, 0), rect(120, 0), rect(0, 120), rect(120, 120)];
    expect(modalGridTargetIndex(rects, 0, "left")).toBeNull();
    expect(modalGridTargetIndex(rects, 1, "right")).toBeNull();
    expect(modalGridTargetIndex(rects, 0, "previous")).toBeNull();
    expect(modalGridTargetIndex(rects, 3, "next")).toBeNull();
  });

  it("stops at both grid edges instead of leaving the grid", () => {
    const boxes = [rect(0, 0), rect(120, 0)];
    const items = boxes.map((box) => ({
      matches: () => false,
      closest: () => null,
      getClientRects: () => [box],
      getBoundingClientRect: () => box,
      contains: () => false,
      focus: vi.fn(),
      click: vi.fn(),
      scrollIntoView: vi.fn(),
    }));
    const root = {
      dataset: { modalGrid: "working-sessions" },
      querySelectorAll: () => items,
    };
    const documentState = {
      activeElement: items[0],
      querySelector: () => root,
    };
    vi.stubGlobal("document", documentState);
    useModalKeyboardStore.setState({ surface: "conversation", focusRequest: null });

    moveModalFocus("right");
    expect(items[1]?.focus).toHaveBeenCalledOnce();

    documentState.activeElement = items[0];
    moveModalFocus("left");
    expect(useModalKeyboardStore.getState().focusRequest).toBeNull();

    documentState.activeElement = items[1];
    moveModalFocus("right");
    expect(useModalKeyboardStore.getState().focusRequest).toBeNull();
    expect(items.every((item) => item.click.mock.calls.length === 0)).toBe(true);
  });
  it("re-lands on the remembered card when focus has left the cards", () => {
    const boxes = [rect(0, 0), rect(120, 0)];
    const documentState = { activeElement: null as unknown, querySelector: () => root };
    const items = boxes.map((box, index) => {
      const item = {
        dataset: { modalKey: `card-${index}` },
        matches: () => false,
        closest: () => null,
        getClientRects: () => [box],
        getBoundingClientRect: () => box,
        contains: () => false,
        focus: vi.fn(() => {
          documentState.activeElement = item;
        }),
        click: vi.fn(),
        scrollIntoView: vi.fn(),
      };
      return item;
    });
    const root = {
      dataset: { modalGrid: "working-sessions" },
      getClientRects: () => [{}],
      querySelectorAll: () => items,
      focus: vi.fn(),
    };
    // Focus sits on the grid root after a route change or app switch.
    documentState.activeElement = root;
    vi.stubGlobal("document", documentState);
    useModalKeyboardStore.setState({
      surface: "conversation",
      focusRequest: null,
      bookmarks: { conversation: { key: "card-1", index: 1 } },
    });

    moveModalFocus("next");

    expect(items[1]?.focus).toHaveBeenCalledOnce();
    expect(items[0]?.focus).not.toHaveBeenCalled();
  });
});

describe("right-panel focus destination", () => {
  function setup() {
    const tab = {
      dataset: {},
      matches: () => false,
      closest: () => null,
      getClientRects: () => [{}],
      getAttribute: () => "true",
      hasAttribute: () => true,
      scrollIntoView: vi.fn(),
      focus: vi.fn(() => {
        doc.activeElement = tab;
      }),
    };
    const content = {
      closest: () => null,
      focus: vi.fn(() => {
        doc.activeElement = content;
      }),
    };
    const root = {
      getClientRects: () => [{}],
      querySelectorAll: () => [tab],
      querySelector: () => ({ querySelector: () => content }),
    };
    const doc = { activeElement: null as unknown, querySelector: () => root };
    vi.stubGlobal("document", doc);
    return { tab, content, doc };
  }

  it("enters active content through the panel's handler", () => {
    const { tab, content, doc } = setup();
    const unregister = registerAppCommands((command) => {
      if (command !== "rightPanel.enter") return false;
      content.focus();
      return true;
    });
    try {
      expect(focusModalSurface("rightPanel")).toBe(true);
      expect(doc.activeElement).toBe(content);
      expect(tab.focus).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it("focuses content before a newly mounted panel registers its handler", () => {
    const { tab, content, doc } = setup();
    expect(focusModalSurface("rightPanel")).toBe(true);
    expect(doc.activeElement).toBe(content);
    expect(tab.focus).not.toHaveBeenCalled();
  });

  it("returns explicitly to the selected tab without reentering content", () => {
    const { tab, content, doc } = setup();
    expect(focusModalSurface("rightPanel", true)).toBe(true);
    expect(doc.activeElement).toBe(tab);
    expect(content.focus).not.toHaveBeenCalled();
  });
});

describe("composer picker return focus", () => {
  class FakeNode {
    isConnected = true;
    dataset: Record<string, string> = {};
    focus = vi.fn();

    constructor(private readonly kind: "control" | "trigger" | "editor") {}

    closest(selector: string) {
      if (selector === "[hidden]") return null;
      if (this.kind === "editor" && selector.includes("textarea")) return this;
      return null;
    }

    matches(selector: string) {
      if (this.kind === "trigger") return selector.includes("data-composer-shortcut");
      if (this.kind === "editor") return selector.includes("textarea");
      return false;
    }
  }

  function install(pathname: string) {
    vi.stubGlobal("HTMLElement", FakeNode);
    vi.stubGlobal("window", { location: { pathname } });
    vi.stubGlobal("document", { body: new FakeNode("control"), activeElement: null });
  }

  it("restores the control captured before the picker trigger and returns to normal mode", async () => {
    install("/thread");
    const conversation = new FakeNode("control");
    const trigger = new FakeNode("trigger");
    useModalKeyboardStore.setState({ mode: "insert" });

    captureModalReturnFocus(conversation as unknown as EventTarget);
    captureModalReturnFocus(trigger as unknown as EventTarget);
    expect(modalPickerFinalFocus(true)).toBe(false);
    expect(useModalKeyboardStore.getState().mode).toBe("normal");

    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(conversation.focus).toHaveBeenCalledOnce();
    expect(trigger.focus).not.toHaveBeenCalled();
  });

  it("returns to normal mode when the picker has no saved control", () => {
    install("/no-saved-control");
    useModalKeyboardStore.setState({ mode: "insert" });

    expect(modalPickerFinalFocus(true)).toBe(false);
    expect(useModalKeyboardStore.getState().mode).toBe("normal");
  });

  it("keeps insert mode when the saved control is the composer", () => {
    install("/composer");
    const editor = new FakeNode("editor");
    useModalKeyboardStore.setState({ mode: "insert" });

    captureModalReturnFocus(editor as unknown as EventTarget);
    expect(modalPickerFinalFocus(true)).toBe(false);
    expect(useModalKeyboardStore.getState().mode).toBe("insert");
  });

  it("leaves focus alone when vim navigation is off", () => {
    install("/plain");
    const conversation = new FakeNode("control");
    useModalKeyboardStore.setState({ mode: "insert" });

    captureModalReturnFocus(conversation as unknown as EventTarget);
    expect(modalPickerFinalFocus(false)).toBeNull();
    expect(conversation.focus).not.toHaveBeenCalled();
    expect(useModalKeyboardStore.getState().mode).toBe("insert");
  });
});
