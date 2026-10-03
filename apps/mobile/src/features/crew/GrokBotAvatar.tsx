import type { CrewBot, EnvironmentId } from "@t3tools/contracts";
import {
  resolveGrokBotAvatar,
  resolveGrokBotGroupAvatar,
  resolveGrokBotGroupAvatarLayout,
  type GrokBotAvatarModel,
} from "@t3tools/client-runtime/grok-bot-avatar";
import { MaskedView } from "@expo/ui/community/masked-view";
import { useIsFocused } from "@react-navigation/native";
import { Image } from "expo-image";
import { useEffect, useId, useState, type ReactNode } from "react";
import { AccessibilityInfo, AppState, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, Defs, Ellipse, Mask, Path, Rect } from "react-native-svg";

import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { crewEnvironment } from "../../state/crew";
import { useEnvironmentQuery } from "../../state/query";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

export function GrokBotAvatar(props: {
  readonly environmentId: EnvironmentId;
  readonly accountScope: string | null;
  readonly bot: CrewBot;
  readonly roster?: readonly CrewBot[] | undefined;
  readonly size?: number;
  readonly animated?: boolean;
}) {
  const { themeAppearance } = useAppearancePreferences();
  const size = props.size ?? 40;
  const query = useEnvironmentQuery(
    props.accountScope && props.bot.avatarVersion
      ? crewEnvironment.avatar({
          environmentId: props.environmentId,
          input: {
            accountScope: props.accountScope,
            botId: props.bot.id,
            version: props.bot.avatarVersion,
          },
        })
      : null,
  );
  const dataUrl =
    query.data?.accountScope === props.accountScope &&
    query.data?.botId === props.bot.id &&
    query.data?.version === props.bot.avatarVersion
      ? (query.data.dataUrl ?? null)
      : null;
  const model = resolveGrokBotAvatar(props.bot, themeAppearance);
  const isPlainGroup =
    props.bot.isGroup &&
    !props.bot.avatarShape &&
    !props.bot.avatarColor &&
    !props.bot.avatarVersion;
  const group = isPlainGroup ? resolveGrokBotGroupAvatar(props.bot, props.roster ?? []) : null;
  const imageKey = JSON.stringify([
    props.environmentId,
    props.accountScope,
    props.bot.id,
    props.bot.avatarVersion,
  ]);
  const artworkProps = { model, size, dataUrl, isPlainGroup, imageKey };

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      className="shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      {group && group.members.length > 0 ? (
        <GroupAvatar
          environmentId={props.environmentId}
          accountScope={props.accountScope}
          members={group.members}
          additionalCount={group.additionalCount}
          size={size}
        />
      ) : (
        <AvatarArtwork key={imageKey} {...artworkProps} animated={props.animated ?? false} />
      )}
    </View>
  );
}

function GroupAvatar(props: {
  readonly environmentId: EnvironmentId;
  readonly accountScope: string | null;
  readonly members: readonly CrewBot[];
  readonly additionalCount: number;
  readonly size: number;
}) {
  const { members, additionalCount, size } = props;
  const cells = resolveGrokBotGroupAvatarLayout(members, additionalCount);
  const scale = size / 36;

  return (
    <View style={{ width: size, height: size }}>
      {members.map((member, index) => {
        const cell = cells[index];
        if (!cell) return null;
        return (
          <View
            key={member.id}
            style={{ position: "absolute", left: cell.x * scale, top: cell.y * scale }}
          >
            <GroupAvatarMask cell={cell} size={cell.size * scale}>
              <GrokBotAvatar
                environmentId={props.environmentId}
                accountScope={props.accountScope}
                bot={member}
                size={cell.size * scale}
              />
            </GroupAvatarMask>
          </View>
        );
      })}
      {additionalCount > 0 ? (
        <View
          className="items-center justify-center"
          style={{
            position: "absolute",
            left: 16 * scale,
            top: 16 * scale,
            width: 20 * scale,
            height: 20 * scale,
          }}
        >
          <Text
            numberOfLines={1}
            className="font-t3-bold text-foreground-muted"
            style={{
              fontSize: size * (additionalCount > 99 ? 0.21 : additionalCount > 9 ? 0.25 : 0.3),
            }}
          >
            +{additionalCount}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function GroupAvatarMask(props: {
  readonly cell: ReturnType<typeof resolveGrokBotGroupAvatarLayout>[number];
  readonly size: number;
  readonly children: ReactNode;
}) {
  const maskId = `grok-group-${useId().replaceAll(":", "")}`;
  const { cell, size, children } = props;
  if (cell.cutouts.length === 0) return children;

  return (
    <MaskedView
      style={{ width: size, height: size }}
      maskElement={
        <Svg width={size} height={size} viewBox={`0 0 ${cell.size} ${cell.size}`}>
          <Defs>
            <Mask
              id={maskId}
              x={0}
              y={0}
              width={cell.size}
              height={cell.size}
              maskUnits="userSpaceOnUse"
              maskContentUnits="userSpaceOnUse"
              maskType="luminance"
            >
              <Rect width={cell.size} height={cell.size} fill="white" />
              {cell.cutouts.map((cutout) =>
                cutout.bodyPath === null ? (
                  <Circle
                    key={`${cutout.x}:${cutout.y}`}
                    cx={cutout.x + cutout.size / 2}
                    cy={cutout.y + cutout.size / 2}
                    r={cutout.size / 2}
                    fill="black"
                    stroke="black"
                    strokeWidth={4}
                  />
                ) : (
                  <Path
                    key={`${cutout.x}:${cutout.y}`}
                    d={cutout.bodyPath}
                    transform={`translate(${cutout.x} ${cutout.y}) scale(${cutout.size / 100})`}
                    fill="black"
                    stroke="black"
                    strokeWidth={4 / (cutout.size / 100)}
                    strokeLinejoin="round"
                  />
                ),
              )}
            </Mask>
          </Defs>
          <Rect width={cell.size} height={cell.size} fill="white" mask={`url(#${maskId})`} />
        </Svg>
      }
    >
      {children}
    </MaskedView>
  );
}

function AnimatedAvatarDrawing(props: { model: GrokBotAvatarModel; size: number }) {
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === "active");
  const [reducedMotion, setReducedMotion] = useState(true);
  const screenIsFocused = useIsFocused();
  const bob = useSharedValue(0);
  const blink = useSharedValue(1);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setAppIsActive(state === "active");
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let active = true;
    let receivedChange = false;
    void AccessibilityInfo.isReduceMotionEnabled().then(
      (enabled) => {
        if (active && !receivedChange) setReducedMotion(enabled);
      },
      () => {},
    );
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      receivedChange = true;
      setReducedMotion(enabled);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    cancelAnimation(bob);
    cancelAnimation(blink);
    bob.set(0);
    blink.set(1);
    if (reducedMotion || !appIsActive || !screenIsFocused) return;

    // Long rests keep only the selected avatar lively without continuously repainting.
    bob.set(
      withRepeat(
        withDelay(
          5200,
          withSequence(
            withTiming(-1.5, { duration: 650, easing: Easing.inOut(Easing.quad) }),
            withTiming(0, { duration: 650, easing: Easing.inOut(Easing.quad) }),
          ),
        ),
        -1,
      ),
    );
    blink.set(
      withRepeat(
        withDelay(
          4200,
          withSequence(withTiming(0.12, { duration: 90 }), withTiming(1, { duration: 130 })),
        ),
        -1,
      ),
    );
    return () => {
      cancelAnimation(bob);
      cancelAnimation(blink);
    };
  }, [appIsActive, blink, bob, reducedMotion, screenIsFocused]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));
  return (
    <Animated.View style={style}>
      <AvatarDrawing {...props} blink={blink} />
    </Animated.View>
  );
}

interface AvatarArtworkProps {
  readonly model: GrokBotAvatarModel;
  readonly size: number;
  readonly dataUrl: string | null;
  readonly imageKey: string;
  readonly isPlainGroup: boolean;
  readonly animated: boolean;
}

function AvatarArtwork({
  model,
  size,
  dataUrl,
  imageKey,
  isPlainGroup,
  animated,
}: AvatarArtworkProps) {
  const [loadedDataUrl, setLoadedDataUrl] = useState<string | null>(null);
  const [failedDataUrl, setFailedDataUrl] = useState<string | null>(null);
  const showImage = dataUrl !== null && dataUrl === loadedDataUrl && dataUrl !== failedDataUrl;

  return (
    <View style={{ width: size, height: size }}>
      {!showImage ? (
        isPlainGroup ? (
          <View
            className="items-center justify-center rounded-full bg-subtle"
            style={{ width: size, height: size }}
          >
            <SymbolView
              name="point.3.connected.trianglepath.dotted"
              size={size * 0.45}
              tintColorClassName="accent-icon-muted"
            />
          </View>
        ) : animated ? (
          <AnimatedAvatarDrawing model={model} size={size} />
        ) : (
          <AvatarDrawing model={model} size={size} />
        )
      ) : null}
      {dataUrl && dataUrl !== failedDataUrl ? (
        <Image
          source={{ uri: dataUrl }}
          cachePolicy="memory"
          recyclingKey={imageKey}
          contentFit="cover"
          accessible={false}
          style={{
            position: "absolute",
            width: size,
            height: size,
            borderRadius: size / 2,
            opacity: showImage ? 1 : 0,
          }}
          onLoad={() => setLoadedDataUrl(dataUrl)}
          onError={() => setFailedDataUrl(dataUrl)}
        />
      ) : null}
    </View>
  );
}

function AvatarDrawing({
  model,
  size,
  blink,
}: {
  readonly model: GrokBotAvatarModel;
  readonly size: number;
  readonly blink?: SharedValue<number>;
}) {
  return (
    <Svg width={size} height={size} viewBox={model.viewBox}>
      <Path d={model.bodyPath} fill={model.bodyFill} />
      {blink ? (
        <AnimatedEyes model={model} blink={blink} />
      ) : (
        model.eyes.map((eye) => (
          <Ellipse key={eye.x} cx={eye.x} cy={eye.y} rx={eye.rx} ry={eye.ry} fill={model.eyeFill} />
        ))
      )}
    </Svg>
  );
}

function AnimatedEyes({ model, blink }: { model: GrokBotAvatarModel; blink: SharedValue<number> }) {
  const animatedProps = useAnimatedProps(() => ({ ry: model.eyes[0].ry * blink.value }));
  return model.eyes.map((eye) => (
    <AnimatedEllipse
      key={eye.x}
      cx={eye.x}
      cy={eye.y}
      rx={eye.rx}
      fill={model.eyeFill}
      animatedProps={animatedProps}
    />
  ));
}
