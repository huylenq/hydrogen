// @effect-diagnostics-next-line nodeBuiltinImport:off - compare real Bash output before and after display formatting.
import * as NodeChildProcess from "node:child_process";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { describe, expect, it } from "vite-plus/test";

import { formatShellCommand } from "./shellCommandFormat";

describe("formatShellCommand", () => {
  it.each([
    ["cd project && rg pattern src | head -20", "cd project &&\n  rg pattern src |\n    head -20"],
    ["echo a; echo b & echo c", "echo a;\necho b &\necho c"],
    [
      'for x in a b; do if test "$x" = a; then echo yes; else echo no; fi; done',
      'for x in a b; do\n  if test "$x" = a; then\n    echo yes;\n  else\n    echo no;\n  fi;\ndone',
    ],
    ["while false; do echo a; done", "while false; do\n  echo a;\ndone"],
    [
      "if false; then echo a; elif true; then echo b; fi",
      "if false; then\n  echo a;\nelif true; then\n  echo b;\nfi",
    ],
    ["f() { echo a; echo b; }; f", "f() {\n  echo a;\n  echo b;\n};\nf"],
    ["(echo a; echo b)", "(\n  echo a;\n  echo b\n)"],
    [
      "case x in x) echo a;; *) echo b;; esac",
      "case x in\n  x)\n    echo a\n    ;;\n  *)\n    echo b\n    ;;\nesac",
    ],
    ["/bin/bash -lc 'echo a; echo b'", "/bin/bash -lc 'echo a;\necho b'"],
    ['bash -c "echo \\"a;b\\"; echo \\"c|d\\""', 'bash -c "echo \\"a;b\\";\necho \\"c|d\\""'],
  ])("lays out shell structure: %s", (command, expected) => {
    expect(formatShellCommand(command)).toBe(expected);
    expect(formatShellCommand(expected)).toBe(expected);
  });

  it
    .skipIf(HostProcess.Platform.defaultValue() === "win32")
    .each([
      `printf '%s\\n' 'a;b && c|d' "$(printf 'nested;word')"; printf done`,
      `printf '%s\\n' one # keep this comment; and its operators && |\nprintf '%s\\n' two`,
      `for x in a b; do printf '%s\\n' "$x"; done`,
      `if false; then printf no; elif true; then printf yes; else printf no; fi`,
      `case x in x) printf yes;; *) printf no;; esac`,
      `printf '%s\\n' a b | head -1 && printf done`,
      `cat <<'EOF'\na && b; literal\n  indented\nEOF\nprintf done`,
      `cat <<'EOF'; printf done\na && b; literal\nEOF`,
      `cat <<'EOF' | cat\na && b; literal\nEOF`,
      `if true; then cat <<-'EOF'\n\tindented\n\tEOF\nfi`,
      `bash -c 'printf "%s\\n" "a;b"; printf done'`,
    ])("preserves observable shell behavior: %s", (command) => {
    const run = (source: string) =>
      NodeChildProcess.execFileSync("/bin/bash", ["--noprofile", "--norc", "-c", source], {
        encoding: "utf8",
      });
    expect(run(formatShellCommand(command))).toBe(run(command));
  });

  it("preserves quoted strings, expansions, escapes, and comments verbatim", () => {
    const command = `echo "two  words; && |" '$HOME' a\\ b; # comment\necho "${"${HOME:-a;b}"}"`;
    expect(formatShellCommand(command)).toBe(
      `echo "two  words; && |" '$HOME' a\\ b; # comment\necho "${"${HOME:-a;b}"}"`,
    );
  });

  it("leaves shell heredoc contents, including nested launchers, verbatim", () => {
    const command = `bash <<'SH'\necho a; echo b\nbash -c 'echo c; echo d'\nSH`;
    expect(formatShellCommand(command)).toBe(command);
  });

  it.each([
    "echo 'unfinished; echo b",
    "if true; then echo a",
    "pwsh -Command 'Get-ChildItem; Write-Output done'",
    "Get-ChildItem; Write-Output done",
    `echo ${"a".repeat(32_000)}; echo b`,
  ])("keeps unparseable, non-Bash, and oversized commands unchanged", (command) => {
    expect(formatShellCommand(command)).toBe(command);
  });
});
