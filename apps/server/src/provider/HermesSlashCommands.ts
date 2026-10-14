import type { ServerProviderSlashCommand } from "@t3tools/contracts";
import { USAGE_LIMITS_COMMAND } from "@t3tools/shared/usageLimits";
import type * as EffectAcpSchema from "effect-acp/compat";

/** T3's compaction entry; Hermes runs it as its native `/compress`. */
export const HERMES_COMPACT_COMMAND = {
  name: "compact",
  description: "Summarize the conversation and reduce context usage",
} satisfies ServerProviderSlashCommand;

// Slash names the composer already handles itself. A Hermes command with one of
// these names is exposed as `<name>-hermes` and sent to Hermes under its own name.
const T3_SLASH_COMMANDS: ReadonlySet<string> = new Set([
  "model",
  "plan",
  "default",
  HERMES_COMPACT_COMMAND.name,
  USAGE_LIMITS_COMMAND.name,
]);
const HERMES_SUFFIX = "-hermes";

/** The composer's slash commands for the commands a Hermes session advertises. */
export function hermesSlashCommands(
  commands: ReadonlyArray<EffectAcpSchema.AvailableCommand>,
): ReadonlyArray<ServerProviderSlashCommand> {
  const seen = new Set<string>([HERMES_COMPACT_COMMAND.name]);
  const exposed = commands.flatMap((command): ServerProviderSlashCommand[] => {
    const native = command.name.trim().toLowerCase();
    const name = T3_SLASH_COMMANDS.has(native) ? `${native}${HERMES_SUFFIX}` : native;
    if (!native || seen.has(name)) return [];
    seen.add(name);
    const description = command.description.trim();
    const hint = command.input?.hint.trim();
    return [
      {
        name,
        ...(description ? { description } : {}),
        ...(hint ? { input: { hint } } : {}),
      },
    ];
  });
  return [HERMES_COMPACT_COMMAND, ...exposed];
}

/** Rewrites a prompt's leading T3 slash name to the command Hermes knows. */
export function hermesNativePrompt(text: string): string {
  const match = /^(\s*)\/(\S+)/.exec(text);
  if (!match) return text;
  const name = match[2]!.toLowerCase();
  const base = name.endsWith(HERMES_SUFFIX) ? name.slice(0, -HERMES_SUFFIX.length) : undefined;
  const native =
    name === HERMES_COMPACT_COMMAND.name
      ? "compress"
      : base !== undefined && T3_SLASH_COMMANDS.has(base)
        ? base
        : undefined;
  return native === undefined ? text : `${match[1]}/${native}${text.slice(match[0].length)}`;
}
