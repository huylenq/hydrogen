// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

type PanelFocus = typeof import("./panelFocus");
let panelFocus: PanelFocus;

function element(parent: HTMLElement, tag = "div"): HTMLElement {
  const node = document.createElement(tag);
  node.tabIndex = -1;
  parent.append(node);
  return node;
}

/** A right panel's content with a diff panel whose toolbar has a button. */
function rightPanel() {
  const outside = element(document.body, "button");
  const content = element(document.body);
  const shell = element(content);
  const toolbarButton = element(shell, "button");
  return { outside, content, shell, toolbarButton };
}

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

beforeEach(async () => {
  vi.resetModules();
  panelFocus = await import("./panelFocus");
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("right-panel focus", () => {
  it("keeps an entry pending until the surface's anchor mounts, then prefers its viewer", () => {
    const { content, shell } = rightPanel();
    expect(panelFocus.enterPanelContent(content, () => content)).toBe(content);

    panelFocus.registerPanelFocusAnchor(shell);
    expect(document.activeElement).toBe(shell);

    const viewer = element(shell);
    panelFocus.registerPanelFocusAnchor(viewer);
    expect(document.activeElement).toBe(viewer);
  });

  it("enters straight into the best anchor once it exists", () => {
    const { content, shell } = rightPanel();
    const viewer = element(shell);
    panelFocus.registerPanelFocusAnchor(shell);
    panelFocus.registerPanelFocusAnchor(viewer);
    expect(panelFocus.enterPanelContent(content, () => content)).toBe(viewer);
    expect(document.activeElement).toBe(viewer);
  });

  it("hands focus from a remounted viewer to its replacement", async () => {
    const { content, shell } = rightPanel();
    panelFocus.registerPanelFocusAnchor(shell);
    const viewer = element(shell);
    const unregister = panelFocus.registerPanelFocusAnchor(viewer);
    panelFocus.enterPanelContent(content, () => content);
    expect(document.activeElement).toBe(viewer);

    viewer.remove();
    unregister();
    await flush();
    expect(document.activeElement).toBe(shell);

    const replacement = element(shell);
    panelFocus.registerPanelFocusAnchor(replacement);
    expect(document.activeElement).toBe(replacement);
  });

  it("leaves focus the reader moved: elsewhere, onto a control, or by pointer", async () => {
    const { outside, content, shell, toolbarButton } = rightPanel();
    panelFocus.enterPanelContent(content, () => content);
    outside.focus();
    panelFocus.registerPanelFocusAnchor(shell);
    expect(document.activeElement).toBe(outside);

    shell.focus();
    toolbarButton.focus();
    const viewer = element(shell);
    const unregister = panelFocus.registerPanelFocusAnchor(viewer);
    expect(document.activeElement).toBe(toolbarButton);
    unregister();
    viewer.remove();
    await flush();
    expect(document.activeElement).toBe(toolbarButton);

    // A click outside ends the panel's claim: a later remount leaves focus where it fell.
    const owned = rightPanel();
    panelFocus.registerPanelFocusAnchor(owned.shell);
    const ownedViewer = element(owned.shell);
    const unregisterOwned = panelFocus.registerPanelFocusAnchor(ownedViewer);
    panelFocus.enterPanelContent(owned.content, () => owned.content);
    expect(document.activeElement).toBe(ownedViewer);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    ownedViewer.blur();
    ownedViewer.remove();
    unregisterOwned();
    await flush();
    panelFocus.registerPanelFocusAnchor(element(owned.shell));
    expect(document.activeElement).toBe(document.body);

    const later = rightPanel();
    panelFocus.enterPanelContent(later.content, () => later.content);
    later.content.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    panelFocus.registerPanelFocusAnchor(later.shell);
    expect(document.activeElement).toBe(later.content);
  });
});
