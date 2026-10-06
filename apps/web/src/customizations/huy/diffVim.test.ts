import { describe, expect, it } from "vite-plus/test";

import { DIFF_VIM_BINDINGS, DIFF_VIM_CHEATSHEET, diffVimKeyLabels } from "./diffVim";

describe("diff key cheatsheet", () => {
  it("lists every diff command exactly once", () => {
    const listed = DIFF_VIM_CHEATSHEET.flatMap((section) => section.commands);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].toSorted()).toEqual(
      [...new Set(DIFF_VIM_BINDINGS.map((binding) => binding.command))].toSorted(),
    );
  });

  it("shows each of a command's key sequences", () => {
    expect(diffVimKeyLabels("diff.level.all")).toEqual(["Alt+2"]);
    expect(diffVimKeyLabels("diff.page.down")).toEqual(["Space", "Ctrl+f"]);
    expect(diffVimKeyLabels("diff.yank.line")).toEqual(["y y"]);
  });
});
