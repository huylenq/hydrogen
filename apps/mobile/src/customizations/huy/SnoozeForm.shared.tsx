import {
  localSnoozeDate,
  localSnoozeTime,
  resolveCustomSnooze,
  type CustomSnoozeInput,
} from "@t3tools/client-runtime/state/thread-settled";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { AppText } from "../../components/AppText";

export function useSnoozeForm() {
  const [mode, setMode] = useState<CustomSnoozeInput["mode"]>("duration");
  const [date, setDate] = useState(() => new Date(Date.now() + 3_600_000));
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  const [amount, setAmount] = useState("30");
  const [unit, setUnit] = useState<"minutes" | "hours" | "days">("minutes");
  const [error, setError] = useState<string | null>(null);
  return {
    mode,
    setMode,
    date,
    setDate,
    picker,
    setPicker,
    error,
    amount,
    setAmount,
    unit,
    setUnit,
    setError,
    resolve() {
      const input: CustomSnoozeInput =
        mode === "date"
          ? { mode, date: localSnoozeDate(date), time: localSnoozeTime(date) }
          : { mode, amount: amount.replace(",", "."), unit };
      const snoozedUntil = resolveCustomSnooze(input, new Date());
      if (!snoozedUntil) {
        setError(
          mode === "date" ? "Choose a date and time in the future." : "Enter a positive duration.",
        );
        return null;
      }
      return snoozedUntil;
    },
  };
}

export function SnoozeDurationFields({ form }: { form: ReturnType<typeof useSnoozeForm> }) {
  const { amount, setAmount, unit, setUnit, setError } = form;
  return (
    <View className="gap-3">
      <AppText>Snooze for</AppText>
      <TextInput
        accessibilityLabel="Duration"
        className="min-h-12 rounded-xl bg-subtle px-3 text-base text-foreground"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={(value) => {
          setAmount(value);
          setError(null);
        }}
      />
      <View className="flex-row gap-2">
        {(["minutes", "hours", "days"] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ checked: unit === value }}
            className={
              unit === value
                ? "min-h-12 flex-1 items-center justify-center rounded-xl bg-subtle"
                : "min-h-12 flex-1 items-center justify-center rounded-xl"
            }
            onPress={() => {
              setUnit(value);
              setError(null);
            }}
          >
            <AppText>
              {value === "minutes" ? "Minutes" : value === "hours" ? "Hours" : "Days"}
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
