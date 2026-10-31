import type { CrewBot, CrewEntry, EnvironmentId } from "@t3tools/contracts";
import { memo, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";
import { Menu } from "../../components/ui/Menu";
import { GrokBotIcon } from "../../components/GrokBotIcon";
import { resolveNativeMarkdownTypography } from "../../lib/appearancePreferences";
import { cn } from "../../lib/cn";
import { tryOpenExternalUrl } from "../../lib/openExternalUrl";
import { FONT_FAMILIES } from "../../lib/fontFamilies";
import { useUniwindTheme } from "../../lib/useUniwindTheme";
import {
  SelectableMarkdownText,
  type NativeMarkdownTextStyle,
} from "../../native/SelectableMarkdownText";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";
import { GrokBotAvatar } from "./GrokBotAvatar";

interface CrewConversationMessageProps {
  readonly entry: CrewEntry;
  readonly bot: CrewBot;
  readonly roster: readonly CrewBot[];
  readonly environmentId: EnvironmentId;
  readonly accountScope: string | null;
  readonly linkedToAnotherTask: boolean;
  readonly onUseReply?: (() => void) | undefined;
}

export const CrewConversationMessage = memo(function CrewConversationMessage(
  props: CrewConversationMessageProps,
) {
  const { entry, roster, bot } = props;
  const [expanded, setExpanded] = useState(false);

  if (entry.interBot) {
    const peer = roster.find((item) => item.id === entry.interBot?.botId);
    const peerName = peer?.name || entry.interBot.botName || "another bot";
    const direction = entry.interBot.direction === "incoming" ? "Message from" : "Messaged";
    return (
      <View className="items-center gap-2 py-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${direction} ${peerName}`}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((current) => !current)}
          className="min-h-11 max-w-full flex-row items-center justify-center gap-1.5 rounded-xl px-2 active:bg-subtle"
        >
          <Text className="text-xs text-foreground-muted">{direction}</Text>
          {peer ? (
            <GrokBotAvatar
              environmentId={props.environmentId}
              accountScope={props.accountScope}
              bot={peer}
              roster={roster}
              size={20}
            />
          ) : (
            <GrokBotIcon size={16} />
          )}
          <Text numberOfLines={1} className="shrink text-xs font-t3-medium text-foreground-muted">
            {peerName}
          </Text>
          <SymbolView
            name={expanded ? "chevron.down" : "chevron.right"}
            size={11}
            tintColorClassName="accent-icon-muted"
          />
        </Pressable>
        {expanded ? (
          <View className="w-full gap-2 rounded-xl border border-border px-3 py-2">
            {entry.text ? <CrewMarkdown text={entry.text} /> : null}
            <CrewMessageStatus entry={entry} />
          </View>
        ) : null}
      </View>
    );
  }

  const isUser = entry.role === "user";
  const author = roster.find((item) => item.id === entry.authorBotId);
  const bubble = (
    <Pressable
      accessibilityHint={
        props.onUseReply ? "Long press to use this reply in the coding task draft." : undefined
      }
      accessibilityActions={
        props.onUseReply ? [{ name: "use-in-draft", label: "Use in draft" }] : undefined
      }
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "use-in-draft") props.onUseReply?.();
      }}
      className={cn(
        "min-w-0 gap-2 rounded-[20px] px-3.5 py-2.5",
        isUser ? "bg-user-bubble" : "bg-subtle",
      )}
    >
      {entry.text ? <CrewMarkdown text={entry.text} user={isUser} /> : null}
      <CrewMessageStatus entry={entry} user={isUser} />
      {props.linkedToAnotherTask ? (
        <Text className="text-xs text-foreground-muted">Reply linked to another task.</Text>
      ) : null}
    </Pressable>
  );

  return (
    <View className={cn("gap-1.5", isUser ? "ml-8 items-end" : "mr-8 items-start")}>
      {bot.isGroup ? (
        <View className="max-w-full flex-row items-center gap-1.5 px-1">
          {author ? (
            <GrokBotAvatar
              environmentId={props.environmentId}
              accountScope={props.accountScope}
              bot={author}
              roster={roster}
              size={20}
            />
          ) : null}
          <Text numberOfLines={1} className="shrink text-xs font-t3-medium text-foreground-muted">
            {author?.name || entry.author || (isUser ? "You" : bot.name)}
          </Text>
        </View>
      ) : null}
      <View className="max-w-full">
        {props.onUseReply ? (
          <Menu
            shouldOpenOnLongPress
            actions={[{ id: "use-in-draft", title: "Use in draft" }]}
            onPressAction={({ nativeEvent }) => {
              if (nativeEvent.event === "use-in-draft") props.onUseReply?.();
            }}
          >
            {bubble}
          </Menu>
        ) : (
          bubble
        )}
      </View>
    </View>
  );
});

function CrewMessageStatus({ entry, user = false }: { entry: CrewEntry; user?: boolean }) {
  const className = cn(
    "text-xs leading-normal",
    user ? "text-user-bubble-foreground-muted" : "text-foreground-muted",
  );
  return (
    <>
      {entry.unsupportedKind ? (
        <Text className={className}>Open Grok Bot to view {entry.unsupportedKind}.</Text>
      ) : null}
      {entry.streaming ? <Text className={className}>Receiving reply…</Text> : null}
    </>
  );
}

function openMarkdownLink(href: string) {
  if (/^https?:\/\//i.test(href)) void tryOpenExternalUrl(href, "markdown-link");
  return false;
}

function CrewMarkdown({ text, user = false }: { text: string; user?: boolean }) {
  const theme = useUniwindTheme();
  const { appearance } = useAppearancePreferences();
  const regularFontFamily = FONT_FAMILIES.regular;
  const boldFontFamily = FONT_FAMILIES.bold;
  const styles = useMemo(() => {
    const typography = resolveNativeMarkdownTypography(appearance.baseFontSize);
    const body = theme[user ? "--color-user-bubble-foreground" : "--color-md-body"];
    const strong = user ? body : theme["--color-md-strong"];
    const muted = theme[user ? "--color-user-bubble-foreground-muted" : "--color-foreground-muted"];
    const link = user ? body : theme["--color-md-link"];
    const code = theme[user ? "--color-md-user-code-text" : "--color-md-code-text"];
    const codeBackground = theme[user ? "--color-md-user-code-bg" : "--color-md-code-bg"];
    const quote = user ? muted : theme["--color-md-blockquote-border"];
    const divider = user ? muted : theme["--color-md-hr"];
    const native: NativeMarkdownTextStyle = {
      ...typography,
      color: body,
      strongColor: strong,
      mutedColor: muted,
      linkColor: link,
      inlineCodeColor: code,
      codeColor: code,
      codeBackgroundColor: codeBackground,
      codeBlockBackgroundColor: codeBackground,
      fileTextColor: code,
      quoteMarkerColor: quote,
      dividerColor: divider,
      fontFamily: regularFontFamily,
      headingFontFamily: boldFontFamily,
      boldFontFamily,
    };
    return { native };
  }, [appearance.baseFontSize, boldFontFamily, regularFontFamily, theme, user]);

  return (
    <SelectableMarkdownText
      markdown={text}
      preserveSoftBreaks={user}
      textStyle={styles.native}
      onLinkPress={openMarkdownLink}
      marginTop={0}
      marginBottom={0}
    />
  );
}
