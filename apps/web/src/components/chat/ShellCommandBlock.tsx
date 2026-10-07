import {
  commandHighlightLanguage,
  withVisibleControlCharacters,
} from "@t3tools/client-runtime/work-log/command-label";
import { Suspense, use, useMemo } from "react";

import { useTheme } from "../../hooks/useTheme";
import { RenderErrorBoundary } from "../RenderErrorBoundary";
import { HighlightedTokens } from "./HighlightedTokens";
import { MessageCopyButton } from "./MessageCopyButton";

// Shell words wrap as a unit, so `--exclude` or a quoted string is not split
// at a hyphen; a word longer than the line still breaks anywhere.
const WORD_CLASS_NAME = "inline-block max-w-full [overflow-wrap:anywhere]";

// The shell parser loads with the first expanded command, not with the timeline.
let commandDisplayModule:
  | Promise<{
      embeddedScripts: typeof import("../../lib/embeddedScripts").embeddedScripts;
      formatShellCommand: typeof import("../../customizations/huy/shellCommandFormat").formatShellCommand;
    }>
  | undefined;
function loadCommandDisplay() {
  commandDisplayModule ??= Promise.all([
    import("../../lib/embeddedScripts"),
    import("../../customizations/huy/shellCommandFormat"),
  ]).then(([scripts, formatting]) => ({ ...scripts, ...formatting }));
  return commandDisplayModule;
}

/** Same layout as the highlighted version, so the grammar arriving never reflows the block. */
function PlainWords({ code }: { code: string }) {
  // split with a capture group alternates words (even) and whitespace (odd).
  return code.split(/(\s+)/u).map((part, index) =>
    index % 2 === 1 || part === "" ? (
      part
    ) : (
      // Positions are stable for a given string, which is all this renders.
      // oxlint-disable-next-line react/no-array-index-key
      <span key={index} className={WORD_CLASS_NAME}>
        {part}
      </span>
    ),
  );
}

function HighlightedCommand({ code, theme }: { code: string; theme: "light" | "dark" }) {
  const { embeddedScripts } = use(loadCommandDisplay());
  const language = commandHighlightLanguage(code);
  // Only shell syntax nests scripts; PowerShell's own grammar colors its strings.
  const embedded = useMemo(
    () => (language === "shellscript" ? embeddedScripts(code) : []),
    [code, embeddedScripts, language],
  );
  return (
    <HighlightedTokens
      code={code}
      language={language}
      embedded={embedded}
      theme={theme}
      wordClassName={WORD_CLASS_NAME}
    />
  );
}

function FormattedCommand({ command, theme }: { command: string; theme: "light" | "dark" }) {
  const { formatShellCommand } = use(loadCommandDisplay());
  const code = useMemo(
    () => withVisibleControlCharacters(formatShellCommand(command)),
    [command, formatShellCommand],
  );
  const plain = <PlainWords code={code} />;
  return (
    <RenderErrorBoundary fallback={plain} resetKeys={[code]}>
      <Suspense fallback={plain}>
        <HighlightedCommand code={code} theme={theme} />
      </Suspense>
    </RenderErrorBoundary>
  );
}

/**
 * The command a command_execution item ran, syntax highlighted. Scripts inside
 * it, such as a `bash -lc` script or a Python heredoc, get their own grammar.
 * Display formatting leaves the original available through the copy button.
 */
export function ShellCommandBlock({ command }: { command: string }) {
  const { resolvedTheme } = useTheme();
  const code = withVisibleControlCharacters(command.trim());
  if (!code) return null;
  const plain = <PlainWords code={code} />;
  return (
    // The tool body sets the monospace, pre-wrapped text this sits in.
    <div className="flex items-start gap-2 text-foreground/85">
      <div className="min-w-0 flex-1">
        <RenderErrorBoundary fallback={plain} resetKeys={[code]}>
          <Suspense fallback={plain}>
            <FormattedCommand command={command.trim()} theme={resolvedTheme} />
          </Suspense>
        </RenderErrorBoundary>
      </div>
      <MessageCopyButton
        text={command}
        label="Copy original command"
        size="icon-xs"
        variant="ghost"
      />
    </div>
  );
}
