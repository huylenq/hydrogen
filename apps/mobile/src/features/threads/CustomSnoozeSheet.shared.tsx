import { useSnoozeForm, SnoozeDurationFields } from "../../customizations/huy/SnoozeForm.shared";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";

import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { AppText } from "../../components/AppText";
import { SegmentedControl } from "../../components/SegmentedControl";

export function CustomSnoozeSheet(props: {
  readonly onClose: () => void;
  readonly onSnooze: (snoozedUntil: string) => void;
}) {
  const form = useSnoozeForm();
  const { mode, setMode, date, setDate, picker, setPicker, error, setError } = form;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={props.onClose}>
      <KeyboardAvoidingView
        className="flex-1 items-center justify-center bg-backdrop px-6"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="max-h-[80%] w-full max-w-md grow-0 rounded-3xl bg-screen"
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ padding: 24, paddingBottom: 24, gap: 20 }}
        >
          <AppText accessibilityRole="header" className="text-xl font-t3-semibold">
            Custom snooze
          </AppText>
          <AppText className="text-base text-foreground-secondary">
            Choose when snoozed threads return to your inbox.
          </AppText>
          <SegmentedControl
            options={
              [
                { value: "date", label: "Date and time" },
                { value: "duration", label: "Duration" },
              ] as const
            }
            selected={mode}
            onSelect={(value) => {
              setMode(value);
              setPicker(null);
              setError(null);
            }}
            role="tab"
          />
          {mode === "date" ? (
            <View className="gap-3">
              {(["date", "time"] as const).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={value === "date" ? "Choose date" : "Choose time"}
                  className="min-h-12 flex-row items-center justify-between rounded-xl bg-subtle px-3"
                  onPress={() => setPicker(value)}
                >
                  <AppText>{value === "date" ? "Date" : "Time"}</AppText>
                  <AppText>
                    {value === "date"
                      ? date.toLocaleDateString()
                      : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </AppText>
                </Pressable>
              ))}
              {picker && (
                <DateTimePicker
                  value={date}
                  mode={picker}
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onDismiss={() => setPicker(null)}
                  onValueChange={(_, selected) => {
                    const next = new Date(date);
                    if (picker === "date")
                      next.setFullYear(
                        selected.getFullYear(),
                        selected.getMonth(),
                        selected.getDate(),
                      );
                    else next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
                    setDate(next);
                    setError(null);
                  }}
                />
              )}
            </View>
          ) : (
            <SnoozeDurationFields form={form} />
          )}
          {error && (
            <AppText accessibilityRole="alert" className="text-danger-foreground">
              {error}
            </AppText>
          )}
          <View className="flex-row justify-end gap-3">
            <Pressable
              accessibilityRole="button"
              className="min-h-12 justify-center px-3"
              onPress={props.onClose}
            >
              <AppText>Cancel</AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              className="min-h-12 justify-center rounded-xl bg-subtle px-3"
              onPress={() => {
                const snoozedUntil = form.resolve();
                if (snoozedUntil === null) return;
                props.onSnooze(snoozedUntil);
                props.onClose();
              }}
            >
              <AppText className="text-foreground">Snooze</AppText>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
