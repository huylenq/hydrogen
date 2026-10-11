import { describe, expect, it } from "vite-plus/test";

import {
  getDisplayModelName,
  getProviderRowLabel,
  stripIconRedundantModelPrefix,
} from "./providerIconUtils";

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

describe("getProviderRowLabel", () => {
  it("shows a sub-provider named after its provider on its own", () => {
    expect(getProviderRowLabel("OpenCode", "OpenCode Zen")).toBe("OpenCode Zen");
    expect(getProviderRowLabel("OpenCode", "OpenCode Go")).toBe("OpenCode Go");
  });

  it("keeps a provider id that merely starts like the provider name", () => {
    expect(getProviderRowLabel("OpenCode", "opencode-go")).toBe("OpenCode · opencode-go");
  });

  it("joins a sub-provider that names something else", () => {
    expect(getProviderRowLabel("OpenCode", "GitHub Copilot")).toBe("OpenCode · GitHub Copilot");
  });

  it("keeps the provider name when a model has no sub-provider", () => {
    expect(getProviderRowLabel("Claude", undefined)).toBe("Claude");
  });
});

describe("getDisplayModelName", () => {
  it("drops a leading sub-provider qualifier from the model name", () => {
    expect(
      getDisplayModelName({
        slug: "a/b",
        name: "OpenCode Zen: Step 5",
        subProvider: "OpenCode Zen",
      }),
    ).toBe("Step 5");
  });
});
