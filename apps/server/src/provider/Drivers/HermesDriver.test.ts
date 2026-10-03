import { describe, expect, it } from "@effect/vitest";
import { HERMES_DEFAULT_MODEL, ProviderDriverKind } from "@t3tools/contracts";
import { normalizeHermesModelLabels } from "../HermesModelLabels.ts";
import { HermesDriver, hermesModelsFromSession } from "./HermesDriver.ts";

const DRIVER = ProviderDriverKind.make("hermes");

describe("Hermes provider catalog", () => {
  it("starts disabled and offers the configured Hermes model before discovery", () => {
    expect(HermesDriver.defaultConfig()).toMatchObject({
      enabled: false,
      binaryPath: "hermes",
      homePath: "",
    });
    expect(hermesModelsFromSession({})).toMatchObject([
      { slug: HERMES_DEFAULT_MODEL, name: "Default", isDefault: true },
    ]);
  });
  it("keeps provider-qualified model IDs distinct and aliases only the active model", () => {
    const models = hermesModelsFromSession({
      models: {
        currentModelId: "local:shared",
        availableModels: [
          { modelId: "openrouter:shared", name: "Cloud" },
          { modelId: "local:shared", name: "Local" },
          { modelId: "local:shared", name: "Duplicate" },
        ],
      },
    });
    expect(models.map((model) => model.slug)).toEqual(["openrouter:shared", "local:shared"]);
    expect(models[0]?.aliases).toBeUndefined();
    expect(models[1]).toMatchObject({
      name: "Local",
      isDefault: true,
      aliases: [HERMES_DEFAULT_MODEL],
    });
  });
  it("uses concise route-qualified labels while preserving native routing IDs", () => {
    const models = hermesModelsFromSession({
      models: {
        currentModelId: "openai-codex:gpt-6-astra",
        availableModels: [
          {
            modelId: "openai-codex:gpt-6-astra",
            name: "ChatGPT or Codex Subscription · gpt-6-astra",
          },
          { modelId: "xai:grok-4.20", name: "xAI Grok OAuth (SuperGrok / Premium+) · grok-4.20" },
          { modelId: "custom:local:qwen3:32b", name: "Local endpoint · qwen3:32b" },
          { modelId: "local:plain", name: "Plain model" },
        ],
      },
    });
    expect(models.map(({ name }) => name)).toEqual([
      "gpt-6-astra · Codex",
      "grok-4.20 · xAI OAuth",
      "qwen3:32b · Custom",
      "Plain model · Local",
    ]);
    expect(models.map(({ slug }) => slug)).toEqual([
      "openai-codex:gpt-6-astra",
      "xai:grok-4.20",
      "custom:local:qwen3:32b",
      "local:plain",
    ]);
    expect(models[0]?.aliases).toEqual([HERMES_DEFAULT_MODEL]);
  });

  it("distinguishes the same Hermes model across inference routes", () => {
    const models = hermesModelsFromSession({
      models: {
        currentModelId: "xai-oauth:grok-4.7",
        availableModels: [
          { modelId: "openrouter:x-ai/grok-4.7", name: "OpenRouter · grok-4.7" },
          { modelId: "xai-oauth:grok-4.7", name: "xAI OAuth · grok-4.7" },
        ],
      },
    });
    expect(models.map(({ name }) => name)).toEqual([
      "grok-4.7 · OpenRouter",
      "grok-4.7 · xAI OAuth",
    ]);
  });

  it("keeps route-qualified labels stable across repeated snapshot normalization", () => {
    const discovered = hermesModelsFromSession({
      models: {
        currentModelId: "xai-oauth:grok-4.7",
        availableModels: [
          { modelId: "openrouter:x-ai/grok-4.7", name: "OpenRouter · grok-4.7" },
          { modelId: "xai-oauth:grok-4.7", name: "xAI OAuth · grok-4.7" },
        ],
      },
    });

    const normalized = normalizeHermesModelLabels(DRIVER, discovered);
    const normalizedAgain = normalizeHermesModelLabels(DRIVER, normalized);

    expect(normalizedAgain.map(({ name }) => name)).toEqual([
      "grok-4.7 · OpenRouter",
      "grok-4.7 · xAI OAuth",
    ]);
  });

  it("recovers model names from route-only cached labels", () => {
    const discovered = hermesModelsFromSession({
      models: {
        currentModelId: "xai-oauth:grok-4.7",
        availableModels: [
          { modelId: "openrouter:x-ai/grok-4.7", name: "OpenRouter · grok-4.7" },
          { modelId: "xai-oauth:grok-4.7", name: "xAI OAuth · grok-4.7" },
        ],
      },
    });
    const collapsed = discovered.map((model) => ({
      ...model,
      name: model.slug.startsWith("openrouter:") ? "OpenRouter" : "xAI OAuth",
    }));
    const models = normalizeHermesModelLabels(DRIVER, collapsed);

    expect(models.map(({ name }) => name)).toEqual([
      "grok-4.7 · OpenRouter",
      "grok-4.7 · xAI OAuth",
    ]);
  });
});
