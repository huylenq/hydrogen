import { MaterialSegmentedButtons } from "../../components/MaterialSegmentedButtons.android";
import { Column, OutlinedTextField, useNativeState, Text } from "@expo/ui/jetpack-compose";
import { padding, fillMaxWidth, testID } from "@expo/ui/jetpack-compose/modifiers";
import {
  localSnoozeDate,
  localSnoozeTime,
  resolveCustomSnooze,
  type CustomSnoozeInput,
} from "@t3tools/client-runtime/state/thread-settled";

import { useState } from "react";

import { useScaledTextRole } from "../../features/settings/appearance/useScaledTextRole";

const units = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
] as const;

export function useSnoozeForm() {
  const [mode, setMode] = useState<CustomSnoozeInput["mode"]>("duration");
  const [date, setDate] = useState(() => new Date(Date.now() + 3_600_000));
  const [picker, setPicker] = useState<"date" | "time">("date");
  const amount = useNativeState("30");
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
    unit,
    setUnit,
    setError,
    resolve() {
      const input: CustomSnoozeInput =
        mode === "date"
          ? { mode, date: localSnoozeDate(date), time: localSnoozeTime(date) }
          : { mode, amount: amount.get(), unit };
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
  const { amount, unit, setUnit, setError } = form;
  const bodyTypography = useScaledTextRole("footnote");
  return (
    <Column
      verticalArrangement={{ spacedBy: 16 }}
      modifiers={[fillMaxWidth(), padding(24, 8, 24, 16)]}
    >
      <OutlinedTextField
        value={amount}
        singleLine
        onValueChange={() => setError(null)}
        modifiers={[fillMaxWidth(), testID("snooze-duration")]}
      >
        <OutlinedTextField.Label>
          <Text style={bodyTypography}>Snooze for</Text>
        </OutlinedTextField.Label>
      </OutlinedTextField>
      <MaterialSegmentedButtons options={units} selected={unit} onSelect={setUnit} />
    </Column>
  );
}
