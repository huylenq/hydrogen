import { describe, expect, it } from "vite-plus/test";

import {
  injectHtmlRenderBootstrap,
  isHtmlRenderUnhandledEscape,
  readHtmlRenderImageRequest,
  readHtmlRenderLinkRequest,
} from "./htmlRender.ts";
import { htmlRenderFromToolItem } from "./toolOutput.ts";

const reference = { attachmentId: "thread-abc-123.html", title: "Chart", height: 420 };

describe("injectHtmlRenderBootstrap", () => {
  it("puts the theme ahead of the page's own head content", () => {
    const html =
      "<!doctype html><html><head><style>:root{--background:red}</style></head><body>x</body></html>";
    const injected = injectHtmlRenderBootstrap(html);
    const themeAt = injected.indexOf('<style id="t3-theme">');
    expect(themeAt).toBeGreaterThan(injected.indexOf("<head>"));
    expect(themeAt).toBeLessThan(injected.indexOf(":root{--background:red}"));
    expect(injected).toContain('<meta charset="utf-8">');
    expect(injected).toContain('name="viewport"');
  });

  it("wraps fragments without a head and keeps existing meta tags", () => {
    const fragment =
      '<meta charset="utf-8"><meta name="viewport" content="width=device-width"><p>hi</p>';
    const injected = injectHtmlRenderBootstrap(fragment);
    expect(injected.startsWith("<!doctype html><head>")).toBe(true);
    expect(injected.match(/charset/g)).toHaveLength(1);
    expect(injected.match(/name="viewport"/g)).toHaveLength(1);
    expect(injected.endsWith("<p>hi</p>")).toBe(true);
  });

  it.each(["textarea", "iframe", "plaintext"])("keeps the bootstrap outside %s content", (tag) => {
    const fragment = `<${tag}><head><meta name="viewport"></head></${tag}>`;
    const injected = injectHtmlRenderBootstrap(fragment);
    expect(injected.startsWith("<!doctype html><head>")).toBe(true);
    expect(injected.indexOf('<style id="t3-theme">')).toBeLessThan(injected.indexOf(`<${tag}>`));
    expect(injected).toContain('<meta name="viewport" content="width=device-width');
    expect(injected.endsWith(fragment)).toBe(true);
  });

  it.each([
    '<template><head><meta name="viewport"></head></template>',
    '<template><template>inner</template><head><meta name="viewport"></head></template>',
  ])("keeps the bootstrap outside inert template content: %s", (fragment) => {
    const injected = injectHtmlRenderBootstrap(fragment);
    expect(injected.startsWith("<!doctype html><head>")).toBe(true);
    expect(injected.indexOf('<style id="t3-theme">')).toBeLessThan(injected.indexOf("<template>"));
    expect(injected).toContain('<meta name="viewport" content="width=device-width');
    expect(injected.endsWith(fragment)).toBe(true);
  });

  it("ignores tags written inside comments and scripts", () => {
    const html =
      '<!-- copy <head> and <meta name="viewport"> here --><html><head>' +
      "<script>const tag = '<meta name=\"viewport\">';</script></head><body>x</body></html>";
    const injected = injectHtmlRenderBootstrap(html);
    expect(injected.indexOf('<style id="t3-theme">')).toBeGreaterThan(
      injected.indexOf("<html><head>"),
    );
    expect(injected).toContain('<meta name="viewport" content="width=device-width');
  });
});

describe("readHtmlRenderLinkRequest", () => {
  it("accepts only http(s) URLs in an MCP Apps ui/open-link request", () => {
    const link = (url: unknown, modifiers = {}) => ({
      jsonrpc: "2.0",
      id: 1,
      method: "ui/open-link",
      params: { url, ...modifiers },
    });
    expect(readHtmlRenderLinkRequest(link("https://example.com/a"))).toEqual({
      id: 1,
      url: "https://example.com/a",
      metaKey: false,
      ctrlKey: false,
    });
    expect(
      readHtmlRenderLinkRequest(link("https://example.com/a", { metaKey: true, ctrlKey: "yes" })),
    ).toEqual({ id: 1, url: "https://example.com/a", metaKey: true, ctrlKey: false });
    expect(readHtmlRenderLinkRequest(link("javascript:alert(1)"))).toBeUndefined();
    expect(readHtmlRenderLinkRequest(link("file:///etc/passwd"))).toBeUndefined();
    expect(
      readHtmlRenderLinkRequest({
        jsonrpc: "2.0",
        method: "ui/open-link",
        params: { url: "https://example.com" },
      }),
    ).toBeUndefined();
    expect(
      readHtmlRenderLinkRequest({ type: "t3-html-render-link", url: "https://example.com" }),
    ).toBeUndefined();
  });
});

interface StandInEvent {
  readonly key?: string;
  readonly getModifierState?: (key: string) => boolean;
  readonly isTrusted: boolean;
  readonly isComposing?: boolean;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  defaultPrevented: boolean;
  preventDefault: () => void;
  /** A handler below the window stopped the event before it bubbled up. */
  propagationStopped?: boolean;
  composedPath?: () => ReadonlyArray<unknown>;
}

/**
 * Runs the injected bootstrap against a stand-in framed window and records what
 * it posts to its parent. Timers run only when flushed, as after a dispatch.
 */
function runFramedBootstrap() {
  const markup = injectHtmlRenderBootstrap("<p>x</p>");
  const script = /<script>([\s\S]*?)<\/script>/.exec(markup)?.[1] ?? "";
  const listeners: Array<{
    readonly target: "window" | "document";
    readonly type: string;
    readonly listener: (event: StandInEvent) => void;
    readonly capture: boolean;
  }> = [];
  const listen =
    (target: "window" | "document") =>
    (type: string, listener: (event: StandInEvent) => void, capture?: boolean) =>
      listeners.push({ target, type, listener, capture: capture === true });
  const posted: unknown[] = [];
  const timers: Array<() => void> = [];
  const page = "https://render.test/page.html";
  const frameWindow = {
    parent: { postMessage: (data: unknown) => posted.push(data) },
    addEventListener: listen("window"),
  };
  const frameDocument = {
    getElementById: () => ({ textContent: "" }),
    addEventListener: listen("document"),
    documentElement: { scrollHeight: 0, clientHeight: 0, getBoundingClientRect: () => ({}) },
    body: null,
    baseURI: page,
  };
  const location = { hash: "", href: page, pathname: "/page.html", search: "" };
  const history = { state: null, replaceState: () => {} };
  new Function("window", "document", "location", "history", "setTimeout", script)(
    frameWindow,
    frameDocument,
    location,
    history,
    (callback: () => void) => timers.push(callback),
  );
  const event = (fields: Partial<StandInEvent>): StandInEvent => {
    const created: StandInEvent = {
      isTrusted: true,
      key: "",
      composedPath: () => [],
      getModifierState: () => false,
      defaultPrevented: false,
      preventDefault: () => {
        created.defaultPrevented = true;
      },
      ...fields,
    };
    return created;
  };
  return {
    posted,
    event,
    // Capture listeners run on the way down; bubbling ones only if nothing stopped the event.
    dispatch: (target: "window" | "document", type: string, dispatched: StandInEvent) => {
      for (const entry of listeners)
        if (
          entry.target === target &&
          entry.type === type &&
          (entry.capture || !dispatched.propagationStopped)
        )
          entry.listener(dispatched);
    },
    flushTimers: () => timers.splice(0).forEach((callback) => callback()),
  };
}

describe("the render bootstrap", () => {
  it("reports an Escape the page left alone once dispatch is over", () => {
    const frame = runFramedBootstrap();
    frame.dispatch("window", "keydown", frame.event({ key: "Escape" }));
    expect(frame.posted).toEqual([]);
    frame.flushTimers();
    expect(frame.posted).toHaveLength(1);
    expect(isHtmlRenderUnhandledEscape(frame.posted[0])).toBe(true);
  });

  it("still reports an Escape whose propagation the page stopped without handling it", () => {
    const frame = runFramedBootstrap();
    frame.dispatch("window", "keydown", frame.event({ key: "Escape", propagationStopped: true }));
    frame.flushTimers();
    expect(frame.posted).toHaveLength(1);
    expect(isHtmlRenderUnhandledEscape(frame.posted[0])).toBe(true);
  });

  it("stays quiet about an Escape the page handled, other keys, and composition", () => {
    const frame = runFramedBootstrap();
    const handled = frame.event({ key: "Escape" });
    frame.dispatch("window", "keydown", handled);
    // A handler that runs after the bootstrap's still counts.
    handled.preventDefault();
    frame.dispatch("window", "keydown", frame.event({ key: "Enter" }));
    frame.dispatch("window", "keydown", frame.event({ key: "Escape", isComposing: true }));
    frame.dispatch("window", "keydown", frame.event({ key: "Escape", isTrusted: false }));
    frame.flushTimers();
    expect(frame.posted).toEqual([]);
  });

  it("asks the client to open a clicked link, with the click's modifier keys", () => {
    const frame = runFramedBootstrap();
    const anchor = {
      matches: (selector: string) => selector === "a[href]",
      getAttribute: () => "https://example.com/docs",
    };
    const click = frame.event({ metaKey: true, ctrlKey: false, composedPath: () => [anchor] });
    frame.dispatch("document", "click", click);
    expect(click.defaultPrevented).toBe(true);
    expect(readHtmlRenderLinkRequest(frame.posted[0])).toEqual({
      id: "t3-link-1",
      url: "https://example.com/docs",
      metaKey: true,
      ctrlKey: false,
    });
  });
});

describe("isHtmlRenderUnhandledEscape", () => {
  it("accepts only the T3 unhandled-escape notification", () => {
    expect(
      isHtmlRenderUnhandledEscape({ jsonrpc: "2.0", method: "t3/notifications/unhandled-escape" }),
    ).toBe(true);
    expect(isHtmlRenderUnhandledEscape({ method: "t3/notifications/unhandled-escape" })).toBe(
      false,
    );
    expect(
      isHtmlRenderUnhandledEscape({ jsonrpc: "2.0", method: "ui/notifications/size-changed" }),
    ).toBe(false);
    expect(isHtmlRenderUnhandledEscape("escape")).toBe(false);
  });
});

describe("readHtmlRenderImageRequest", () => {
  it("accepts http(s) and inline image URLs in an open-image notification", () => {
    const image = (params: unknown) => ({
      jsonrpc: "2.0",
      method: "t3/notifications/open-image",
      params,
    });
    expect(
      readHtmlRenderImageRequest(image({ src: "data:image/png;base64,AA", name: " Chart " })),
    ).toEqual({
      src: "data:image/png;base64,AA",
      name: "Chart",
    });
    expect(readHtmlRenderImageRequest(image({ src: "https://example.com/a.png" }))).toEqual({
      src: "https://example.com/a.png",
      name: "Image",
    });
    expect(readHtmlRenderImageRequest(image({ src: "javascript:alert(1)" }))).toBeUndefined();
    expect(readHtmlRenderImageRequest(image({ src: "data:text/html,<p>" }))).toBeUndefined();
    expect(readHtmlRenderImageRequest(image({ src: "blob:null/1" }))).toBeUndefined();
  });
});

describe("htmlRenderFromToolItem", () => {
  const result = { htmlRender: reference, message: "Rendered above your reply." };

  it("reads the reference from each provider's result envelope", () => {
    for (const [toolName, output] of [
      ["mcp__t3-code__html_render", [{ type: "text", text: JSON.stringify(result) }]],
      ["t3-code.html_render", { structuredContent: result, content: [] }],
      ["t3-code-thread_1_html_render", JSON.stringify(result)],
      ["html_render", result],
    ] as const) {
      expect(htmlRenderFromToolItem({ toolName, output })).toEqual(reference);
    }
  });
});
