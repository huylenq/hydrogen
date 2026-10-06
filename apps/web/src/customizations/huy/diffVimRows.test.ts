import { parseDiffFromFile, type FileDiffMetadata, type HunkExpansionRegion } from "@pierre/diffs";
import { describe, expect, it } from "vite-plus/test";
// Pierre does not export its row iterator; the parity test reads it from the package directly.
import { iterateOverDiff } from "../../../node_modules/@pierre/diffs/dist/utils/iterateOverDiff.js";

import {
  cursorAt,
  diffRows,
  hunkText,
  moreContextExpansions,
  rangeBetween,
  searchStop,
  sectionStop,
  siblingStop,
  stepStop,
  stopOf,
  visitLine,
  type DiffNavFile,
  type DiffVimStyle,
} from "./diffVimRows";

const numbered = (count: number) =>
  Array.from({ length: count }, (_, index) => `line ${index + 1}`);

function fileDiff(name: string, before: string[], after: string[]) {
  return parseDiffFromFile(
    { name, contents: `${before.join("\n")}\n` },
    { name, contents: `${after.join("\n")}\n` },
    { context: 3 },
  );
}

// Line 5 changes, line 40 is replaced by two lines: two hunks with a 28-line gap and 17 lines after.
const before = numbered(60);
const after = [...before];
after[4] = "five";
after.splice(39, 1, "forty", "forty bis");
const twoHunks = fileDiff("src/a.ts", before, after);

function nav(
  diffs: ReadonlyArray<readonly [FileDiffMetadata, boolean]>,
  style: DiffVimStyle = "unified",
): DiffNavFile[] {
  return diffs.map(([diff, collapsed], index) => ({
    fileKey: `file-${index}`,
    filePath: diff.name,
    fileDiff: diff,
    collapsed,
    rows: () => diffRows(diff, style, new Map()),
  }));
}

describe("diff rows", () => {
  it.each([
    ["unified", new Map<number, HunkExpansionRegion>()],
    ["split", new Map<number, HunkExpansionRegion>()],
    [
      "unified",
      new Map<number, HunkExpansionRegion>([
        [1, { fromStart: 4, fromEnd: 2 }],
        [2, { fromStart: 5, fromEnd: 0 }],
      ]),
    ],
    ["split", new Map<number, HunkExpansionRegion>([[1, { fromStart: 30, fromEnd: 0 }]])],
  ] as const)("matches Pierre's own %s layout", (style, expanded) => {
    const expected: Array<{ deletion?: number; addition?: number }> = [];
    iterateOverDiff({
      diff: twoHunks,
      diffStyle: style,
      expandedHunks: expanded,
      collapsedContextThreshold: 1,
      callback: ({ deletionLine, additionLine, type }) => {
        expected.push({
          ...(deletionLine && (style === "split" || type !== "change" || !additionLine)
            ? { deletion: deletionLine.lineNumber }
            : {}),
          ...(additionLine ? { addition: additionLine.lineNumber } : {}),
        });
      },
    });
    const rows = diffRows(twoHunks, style, expanded).map((row) => ({
      ...(row.deletion ? { deletion: row.deletion.lineNumber } : {}),
      ...(row.addition ? { addition: row.addition.lineNumber } : {}),
    }));
    expect(rows).toEqual(expected);
  });

  it("marks hunk starts and keeps expanded context out of them", () => {
    const rows = diffRows(twoHunks, "unified", new Map([[1, { fromStart: 0, fromEnd: 3 }]]));
    expect(rows.filter((row) => row.start).map((row) => row.addition?.lineNumber)).toEqual([2, 37]);
    expect(rows[0]).toMatchObject({ kind: "expanded", hunk: 0 });
    const firstOfHunk1 = rows.findIndex((row) => row.hunk === 1);
    expect(rows[firstOfHunk1]).toMatchObject({ kind: "expanded", start: false });
  });

  it("grows the context on both sides of inner gaps only", () => {
    expect(moreContextExpansions(twoHunks)).toEqual([
      [1, "both"],
      [2, "up"],
    ]);
  });
});

describe("diff motions", () => {
  const second = fileDiff("src/b.ts", ["one", "two"], ["one", "deux"]);

  it("walks from header to rows across files and stops at both ends", () => {
    const files = nav([
      [twoHunks, false],
      [second, false],
    ]);
    const rows = files[0]!.rows().length;
    expect(stepStop(files, { file: 0, row: -1 }, 1)).toEqual({ file: 0, row: 0 });
    expect(stepStop(files, { file: 0, row: rows - 1 }, 1)).toEqual({ file: 1, row: -1 });
    expect(stepStop(files, { file: 1, row: -1 }, -1)).toEqual({ file: 0, row: rows - 1 });
    expect(stepStop(files, { file: 0, row: 2 }, -100)).toEqual({ file: 0, row: -1 });
    const last = files[1]!.rows().length - 1;
    expect(stepStop(files, { file: 0, row: 0 }, 1000)).toEqual({ file: 1, row: last });
  });

  it("skips the rows of collapsed files", () => {
    const files = nav([
      [twoHunks, true],
      [second, false],
    ]);
    expect(stepStop(files, { file: 0, row: -1 }, 1)).toEqual({ file: 1, row: -1 });
    expect(
      stopOf(files, { fileKey: "file-0", kind: "line", side: "additions", lineNumber: 5 }),
    ).toBeNull();
  });

  it("moves between sections and siblings like magit", () => {
    const files = nav([
      [twoHunks, false],
      [second, false],
    ]);
    const rows = files[0]!.rows();
    const hunk1 = rows.findIndex((row) => row.hunk === 1 && row.start);
    expect(sectionStop(files, { file: 0, row: -1 }, 1)).toEqual({ file: 0, row: 1 });
    expect(sectionStop(files, { file: 0, row: 1 }, 1)).toEqual({ file: 0, row: hunk1 });
    expect(sectionStop(files, { file: 0, row: hunk1 + 2 }, -1)).toEqual({ file: 0, row: hunk1 });
    expect(sectionStop(files, { file: 0, row: hunk1 }, 1)).toEqual({ file: 1, row: -1 });

    expect(siblingStop(files, { file: 0, row: 3 }, 1)).toEqual({ file: 0, row: hunk1 });
    expect(siblingStop(files, { file: 0, row: hunk1 + 1 }, 1)).toEqual({ file: 1, row: -1 });
    expect(siblingStop(files, { file: 0, row: hunk1 + 1 }, -1)).toEqual({ file: 0, row: 1 });
    expect(siblingStop(files, { file: 0, row: 3 }, -1)).toEqual({ file: 0, row: -1 });
    expect(siblingStop(files, { file: 0, row: -1 }, 1)).toEqual({ file: 1, row: -1 });
    expect(siblingStop(files, { file: 1, row: -1 }, 1)).toBeNull();
  });

  it("keeps the reader's column in split view and reads the new file in unified", () => {
    const split = nav([[twoHunks, false]], "split");
    const changed = split[0]!.rows().findIndex((row) => row.kind === "change");
    expect(cursorAt(split, { file: 0, row: changed }, "deletions", "split")).toEqual({
      fileKey: "file-0",
      kind: "line",
      side: "deletions",
      lineNumber: 5,
    });
    const unified = nav([[twoHunks, false]]);
    expect(cursorAt(unified, { file: 0, row: 0 }, "deletions", "unified")).toMatchObject({
      side: "additions",
      lineNumber: 1,
    });
  });

  it("searches with smartcase, wraps, and looks inside collapsed files", () => {
    const files = nav([
      [twoHunks, false],
      [second, true],
    ]);
    const forty = searchStop(files, { file: 0, row: -1 }, "forty", 1);
    expect(forty && cursorAt(files, forty.stop, forty.side, "unified")).toMatchObject({
      lineNumber: 40,
    });
    expect(searchStop(files, { file: 0, row: -1 }, "Forty", 1)).toBeNull();
    const deleted = searchStop(files, { file: 0, row: -1 }, "line 5", 1);
    expect(deleted?.side).toBe("deletions");
    const hidden = searchStop(files, { file: 0, row: 4 }, "deux", 1);
    expect(hidden?.stop.file).toBe(1);
    const wrapped = searchStop(files, { file: 1, row: -1 }, "five", 1);
    expect(wrapped?.stop.file).toBe(0);
    expect(searchStop(files, { file: 0, row: 5 }, "src/b", -1)?.stop).toEqual({
      file: 1,
      row: -1,
    });
  });

  it("opens deleted lines at the nearest new-file line and orders visual ranges", () => {
    const rows = diffRows(twoHunks, "unified", new Map());
    const deletion = rows.findIndex((row) => row.deletion?.lineNumber === 5 && !row.addition);
    expect(visitLine(rows, deletion)).toBe(5);
    expect(
      rangeBetween(
        rows,
        { fileKey: "f", kind: "line", side: "additions", lineNumber: 6 },
        { fileKey: "f", kind: "line", side: "deletions", lineNumber: 5 },
      ),
    ).toEqual({ start: 5, side: "deletions", end: 6, endSide: "additions" });
  });

  it("copies a hunk as unified diff text", () => {
    expect(hunkText(twoHunks, 0).split("\n")).toEqual([
      "@@ -2,7 +2,7 @@",
      " line 2",
      " line 3",
      " line 4",
      "-line 5",
      "+five",
      " line 6",
      " line 7",
      " line 8",
    ]);
  });
});
