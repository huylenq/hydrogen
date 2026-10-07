import { commandHighlightLanguage } from "@t3tools/client-runtime/work-log/command-label";
import { parse, type CompoundList, type Statement } from "unbash";

import { embeddedScripts } from "../../lib/embeddedScripts";

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

// Bound work on large generated scripts; the original remains readable and copyable.
const MAX_FORMAT_LENGTH = 32_000;

/** Only change whitespace at parsed command boundaries, never shell words or heredoc bodies. */
function layoutEdits(source: string): Edit[] {
  const script = parse(source);
  if (script.errors?.length) return [];
  const edits: Edit[] = [];
  const heredocs: Array<{ start: number; end: number }> = [];
  const before = (end: number, indent: number, minimum = 0) => {
    let start = end;
    while (start > minimum && /\s/u.test(source[start - 1]!)) start -= 1;
    edits.push({ start, end, text: `\n${"  ".repeat(indent)}` });
  };
  const closing = (node: { end: number }, body: CompoundList, keyword: string, indent: number) => {
    const match = new RegExp(`${keyword}\\s*$`, "u").exec(source.slice(body.end, node.end));
    if (match) before(body.end + match.index, indent, body.end);
  };
  const list = (commands: readonly Statement[], indent: number, breakFirst = false) => {
    commands.forEach((statement, index) => {
      if (index > 0 || breakFirst) {
        before(statement.pos, indent, index > 0 ? commands[index - 1]!.end : 0);
      }
      visit(statement.command, indent);
    });
  };
  const body = (block: CompoundList, indent: number) => list(block.commands, indent + 1, true);
  const visit = (node: Statement["command"], indent: number): void => {
    switch (node.type) {
      case "Command":
        for (const redirect of node.redirects) {
          if (redirect.type === "HereDoc") {
            heredocs.push({ start: redirect.pos, end: redirect.closing?.end ?? source.length });
          }
        }
        break;
      case "AndOr":
      case "Pipeline":
        node.commands.forEach((command, index) => {
          if (index > 0) before(command.pos, indent + 1, node.commands[index - 1]!.end);
          visit(command, index > 0 ? indent + 1 : indent);
        });
        break;
      case "If":
        list(node.clause.commands, indent);
        body(node.then, indent);
        if (node.else?.type === "If") {
          before(node.else.pos, indent, node.then.end);
          visit(node.else, indent);
        } else {
          if (node.else) {
            closing({ end: node.else.pos }, node.then, "else", indent);
            body(node.else, indent);
          }
          closing(node, node.else ?? node.then, "fi", indent);
        }
        break;
      case "While":
        list(node.clause.commands, indent);
        body(node.body, indent);
        closing(node, node.body, "done", indent);
        break;
      case "For":
      case "ArithmeticFor":
      case "Select":
        body(node.body, indent);
        closing(node, node.body, "done", indent);
        break;
      case "BraceGroup":
      case "Subshell":
        body(node.body, indent);
        closing(node, node.body, node.type === "BraceGroup" ? "\\}" : "\\)", indent);
        break;
      case "Case":
        node.items.forEach((item) => {
          before(item.pos, indent + 1, node.word.end);
          list(item.body.commands, indent + 2, true);
          if (item.terminator) closing(item, item.body, item.terminator, indent + 2);
        });
        if (node.items.length) {
          const last = node.items.at(-1)!;
          closing(node, { ...last.body, end: last.end }, "esac", indent);
        }
        break;
      case "Function":
      case "Coproc":
        if (node.body.type !== "CompoundList") visit(node.body, indent);
        break;
      case "Redirected":
        for (const redirect of node.redirects) {
          if (redirect.type === "HereDoc") {
            heredocs.push({ start: redirect.pos, end: redirect.closing?.end ?? source.length });
          }
        }
        visit(node.command, indent);
        break;
      case "Time":
      case "Negation":
        if (node.command) visit(node.command, indent);
        break;
    }
  };
  list(script.commands, 0);
  // A newline in a heredoc's header would start its body early (even before
  // another command after `;` or `|` on that header). Leave that whole span alone.
  return edits.filter(
    (edit) => !heredocs.some((range) => edit.start < range.end && edit.end >= range.start),
  );
}

/** Formats unfolded Bash calls for display; the caller keeps the original for copying. */
export function formatShellCommand(command: string): string {
  if (command.length > MAX_FORMAT_LENGTH || commandHighlightLanguage(command) !== "shellscript") {
    return command;
  }
  try {
    const edits = layoutEdits(command);
    // Shell launchers often put the whole command in a quoted `-c` argument.
    // Map only literal whitespace back into that argument, keeping its escaping intact.
    const shellSpans: Array<{ start: number; end: number }> = [];
    for (const script of embeddedScripts(command)) {
      if (script.language !== "shellscript") continue;
      const scriptStart = script.starts[0];
      const scriptEnd = script.ends.at(-1);
      if (scriptStart === undefined || scriptEnd === undefined) continue;
      if (shellSpans.some((span) => scriptStart >= span.start && scriptEnd <= span.end)) continue;
      shellSpans.push({ start: scriptStart, end: scriptEnd });
      // Heredocs (including any nested launcher inside one) remain verbatim.
      if (!/["']/u.test(command[scriptStart - 1] ?? "")) continue;
      for (const edit of layoutEdits(script.text)) {
        const start = script.starts[edit.start];
        const end = edit.end > edit.start ? script.ends[edit.end - 1] : start;
        if (start === undefined || end === undefined) continue;
        if (command.slice(start, end) !== script.text.slice(edit.start, edit.end)) continue;
        edits.push({ start, end, text: edit.text });
      }
    }
    let result = command;
    let boundary = command.length;
    for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
      if (edit.end > boundary) continue;
      result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
      boundary = edit.start;
    }
    return result;
  } catch {
    return command;
  }
}
