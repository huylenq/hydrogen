// @vitest-environment jsdom
import { ASSISTANT_CITATION_MAX_TEXT_LENGTH } from "@t3tools/contracts";
import { afterEach, expect, it } from "vite-plus/test";
import { captureBlockCitation } from "./readingCite";

afterEach(() => {
  document.body.innerHTML = "";
});

function answer(markdown: string) {
  // No whitespace between tags: React renders none, and it would enter the citation context.
  document.body.innerHTML =
    `<div data-assistant-citation-viewport="true">` +
    `<div data-timeline-row-id="user"><p id="user">Question?</p></div>` +
    `<div data-assistant-citation-source="message-1" data-assistant-citation-environment="env-1" data-assistant-citation-thread="thread-1">` +
    `<div class="chat-markdown">${markdown}</div></div></div>`;
  return (id: string) => document.getElementById(id)!;
}

it("cites a block's text with the same selector a mouse selection produces", () => {
  const byId = answer(
    `<p id="intro">Intro.</p><p id="cause"><strong>Root cause:</strong> a <a href="#">stale</a> ref.</p>`,
  );
  const captured = captureBlockCitation(byId("cause"));
  if ("reason" in captured) throw new Error(captured.reason);
  expect(captured.citation).toMatchObject({
    version: 1,
    environmentId: "env-1",
    threadId: "thread-1",
    messageId: "message-1",
    text: "Root cause: a stale ref.",
    prefix: "Intro. ",
  });
  expect(captured.anchor.range.toString()).toBe("Root cause: a stale ref.");
});

it("cites a code block's code without its header or controls", () => {
  const byId = answer(
    `<div id="code" data-language="ts"><div class="chat-markdown-codeblock-header"><span>ts</span><button>Copy</button></div><pre><code>const a = 1;</code></pre></div>`,
  );
  const captured = captureBlockCitation(byId("code"));
  if ("reason" in captured) throw new Error(captured.reason);
  expect(captured.citation.text).toBe("const a = 1;");
});

it("explains blocks that cannot be cited", () => {
  const byId = answer(`<p id="long">${"x".repeat(ASSISTANT_CITATION_MAX_TEXT_LENGTH + 1)}</p>`);
  expect(captureBlockCitation(byId("user"))).toEqual({ reason: "Only answer text can be cited" });
  expect(captureBlockCitation(byId("long"))).toEqual({
    reason: "This block is too long to cite; select part of it instead",
  });
});
