import { describe, expect, it } from "vite-plus/test";

import { stripIconRedundantModelPrefix } from "./providerIconUtils";

describe("stripIconRedundantModelPrefix", () => {
  it("drops the brand the provider icon already shows", () => {
    expect(stripIconRedundantModelPrefix("Claude Opus 5.5", "claudeAgent")).toBe("Opus 5.5");
    expect(stripIconRedundantModelPrefix("Grok Build", "grok")).toBe("Build");
  });

  it("keeps the brand when the icon belongs to another harness", () => {
    expect(stripIconRedundantModelPrefix("Claude Opus 5.5", "cursor")).toBe("Claude Opus 5.5");
    expect(stripIconRedundantModelPrefix("GPT-5.5", "codex")).toBe("GPT-5.5");
  });

  it("keeps a label that is only the brand", () => {
    expect(stripIconRedundantModelPrefix("Claude", "claudeAgent")).toBe("Claude");
  });
});
