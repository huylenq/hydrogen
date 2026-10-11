import { SnoozeFormFields, useSnoozeForm } from "../../customizations/huy/SnoozeForm.ios";
import { Host, Popover, RNHostView, Spacer, VStack } from "@expo/ui/swift-ui";
import { accessibilityHidden, frame } from "@expo/ui/swift-ui/modifiers";

import { type ReactNode } from "react";
import { NavigationContainer, NavigationIndependentTree } from "@react-navigation/native";
import { createV5StackNavigator as createNativeStackNavigator } from "../../native/createV5StackNavigator";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { useMobileNavigationTheme } from "../../lib/useMobileNavigationTheme";
import { NativeHeaderToolbar } from "../../native/StackHeader";
import { NATIVE_LIQUID_GLASS_SUPPORTED } from "../../native/native-glass";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";

const SnoozeStack = createNativeStackNavigator<{ CustomSnooze: undefined }>();
export function CustomSnoozeSheet(props: {
  readonly onClose: () => void;
  readonly onSnooze: (snoozedUntil: string) => void;
}) {
  const { width, height } = useWindowDimensions();
  const form = useSnoozeForm();
  const { themeVariables: colors, themeAppearance } = useAppearancePreferences();
  const popoverWidth = Math.min(360, width - 32);
  const popoverHeight = Math.min(form.error ? 364 : 324, height - 96);
  const submit = () => {
    const snoozedUntil = form.resolve();
    if (snoozedUntil === null) return;
    props.onSnooze(snoozedUntil);
    props.onClose();
  };

  return (
    <Host
      style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
      colorScheme={themeAppearance}
      seedColor={colors["--color-primary"]}
    >
      <Popover
        isPresented
        onIsPresentedChange={(presented) => {
          if (!presented) props.onClose();
        }}
      >
        <Popover.Trigger>
          <Spacer
            modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity }), accessibilityHidden()]}
          />
        </Popover.Trigger>
        <Popover.Content>
          <SnoozePopoverNavigation
            width={popoverWidth}
            height={popoverHeight}
            onClose={props.onClose}
            onSubmit={submit}
          >
            <Host
              matchContents={{ vertical: true }}
              colorScheme={themeAppearance}
              style={{ width: popoverWidth }}
            >
              <SnoozeFormFields form={form} />
            </Host>
          </SnoozePopoverNavigation>
        </Popover.Content>
      </Popover>
    </Host>
  );
}

/** The popover owns a native navigation bar, just like the app's sheet screens. */
function SnoozePopoverNavigation(props: {
  readonly width: number;
  readonly height: number;
  readonly onClose: () => void;
  readonly onSubmit: () => void;
  readonly children: ReactNode;
}) {
  const navigationTheme = useMobileNavigationTheme();
  const { themeVariables: colors } = useAppearancePreferences();

  return (
    <VStack modifiers={[frame({ width: props.width, height: props.height })]}>
      <RNHostView>
        <View style={{ width: props.width, height: props.height }}>
          <NavigationIndependentTree>
            <NavigationContainer theme={navigationTheme}>
              <SnoozeStack.Navigator
                screenOptions={{
                  contentStyle: { backgroundColor: "transparent" },
                  headerShadowVisible: false,
                  headerStyle: {
                    backgroundColor: NATIVE_LIQUID_GLASS_SUPPORTED
                      ? "transparent"
                      : colors["--color-card"],
                  },
                  headerTintColor: colors["--color-foreground"],
                  headerTitleStyle: { fontSize: 17, fontWeight: "700" },
                  headerTransparent: NATIVE_LIQUID_GLASS_SUPPORTED,
                  title: "Custom snooze",
                }}
              >
                <SnoozeStack.Screen name="CustomSnooze">
                  {() => (
                    <>
                      <NativeHeaderToolbar placement="left">
                        <NativeHeaderToolbar.Button
                          accessibilityLabel="Cancel custom snooze"
                          icon="xmark"
                          onPress={props.onClose}
                        />
                      </NativeHeaderToolbar>
                      <NativeHeaderToolbar placement="right">
                        <NativeHeaderToolbar.Button label="Snooze" onPress={props.onSubmit} />
                      </NativeHeaderToolbar>
                      <ScrollView
                        contentInsetAdjustmentBehavior="automatic"
                        showsVerticalScrollIndicator={false}
                      >
                        {props.children}
                      </ScrollView>
                    </>
                  )}
                </SnoozeStack.Screen>
              </SnoozeStack.Navigator>
            </NavigationContainer>
          </NavigationIndependentTree>
        </View>
      </RNHostView>
    </VStack>
  );
}
