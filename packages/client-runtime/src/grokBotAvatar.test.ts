import { describe, expect, it } from "@effect/vitest";

import {
  resolveGrokBotAvatar,
  resolveGrokBotGroupAvatar,
  resolveGrokBotGroupAvatarLayout,
} from "./grokBotAvatar.ts";

describe("Grok Bot group avatars", () => {
  const bots = ["a", "b", "c", "d", "e"].map((id) => ({
    id,
    isGroup: false,
    avatarColor: "cyan",
  }));

  it("uses each bot's roster identity in member order and excludes non-bot participants", () => {
    const group = {
      id: "group",
      isGroup: true,
      memberIds: ["owner", "c", "a", "c", "group", "other"],
    };
    const result = resolveGrokBotGroupAvatar(group, [
      ...bots,
      group,
      { id: "other", isGroup: true },
    ]);
    expect(result).toEqual({ members: [bots[2], bots[0]], additionalCount: 0 });
    expect(result.members[0]).toBe(bots[2]);
  });

  it("counts only additional distinct bot members in the overflow badge", () => {
    expect(
      resolveGrokBotGroupAvatar(
        { id: "group", memberIds: ["a", "b", "c", "d", "owner", "d", "e"] },
        bots,
      ),
    ).toEqual({ members: bots.slice(0, 3), additionalCount: 2 });
  });

  it("shows all four bots when the complete group fits the mosaic", () => {
    expect(
      resolveGrokBotGroupAvatar({ id: "group", memberIds: ["a", "b", "c", "d"] }, bots),
    ).toEqual({ members: bots.slice(0, 4), additionalCount: 0 });
  });

  it("supports an incomplete roster without synthesizing participant identities", () => {
    const group = { id: "group", memberIds: ["a", "b"] };
    expect(resolveGrokBotGroupAvatar(group, [])).toEqual({ members: [], additionalCount: 0 });
    expect(resolveGrokBotGroupAvatar(group, bots.slice(0, 1))).toEqual({
      members: [bots[0]],
      additionalCount: 0,
    });
  });

  it("keeps cutouts aligned with the foreground artwork across group layouts", () => {
    for (const count of [1, 2, 3, 4, 5]) {
      const group = resolveGrokBotGroupAvatar(
        { id: "group", memberIds: bots.slice(0, count).map((bot) => bot.id) },
        bots,
      );
      const cells = resolveGrokBotGroupAvatarLayout(group.members, group.additionalCount);
      expect(cells).toHaveLength(group.members.length);
      cells.forEach((cell, index) => {
        expect(cell.x).toBeGreaterThanOrEqual(0);
        expect(cell.y).toBeGreaterThanOrEqual(0);
        expect(cell.x + cell.size).toBeLessThanOrEqual(36);
        expect(cell.y + cell.size).toBeLessThanOrEqual(36);
        expect(cell.cutouts).toHaveLength(cells.length - index - 1);
        cell.cutouts.forEach((cutout, offset) => {
          const foregroundIndex = index + offset + 1;
          const foreground = cells[foregroundIndex]!;
          expect(cell.x + cutout.x).toBe(foreground.x);
          expect(cell.y + cutout.y).toBe(foreground.y);
          expect(cutout.size).toBe(foreground.size);
          expect(cutout.bodyPath).toBe(
            resolveGrokBotAvatar(group.members[foregroundIndex]!).bodyPath,
          );
        });
      });
    }
  });

  it("uses circular clearance for photos and the actual silhouette for bot shapes", () => {
    const cells = resolveGrokBotGroupAvatarLayout(
      [{ id: "rear" }, { id: "front", avatarShape: "cloud" }, { id: "photo", avatarVersion: "v1" }],
      0,
    );
    expect(cells[0]?.cutouts[0]?.bodyPath).toBe(
      resolveGrokBotAvatar({ id: "front", avatarShape: "cloud" }).bodyPath,
    );
    expect(cells[0]?.cutouts[1]?.bodyPath).toBeNull();
  });
});

describe("Grok Bot avatar identity", () => {
  // Fixed results from the 0.43.0 native fallback functions, using synthetic IDs.
  it.each([
    ["dummy", "hex", "yellow"],
    ["bot-a", "tablet", "orange"],
    ["00000000-0000-0000-0000-000000000000", "pebble", "gray"],
    ["550e8400-e29b-41d4-a716-446655440000", "pebble", "violet"],
    ["huy", "wedge", "violet"],
    ["🤖", "hex", "yellow"],
    ["", "hex", "blue"],
  ])("preserves native defaults for ID %j", (id, shape, color) => {
    expect(resolveGrokBotAvatar({ id })).toMatchObject({ shape, color });
  });

  it("accepts explicit shape and color independently of each other", () => {
    expect(resolveGrokBotAvatar({ id: "bot-a", avatarShape: "leaf" })).toMatchObject({
      shape: "leaf",
      color: "orange",
    });
    expect(resolveGrokBotAvatar({ id: "bot-a", avatarColor: "cyan" })).toMatchObject({
      shape: "tablet",
      color: "cyan",
      bodyFill: "#1CC3B0",
    });
  });

  it.each([null, "", "future-avatar-kind", "__proto__", "constructor", "toString", " BLUE "])(
    "falls back safely for unknown metadata %j",
    (unknown) => {
      const source = { id: "bot-a", avatarShape: unknown, avatarColor: unknown };
      expect(resolveGrokBotAvatar(source)).toEqual(resolveGrokBotAvatar({ id: source.id }));
    },
  );

  it("keeps identity stable when switching themes and makes black visible in dark mode", () => {
    const source = { id: "bot-a", avatarShape: "blob", avatarColor: "black" };
    const light = resolveGrokBotAvatar(source, "light");
    const dark = resolveGrokBotAvatar(source, "dark");
    expect(light.bodyFill).toBe("#000000");
    expect(dark.bodyFill).toBe("#FFFFFF");
    expect(light.eyeFill).not.toBe(light.bodyFill);
    expect(dark.eyeFill).not.toBe(dark.bodyFill);
    expect({ ...dark, bodyFill: light.bodyFill, eyeFill: light.eyeFill }).toEqual(light);
  });
});

describe("Grok Bot avatar geometry", () => {
  const shapes = [
    "blob",
    "pebble",
    "bean",
    "egg",
    "squircle",
    "tablet",
    "capsule",
    "cylinder",
    "hex",
    "gem",
    "crystal",
    "wedge",
    "shield",
    "dome",
    "arch",
    "cloud",
    "teardrop",
    "leaf",
  ];

  it("renders every known shape with distinct closed geometry inside the shared view box", () => {
    const paths = new Set<string>();
    for (const shape of shapes) {
      const avatar = resolveGrokBotAvatar({ id: "bot-a", avatarShape: shape });
      expect(avatar.shape).toBe(shape);
      expect(avatar.bodyPath).toMatch(/^M [\d\s.MCLQHVZ]+ Z$/);
      const coordinates = avatar.bodyPath.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      expect(coordinates.length).toBeGreaterThan(10);
      expect(coordinates.every((coordinate) => Number.isFinite(coordinate))).toBe(true);
      expect(Math.min(...coordinates)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...coordinates)).toBeLessThanOrEqual(100);
      for (const eye of avatar.eyes) {
        expect(eye.rx).toBeGreaterThan(0);
        expect(eye.ry).toBeGreaterThan(0);
        expect(eye.x - eye.rx).toBeGreaterThan(0);
        expect(eye.x + eye.rx).toBeLessThan(100);
        expect(eye.y - eye.ry).toBeGreaterThan(0);
        expect(eye.y + eye.ry).toBeLessThan(100);
      }
      paths.add(avatar.bodyPath);
    }
    expect(paths.size).toBe(shapes.length);
  });
});
