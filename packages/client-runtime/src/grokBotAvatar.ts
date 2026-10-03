export type GrokBotAvatarTheme = "light" | "dark";

export interface GrokBotAvatarSource {
  readonly id: string;
  readonly avatarShape?: string | null | undefined;
  readonly avatarColor?: string | null | undefined;
  readonly avatarVersion?: string | null | undefined;
}

export interface GrokBotGroupAvatarCell {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly cutouts: readonly {
    readonly x: number;
    readonly y: number;
    readonly size: number;
    readonly bodyPath: string | null;
  }[];
}

/** Geometry uses a 36-unit frame with two units of transparent outline clearance. */
export function resolveGrokBotGroupAvatarLayout(
  members: readonly GrokBotAvatarSource[],
  additionalCount: number,
): readonly GrokBotGroupAvatarCell[] {
  const size = members.length === 1 ? 36 : members.length === 2 ? 24 : 20;
  const positions: readonly (readonly [number, number])[] =
    members.length === 1
      ? [[0, 0]]
      : members.length === 2
        ? [
            [0, 0],
            [12, 12],
          ]
        : members.length === 3 && additionalCount === 0
          ? [
              [8, 0],
              [0, 16],
              [16, 16],
            ]
          : [
              [0, 0],
              [16, 0],
              [0, 16],
              [16, 16],
            ];
  const cells = members.slice(0, 4).map((member, index) => {
    const [x, y] = positions[index]!;
    return {
      x,
      y,
      size,
      bodyPath: member.avatarVersion ? null : resolveGrokBotAvatar(member).bodyPath,
    };
  });
  return cells.map((cell, index) => ({
    x: cell.x,
    y: cell.y,
    size: cell.size,
    cutouts: cells.slice(index + 1).map((foreground) => ({
      x: foreground.x - cell.x,
      y: foreground.y - cell.y,
      size: foreground.size,
      bodyPath: foreground.bodyPath,
    })),
  }));
}

/** The native app adds the owner separately; memberIds identify bots in the roster. */
export function resolveGrokBotGroupAvatar<
  T extends { readonly id: string; readonly isGroup: boolean },
>(
  group: { readonly id: string; readonly memberIds: readonly string[] },
  roster: readonly T[],
): { members: T[]; additionalCount: number } {
  const byId = new Map(roster.map((bot) => [bot.id, bot]));
  const members: T[] = [];
  for (const id of new Set(group.memberIds)) {
    const bot = byId.get(id);
    // Unknown participants are not bot identities; do not invent an avatar for them.
    if (bot && bot.id !== group.id && !bot.isGroup) members.push(bot);
  }
  return members.length <= 4
    ? { members, additionalCount: 0 }
    : { members: members.slice(0, 3), additionalCount: members.length - 3 };
}

export interface GrokBotAvatarEye {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
}

// Original silhouettes in a common coordinate system, shared by SVG and react-native-svg.
const silhouettes = {
  blob: {
    path: "M 91 50 C 91 73 73 91 50 91 C 27 91 9 73 9 50 C 9 27 27 9 50 9 C 73 9 91 27 91 50 Z",
    face: [58, 40, 1],
  },
  pebble: {
    path: "M 24 24 C 37 10 61 8 74 18 C 91 30 92 55 82 72 C 72 90 46 91 27 81 C 9 71 8 42 24 24 Z",
    face: [58, 40, 1],
  },
  bean: {
    path: "M 55 11 C 82 8 94 30 88 52 C 82 76 62 91 36 86 C 15 82 8 65 15 52 C 21 40 35 48 42 37 C 48 28 39 16 55 11 Z",
    face: [62, 42, 0.9],
  },
  egg: {
    path: "M 50 8 C 67 8 87 40 87 61 C 87 81 72 91 50 91 C 28 91 13 81 13 61 C 13 40 33 8 50 8 Z",
    face: [50, 49, 1],
  },
  squircle: {
    path: "M 50 11 C 83 11 89 17 89 50 C 89 83 83 89 50 89 C 17 89 11 83 11 50 C 11 17 17 11 50 11 Z",
    face: [51, 44, 1],
  },
  tablet: {
    path: "M 35 22 H 65 C 82 22 93 34 93 50 C 93 66 82 78 65 78 H 35 C 18 78 7 66 7 50 C 7 34 18 22 35 22 Z",
    face: [57, 43, 1],
  },
  capsule: {
    path: "M 50 9 C 69 9 80 21 80 40 V 60 C 80 79 69 91 50 91 C 31 91 20 79 20 60 V 40 C 20 21 31 9 50 9 Z",
    face: [50, 43, 0.9],
  },
  cylinder: {
    path: "M 15 28 C 15 7 85 7 85 28 V 72 C 85 94 15 94 15 72 Z",
    face: [50, 45, 1],
  },
  hex: {
    path: "M 44 10 Q 50 6 56 10 L 83 26 Q 88 29 88 36 V 65 Q 88 71 82 75 L 56 91 Q 50 95 44 91 L 18 75 Q 12 71 12 65 V 36 Q 12 29 17 26 Z",
    face: [56, 41, 1],
  },
  gem: {
    path: "M 50 9 C 63 14 86 37 91 50 C 86 63 63 86 50 91 C 37 86 14 63 9 50 C 14 37 37 14 50 9 Z",
    face: [55, 43, 0.9],
  },
  crystal: {
    path: "M 45 8 Q 50 4 55 8 L 79 30 Q 83 34 82 39 L 72 77 Q 71 81 67 84 L 55 94 Q 50 97 45 94 L 29 82 Q 26 79 25 75 L 17 39 Q 16 34 21 30 Z",
    face: [50, 43, 0.9],
  },
  wedge: {
    path: "M 40 17 Q 50 3 60 17 L 90 69 Q 99 85 80 87 H 20 Q 1 85 10 69 Z",
    face: [56, 53, 0.9],
  },
  shield: {
    path: "M 20 17 Q 50 7 80 17 Q 87 19 87 27 L 83 55 C 81 72 66 85 50 93 C 34 85 19 72 17 55 L 13 27 Q 13 19 20 17 Z",
    face: [50, 43, 1],
  },
  dome: {
    path: "M 10 68 C 10 33 25 12 50 12 C 75 12 90 33 90 68 V 76 Q 90 86 80 86 H 20 Q 10 86 10 76 Z",
    face: [50, 47, 1],
  },
  arch: {
    path: "M 18 82 V 41 C 18 20 30 9 50 9 C 70 9 82 20 82 41 V 82 Q 82 90 73 90 H 27 Q 18 90 18 82 Z",
    face: [50, 40, 0.9],
  },
  cloud: {
    path: "M 15 43 C 12 25 27 12 43 17 C 55 10 74 18 76 34 C 95 36 99 60 87 72 C 80 82 64 84 54 81 C 42 90 27 83 24 79 C 7 79 2 56 15 43 Z",
    face: [57, 44, 1],
  },
  teardrop: {
    path: "M 50 8 C 52 25 86 43 86 63 C 86 83 69 93 50 93 C 31 93 14 83 14 63 C 14 43 48 25 50 8 Z",
    face: [50, 58, 1],
  },
  leaf: {
    path: "M 86 11 C 91 38 89 65 70 80 C 54 94 29 91 18 77 C 5 60 12 39 31 25 C 48 13 69 11 86 11 Z",
    face: [52, 48, 1],
  },
} as const;

// Identity colors and ID-derived defaults follow the installed Grok Bot 0.43.0 renderer.
const palette = {
  black: { light: "#000000", dark: "#FFFFFF" },
  brown: { light: "#A27952", dark: "#855C36" },
  red: { light: "#FF3E51", dark: "#E02135" },
  orange: { light: "#FF781C", dark: "#FF6700" },
  yellow: { light: "#FFAF38", dark: "#FF9800" },
  green: { light: "#00C972", dark: "#009957" },
  cyan: { light: "#1CC3B0", dark: "#00A592" },
  blue: { light: "#2A92FE", dark: "#0E74E0" },
  violet: { light: "#A97EFE", dark: "#804EE0" },
  magenta: { light: "#FF5EB1", dark: "#E02A88" },
  gray: { light: "#959595", dark: "#777777" },
} as const;

export type GrokBotAvatarShape = keyof typeof silhouettes;
export type GrokBotAvatarColor = keyof typeof palette;

export interface GrokBotAvatarModel {
  readonly shape: GrokBotAvatarShape;
  readonly color: GrokBotAvatarColor;
  readonly viewBox: "0 0 100 100";
  readonly bodyPath: string;
  readonly bodyFill: string;
  readonly eyeFill: string;
  readonly eyes: readonly [GrokBotAvatarEye, GrokBotAvatarEye];
}

const defaultShapes: readonly GrokBotAvatarShape[] = [
  "blob",
  "pebble",
  "squircle",
  "tablet",
  "wedge",
  "hex",
  "cloud",
  "teardrop",
];
const defaultColors: readonly GrokBotAvatarColor[] = [
  "brown",
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "violet",
  "magenta",
  "gray",
];

function hashId(id: string): number {
  let hash = 2166136261;
  // UTF-16 code units are intentional, matching IDs in the native JavaScript client.
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

function defaultShape(hash: number): GrokBotAvatarShape {
  const first = Math.imul(hash ^ (hash >>> 16), 73244475);
  const second = Math.imul(first ^ (first >>> 13), 3266489909);
  return defaultShapes[((second ^ (second >>> 16)) >>> 0) % defaultShapes.length] ?? "blob";
}

function defaultColor(hash: number): GrokBotAvatarColor {
  // The native palette's two version-1 seed salts cancel before this PRNG step.
  const seed = (hash + 1831565813) | 0;
  const first = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  const second = (first + Math.imul(first ^ (first >>> 7), 61 | first)) ^ first;
  const fraction = ((second ^ (second >>> 14)) >>> 0) / 4294967296;
  return defaultColors[Math.floor(fraction * defaultColors.length)] ?? "black";
}

export function resolveGrokBotAvatar(
  source: GrokBotAvatarSource,
  theme: GrokBotAvatarTheme = "light",
): GrokBotAvatarModel {
  const hash = hashId(source.id);
  const shape =
    source.avatarShape != null && Object.hasOwn(silhouettes, source.avatarShape)
      ? (source.avatarShape as GrokBotAvatarShape)
      : defaultShape(hash);
  const color =
    source.avatarColor != null && Object.hasOwn(palette, source.avatarColor)
      ? (source.avatarColor as GrokBotAvatarColor)
      : defaultColor(hash);
  const { path, face } = silhouettes[shape];
  const [x, y, scale] = face;
  const eye = { y, rx: 2.4 * scale, ry: 5.7 * scale };

  return {
    shape,
    color,
    viewBox: "0 0 100 100",
    bodyPath: path,
    bodyFill: palette[color][theme],
    eyeFill: theme === "dark" ? "#111111" : "#FFFFFF",
    eyes: [
      { ...eye, x: x - 8 * scale },
      { ...eye, x: x + 8 * scale },
    ],
  };
}
