import { assert, describe, it } from "@effect/vitest";

import { hermesNativePrompt, hermesSlashCommands } from "./HermesSlashCommands.ts";

describe("hermesSlashCommands", () => {
  it("keeps T3's compact entry and suffixes Hermes commands that T3 already owns", () => {
    assert.deepEqual(
      hermesSlashCommands([
        {
          name: "model",
          description: "Switch models",
          input: { type: "text", hint: "model name" },
        },
        { name: "compress", description: "Compress conversation context" },
        { name: "compress", description: "Duplicate" },
      ]).map((command) => command.name),
      ["compact", "model-hermes", "compress"],
    );
  });
});

describe("hermesNativePrompt", () => {
  it("sends T3 slash names under the names Hermes dispatches", () => {
    assert.equal(hermesNativePrompt("/compact"), "/compress");
    assert.equal(hermesNativePrompt("/model-hermes anthropic:claude"), "/model anthropic:claude");
    assert.equal(hermesNativePrompt("/compactly"), "/compactly");
    assert.equal(hermesNativePrompt("/tools-hermes"), "/tools-hermes");
    assert.equal(hermesNativePrompt("explain /compact"), "explain /compact");
  });
});
