import {
  commandHighlightLanguage,
  withVisibleControlCharacters,
} from "@t3tools/client-runtime/work-log/command-label";
import { Suspense, use } from "react";

import { useRenderedAppearance } from "../../hooks/useTheme";
import { RenderErrorBoundary } from "../RenderErrorBoundary";
import { HighlightedTokens } from "./HighlightedTokens";
import { MessageCopyButton } from "./MessageCopyButton";

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

// Match highlighted layout to prevent reflow when the grammar arrives.
function PlainWords({ code }: { code: string }) {
  return code.split(/(\s+)/u).map((part, index) =>
    index % 2 === 1 || part === "" ? (
      part
    ) : (
      // oxlint-disable-next-line react/no-array-index-key -- positions are stable for one string
      <span key={index} className={WORD_CLASS_NAME}>
        {part}
      </span>
    ),
  );
}

function HighlightedCommand({ code, theme }: { code: string; theme: "light" | "dark" }) {
  const { embeddedScripts } = use(loadCommandDisplay());
  const language = commandHighlightLanguage(code);
  const embedded = language === "shellscript" ? embeddedScripts(code) : [];
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
  const code = (() => withVisibleControlCharacters(formatShellCommand(command)))();
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
  const resolvedTheme = useRenderedAppearance();
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
