export type ModelEsque = {
  slug: string;
  name: string;
  shortName?: string | undefined;
  subProvider?: string | undefined;
  aliases?: ReadonlyArray<string> | undefined;
  isDefault?: boolean | undefined;
  badge?: "new" | undefined;
  isLegacy?: boolean | undefined;
  isUnavailable?: boolean | undefined;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLeadingQualifier(value: string, qualifier: string | null | undefined): string {
  const trimmedQualifier = qualifier?.trim();
  if (!trimmedQualifier) {
    return value;
  }

  const pattern = new RegExp(`^${escapeRegExp(trimmedQualifier)}(?:\\s*[.:/-]\\s*|\\s+)`, "iu");
  return value.replace(pattern, "").trim() || value;
}

export function getDisplayModelName(
  model: ModelEsque,
  options?: { preferShortName?: boolean },
): string {
  const name = options?.preferShortName && model.shortName ? model.shortName : model.name;
  return stripLeadingQualifier(name, model.subProvider);
}

/**
 * The second line of a model row, naming where the model comes from. A
 * sub-provider whose name reads as its provider plus a qualifier ("OpenCode
 * Zen" under "OpenCode") stands alone: joining the two shows "OpenCode ·
 * OpenCode Zen", and OpenCode's own picker shows the sub-provider by itself.
 */
export function getProviderRowLabel(
  providerDisplayName: string,
  subProvider: string | undefined,
): string {
  const provider = providerDisplayName.trim();
  const sub = subProvider?.trim();
  if (!sub) {
    return providerDisplayName;
  }
  if (provider && new RegExp(`^${escapeRegExp(provider)}\\s+\\S`, "i").test(sub)) {
    return sub;
  }
  return `${providerDisplayName} · ${sub}`;
}

export function getTriggerDisplayModelName(model: ModelEsque): string {
  return getDisplayModelName(model, { preferShortName: true });
}

export function getTriggerDisplayModelLabel(model: ModelEsque): string {
  return getTriggerDisplayModelName(model);
}

// Brand prefixes the provider icon already shows. Only providers whose icon *is* the
// model brand: a Claude model run through Cursor keeps "Claude", and "GPT-5.5" keeps
// "GPT" since the OpenAI icon doesn't say GPT and a bare "5.5" reads as nothing.
const ICON_REDUNDANT_MODEL_PREFIX: Record<string, string> = {
  claudeAgent: "Claude",
  grok: "Grok",
};

/** Drops a model label's leading brand word when the driver's icon is shown beside it. */
export function stripIconRedundantModelPrefix(label: string, driverKind: string): string {
  const prefix = ICON_REDUNDANT_MODEL_PREFIX[driverKind];
  return prefix ? stripLeadingQualifier(label, prefix) : label;
}
