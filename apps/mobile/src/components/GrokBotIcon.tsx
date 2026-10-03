import { Image } from "expo-image";

const GROK_BOT_ICON_SOURCE = require("../../../../assets/integrations/grokbot.png");

export function GrokBotIcon({ size = 16 }: { readonly size?: number }) {
  return (
    <Image
      source={GROK_BOT_ICON_SOURCE}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      accessibilityIgnoresInvertColors
      contentFit="contain"
      style={{ width: size, height: size }}
    />
  );
}
