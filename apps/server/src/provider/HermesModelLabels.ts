import {
  HERMES_DEFAULT_MODEL,
  type ProviderDriverKind,
  type ServerProviderModel,
} from "@t3tools/contracts";

const providerLabels: Readonly<Record<string, string>> = {
  "openai-codex": "Codex",
  openrouter: "OpenRouter",
  "xai-oauth": "xAI OAuth",
  xai: "xAI OAuth",
  custom: "Custom",
  local: "Local",
};

const recoverableCollapsedRoutes = new Set(["openai-codex", "openrouter", "xai-oauth", "xai"]);

function modelNameFromSlug(slug: string, routeSeparator: number): string {
  const routedModel = slug.slice(routeSeparator + 1).trim();
  const namespaceSeparator = routedModel.lastIndexOf("/");
  return namespaceSeparator >= 0 ? routedModel.slice(namespaceSeparator + 1) : routedModel;
}

/** Hermes prefixes native labels with the inference account's verbose login name. */
export function hermesModelLabel(slug: string, name: string): string {
  if (slug === HERMES_DEFAULT_MODEL) return "Default";
  const label = name.trim() || slug;
  const routeSeparator = slug.indexOf(":");
  const provider = routeSeparator > 0 ? providerLabels[slug.slice(0, routeSeparator)] : undefined;
  if (!provider) {
    const separator = label.indexOf(" · ");
    return separator >= 0 ? label.slice(separator + 3).trim() || label : label;
  }

  const routeSuffix = ` · ${provider}`;
  if (label.toLocaleLowerCase().endsWith(routeSuffix.toLocaleLowerCase())) {
    const model = label.slice(0, -routeSuffix.length).trim();
    return model ? `${model}${routeSuffix}` : label;
  }

  const separator = label.indexOf(" · ");
  const nativeModel = separator >= 0 ? label.slice(separator + 3).trim() || label : label;
  return nativeModel.toLocaleLowerCase() === provider.toLocaleLowerCase()
    ? nativeModel
    : `${nativeModel} · ${provider}`;
}

/** Apply at snapshot boundaries too: retained catalogs may predate the label formatter. */
export function normalizeHermesModelLabels(
  driver: ProviderDriverKind,
  models: ReadonlyArray<ServerProviderModel>,
): ReadonlyArray<ServerProviderModel> {
  if (driver !== "hermes") return models;
  return models.map((model) => {
    if (model.isCustom) return model;
    const routeSeparator = model.slug.indexOf(":");
    const route = routeSeparator > 0 ? model.slug.slice(0, routeSeparator) : undefined;
    const provider = route ? providerLabels[route] : undefined;
    const collapsed =
      route !== undefined &&
      provider !== undefined &&
      recoverableCollapsedRoutes.has(route) &&
      model.name.trim().toLocaleLowerCase() === provider.toLocaleLowerCase();
    const sourceName = collapsed ? modelNameFromSlug(model.slug, routeSeparator) : model.name;
    const name = hermesModelLabel(model.slug, sourceName);
    return name === model.name ? model : { ...model, name };
  });
}
