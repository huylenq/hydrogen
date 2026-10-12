import type { EDITORS } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import * as HostProcess from "./HostProcess.ts";
import { isCommandAvailable } from "./shell.ts";

type Editor = (typeof EDITORS)[number];

const installNames: Partial<Record<Editor["id"], ReadonlyArray<string>>> = {
  vscode: ["Visual Studio Code"],
  "vscode-insiders": ["Visual Studio Code - Insiders"],
  // `Antigravity.app` is the separate Hub, not the IDE.
  antigravity: ["Antigravity IDE"],
  idea: ["IntelliJ IDEA", "IntelliJ IDEA CE", "IntelliJ IDEA Ultimate"],
  pycharm: ["PyCharm", "PyCharm CE"],
  rider: ["Rider", "JetBrains Rider"],
};

/** True for `<name> <version>.app`, where the version is digits and dots (`IntelliJ IDEA 2026.1.4.app`).
 * A plain prefix match would let one editor steal another's bundle, e.g. stable VS Code resolving to
 * `Visual Studio Code - Insiders.app`. */
const isVersionedBundle = (entry: string, name: string) => {
  if (!entry.startsWith(`${name} `) || !entry.endsWith(".app")) return false;
  return /^\d[\d.]*$/.test(entry.slice(name.length + 1, -".app".length));
};

const DARWIN_HOMEBREW_PREFIXES = ["/opt/homebrew", "/usr/local"] as const;

// emacs-plus (the Homebrew formula that ships Emacs.app in the Cellar) wins
// over emacs-mac and a plain `emacs` formula when more than one is linked.
const emacsFormulaRank = (name: string): number => {
  if (name === "emacs-plus" || name.startsWith("emacs-plus@")) return 0;
  if (name === "emacs-mac" || name.startsWith("emacs-mac@")) return 1;
  if (name === "emacs" || name.startsWith("emacs@")) return 2;
  return 3;
};

const isEmacsFormula = (name: string): boolean => emacsFormulaRank(name) < 3;

const compareEmacsFormulas = (left: string, right: string): number => {
  const byRank = emacsFormulaRank(left) - emacsFormulaRank(right);
  return byRank !== 0 ? byRank : right.localeCompare(left);
};

const homebrewEmacsCandidates = Effect.fn("editor.homebrewEmacsCandidates")(function* (
  env: NodeJS.ProcessEnv,
) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const candidates: string[] = [];
  const seen = new Set<string>();
  const prefixes = [env.HOMEBREW_PREFIX, ...DARWIN_HOMEBREW_PREFIXES].flatMap((prefix) => {
    const trimmed = prefix?.trim();
    if (!trimmed || seen.has(trimmed)) return [];
    seen.add(trimmed);
    return [trimmed];
  });

  for (const prefix of prefixes) {
    const entries = yield* fs
      .readDirectory(path.join(prefix, "opt"))
      .pipe(Effect.orElseSucceed(() => []));
    for (const formula of entries.filter(isEmacsFormula).sort(compareEmacsFormulas)) {
      candidates.push(path.join(prefix, "opt", formula, "Emacs.app", "Contents", "MacOS", "Emacs"));
    }
    candidates.push(path.join(prefix, "bin", "emacs"));
  }
  return candidates;
});

export const resolveEditorCommand = Effect.fn("editor.resolveEditorCommand")(function* (
  editor: Editor,
  env: NodeJS.ProcessEnv,
) {
  if (editor.commands === null) return Option.none();
  const baseArgs = "baseArgs" in editor ? editor.baseArgs : [];
  for (const command of editor.commands) {
    if (yield* isCommandAvailable(command, { env })) return Option.some({ command, baseArgs });
  }

  const platform = yield* HostProcess.Platform;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const home = env.HOME;
  const names = installNames[editor.id] ?? [editor.label];
  const command = editor.commands[0];
  const jetbrains = editor.launchStyle === "line-column";
  const candidates: string[] = [];

  if (platform === "darwin") {
    const roots = [...(home ? [path.join(home, "Applications")] : []), "/Applications"];
    for (const root of roots) {
      // JetBrains Toolbox installs bundles named after the app and its version
      // (`IntelliJ IDEA 2026.1.4.app`), so list the directory and accept
      // `<name> <version>.app` as well as the exact `<name>.app`.
      const entries = yield* fs.readDirectory(root).pipe(Effect.orElseSucceed(() => []));
      const bundles = new Set(names.map((name) => `${name}.app`));
      for (const entry of entries) {
        if (names.some((name) => entry === `${name}.app` || isVersionedBundle(entry, name))) {
          bundles.add(entry);
        }
      }
      for (const bundle of bundles) {
        const contents = path.join(root, bundle, "Contents");
        candidates.push(
          ...(editor.id === "emacs"
            ? [path.join(contents, "MacOS", "Emacs")]
            : jetbrains || editor.id === "zed"
              ? [path.join(contents, "MacOS", editor.id === "zed" ? "cli" : command)]
              : [
                  path.join(contents, "Resources/app/bin", command),
                  path.join(contents, "Resources/app/bin/code"),
                ]),
        );
      }
    }
    if (editor.id === "emacs") {
      candidates.push(...(yield* homebrewEmacsCandidates(env)));
    }
    if (home && jetbrains) {
      candidates.push(
        path.join(home, "Library/Application Support/JetBrains/Toolbox/scripts", command),
      );
    }
  } else if (platform === "win32") {
    const roots = [
      ...(env.LOCALAPPDATA ? [path.join(env.LOCALAPPDATA, "Programs")] : []),
      ...[env.ProgramFiles, env["ProgramFiles(x86)"], env.ProgramW6432].filter(
        (root): root is string => !!root,
      ),
    ];
    if (jetbrains) {
      if (env.LOCALAPPDATA) {
        candidates.push(path.join(env.LOCALAPPDATA, "JetBrains/Toolbox/scripts", `${command}.cmd`));
      }
      for (const directory of roots.flatMap((root) => [root, path.join(root, "JetBrains")])) {
        const entries = yield* fs.readDirectory(directory).pipe(Effect.orElseSucceed(() => []));
        for (const entry of entries) {
          if (names.some((name) => entry === name || entry.startsWith(`${name} `))) {
            candidates.push(path.join(directory, entry, "bin", `${command}64.exe`));
            candidates.push(path.join(directory, entry, "bin", `${command}.exe`));
          }
        }
      }
    } else {
      const name =
        editor.id === "vscode"
          ? "Microsoft VS Code"
          : editor.id === "vscode-insiders"
            ? "Microsoft VS Code Insiders"
            : editor.label;
      for (const root of roots) {
        candidates.push(
          path.join(root, name, "resources/app/bin", `${command}.cmd`),
          path.join(root, name, "resources/app/bin/code.cmd"),
          path.join(root, name, "bin", `${command}.cmd`),
          path.join(root, name, "bin/code.cmd"),
        );
        if (editor.id === "zed") {
          candidates.push(
            path.join(root, name, "bin", "zed.exe"),
            path.join(root, name, "zed.exe"),
          );
        }
      }
    }
  } else if (platform === "linux") {
    const dirs = [
      ...(home ? [path.join(home, ".local/bin")] : []),
      "/usr/local/bin",
      "/usr/bin",
      "/snap/bin",
    ];
    if (jetbrains) {
      const dataHome = env.XDG_DATA_HOME || (home ? path.join(home, ".local/share") : undefined);
      if (dataHome) dirs.push(path.join(dataHome, "JetBrains/Toolbox/scripts"));
    }
    for (const dir of dirs) {
      for (const name of editor.commands) candidates.push(path.join(dir, name));
    }
  }

  for (const candidate of candidates) {
    if (yield* isCommandAvailable(candidate, { env })) {
      return Option.some({
        command: candidate,
        baseArgs:
          editor.id === "kiro" && (platform === "darwin" || platform === "win32") ? [] : baseArgs,
      });
    }
  }
  return Option.none();
});
