import { describe, expect, it } from "vite-plus/test";
import { grokBotMarkdownUrl } from "./GrokBotMarkdown";

describe("Grok Bot Markdown destinations", () => {
  it("preserves web links and explicit Grok app navigation", () => {
    expect(grokBotMarkdownUrl("https://example.com/report", "href")).toBe(
      "https://example.com/report",
    );
    expect(grokBotMarkdownUrl("grokbot://app/v1/settings?id=computers", "href")).toBe(
      "grokbot://app/v1/settings?id=computers",
    );
    expect(grokBotMarkdownUrl("mailto:hello@example.com", "href")).toBe("mailto:hello@example.com");
  });
  it("does not interpret bot computer paths as files in the coding workspace", () => {
    for (const value of [
      "/workspace/report.md",
      "./image.png",
      "file:///Users/huy/report.md",
      "sand-workflow:workflow",
      "",
    ]) {
      expect(grokBotMarkdownUrl(value, "href")).toBeUndefined();
      expect(grokBotMarkdownUrl(value, "src")).toBeUndefined();
    }
  });
  it("limits images to web URLs and rejects executable links", () => {
    expect(grokBotMarkdownUrl("https://example.com/avatar.png", "src")).toBe(
      "https://example.com/avatar.png",
    );
    for (const value of [
      "javascript:alert(1)",
      "data:text/html,test",
      "grokbot://app/v1/settings",
      "mailto:hello@example.com",
    ]) {
      expect(grokBotMarkdownUrl(value, "src")).toBeUndefined();
    }
    expect(grokBotMarkdownUrl("javascript:alert(1)", "href")).toBeUndefined();
  });
});
