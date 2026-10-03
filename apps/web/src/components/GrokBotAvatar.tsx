import {
  resolveGrokBotAvatar,
  resolveGrokBotGroupAvatar,
  resolveGrokBotGroupAvatarLayout,
  type GrokBotGroupAvatarCell,
} from "@t3tools/client-runtime/grok-bot-avatar";
import type { CrewBot, EnvironmentId } from "@t3tools/contracts";
import { UsersIcon } from "lucide-react";
import { useState } from "react";

import { useTheme } from "../hooks/useTheme";
import { cn } from "../lib/utils";
import { observeVisibleAnimation } from "../lib/visibleAnimation";
import { crewEnvironment } from "../state/crew";
import { useEnvironmentQuery } from "../state/query";
import "./GrokBotAvatar.css";

interface GrokBotAvatarProps {
  bot: CrewBot;
  roster?: readonly CrewBot[] | undefined;
  environmentId: EnvironmentId;
  accountScope: string | null;
  size?: number;
  animated?: boolean;
  className?: string;
}

/** Decorative identity beside a bot name; only the selected conversation moves. */
export function GrokBotAvatar({
  bot,
  roster,
  environmentId,
  accountScope,
  size = 32,
  animated = false,
  className,
}: GrokBotAvatarProps) {
  const { resolvedTheme } = useTheme();
  const avatar = resolveGrokBotAvatar(bot, resolvedTheme);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const picture = useEnvironmentQuery(
    bot.avatarVersion && accountScope
      ? crewEnvironment.avatar({
          environmentId,
          input: { accountScope, botId: bot.id, version: bot.avatarVersion },
        })
      : null,
  );
  const image =
    picture.data?.accountScope === accountScope &&
    picture.data?.botId === bot.id &&
    picture.data?.version === bot.avatarVersion
      ? picture.data.dataUrl
      : null;
  const showImage = image && image !== failedImage;
  const showGroup = bot.isGroup && !bot.avatarShape && !bot.avatarColor && !bot.avatarVersion;
  const group = showGroup && roster ? resolveGrokBotGroupAvatar(bot, roster) : null;
  const cells = group ? resolveGrokBotGroupAvatarLayout(group.members, group.additionalCount) : [];

  return (
    <span
      aria-hidden="true"
      className={cn("grok-bot-avatar inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      data-animated={animated && !showImage && !showGroup ? "true" : undefined}
      data-avatar-shape={showImage || showGroup ? undefined : avatar.shape}
      data-avatar-color={showImage || showGroup ? undefined : avatar.color}
      ref={animated && !showImage && !showGroup ? observeVisibleAnimation : undefined}
    >
      {showImage ? (
        <img
          src={image}
          alt=""
          width={size}
          height={size}
          className="size-full rounded-full object-cover"
          draggable={false}
          decoding="async"
          onError={() => setFailedImage(image)}
        />
      ) : showGroup ? (
        group && group.members.length > 0 ? (
          <span className="grok-bot-group-avatar relative size-full">
            {group.members.map((member, index) => {
              const cell = cells[index]!;
              return (
                <span
                  key={member.id}
                  className="absolute flex"
                  style={{
                    left: (cell.x / 36) * size,
                    top: (cell.y / 36) * size,
                    width: (cell.size / 36) * size,
                    height: (cell.size / 36) * size,
                    maskImage: groupAvatarMask(cell),
                    maskSize: "100% 100%",
                  }}
                >
                  <GrokBotAvatar
                    bot={member}
                    environmentId={environmentId}
                    accountScope={accountScope}
                    size={(cell.size / 36) * size}
                  />
                </span>
              );
            })}
            {group.additionalCount > 0 ? (
              <span
                className="absolute right-0 bottom-0 flex items-center justify-center font-semibold tabular-nums text-muted-foreground"
                style={{
                  width: (20 / 36) * size,
                  height: (20 / 36) * size,
                  fontSize:
                    size *
                    (group.additionalCount < 10 ? 0.3 : group.additionalCount < 100 ? 0.25 : 0.21),
                  lineHeight: 1,
                }}
              >
                +{group.additionalCount}
              </span>
            ) : null}
          </span>
        ) : (
          <UsersIcon className="size-4 text-muted-foreground" />
        )
      ) : (
        <svg viewBox={avatar.viewBox} className="size-full overflow-visible" focusable="false">
          <g className="grok-bot-avatar-body">
            <path d={avatar.bodyPath} fill={avatar.bodyFill} />
            <g className="grok-bot-avatar-eyes" fill={avatar.eyeFill}>
              {avatar.eyes.map((eye) => (
                <ellipse key={eye.x} cx={eye.x} cy={eye.y} rx={eye.rx} ry={eye.ry} />
              ))}
            </g>
          </g>
        </svg>
      )}
    </span>
  );
}

/** Cut out foreground silhouettes so hover/selection backgrounds show through the rim. */
function groupAvatarMask(cell: GrokBotGroupAvatarCell): string | undefined {
  if (cell.cutouts.length === 0) return undefined;
  const shapes = cell.cutouts
    .map(({ x, y, size, bodyPath }) =>
      bodyPath
        ? `<path d="${bodyPath}" transform="translate(${x} ${y}) scale(${size / 100})" stroke="black" stroke-width="${4 / (size / 100)}" stroke-linejoin="round"/>`
        : `<circle cx="${x + size / 2}" cy="${y + size / 2}" r="${size / 2 + 2}"/>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cell.size} ${cell.size}"><defs><mask id="rim" maskUnits="userSpaceOnUse" x="0" y="0" width="${cell.size}" height="${cell.size}" mask-type="luminance"><rect width="${cell.size}" height="${cell.size}" fill="white"/><g fill="black">${shapes}</g></mask></defs><rect width="${cell.size}" height="${cell.size}" fill="white" mask="url(#rim)"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
