import {
  DatePicker,
  HStack,
  Picker,
  Text,
  TextField,
  useNativeState,
  VStack,
} from "@expo/ui/swift-ui";
import {
  clipped,
  font,
  datePickerStyle,
  foregroundStyle,
  frame,
  labelsHidden,
  padding,
  pickerStyle,
  tag,
} from "@expo/ui/swift-ui/modifiers";
import {
  localSnoozeDate,
  localSnoozeTime,
  resolveCustomSnooze,
  type CustomSnoozeInput,
} from "@t3tools/client-runtime/state/thread-settled";
import { useState } from "react";

import { useAppearancePreferences } from "../../features/settings/appearance/AppearancePreferencesProvider";

const modes = [
  { value: "date", label: "Date and time" },
  { value: "duration", label: "Duration" },
] as const;
const units = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
] as const;

export function useSnoozeForm() {
  const [mode, setMode] = useState<CustomSnoozeInput["mode"]>("duration");
  const [date, setDate] = useState(() => new Date(Date.now() + 3_600_000));
  const amount = useNativeState("30");
  const [unit, setUnit] = useState<"minutes" | "hours" | "days">("minutes");
  const [error, setError] = useState<string | null>(null);
  const { themeVariables: colors } = useAppearancePreferences();
  const updateDate = (value: Date) => {
    setDate(value);
    setError(null);
  };

  const resolve = () => {
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
  };

  return {
    mode,
    setMode,
    date,
    amount,
    unit,
    setUnit,
    error,
    setError,
    colors,
    updateDate,
    resolve,
  };
}

export function SnoozeFormFields({ form }: { form: ReturnType<typeof useSnoozeForm> }) {
  const { mode, setMode, date, amount, unit, setUnit, error, setError, colors, updateDate } = form;
  return (
    <VStack
      spacing={16}
      modifiers={[padding({ all: 16 }), foregroundStyle(colors["--color-foreground"])]}
    >
      <Picker
        label="Snooze mode"
        selection={mode}
        onSelectionChange={(value: CustomSnoozeInput["mode"]) => {
          setMode(value);
          setError(null);
        }}
        modifiers={[pickerStyle("segmented")]}
      >
        {modes.map((option) => (
          <Text key={option.value} modifiers={[tag(option.value)]}>
            {option.label}
          </Text>
        ))}
      </Picker>
      {mode === "date" ? (
        <DatePicker
          title="Snooze until"
          selection={date}
          displayedComponents={["date", "hourAndMinute"]}
          onDateChange={updateDate}
          modifiers={[
            datePickerStyle("wheel"),
            labelsHidden(),
            frame({ maxWidth: Infinity, minHeight: 180, maxHeight: 180 }),
          ]}
        />
      ) : (
        <HStack spacing={0}>
          <TextField
            text={amount}
            placeholder="Duration amount"
            onTextChange={() => setError(null)}
            modifiers={[frame({ minWidth: 0, maxWidth: Infinity })]}
          />
          <Picker
            label="Duration unit"
            selection={unit}
            onSelectionChange={(value: typeof unit) => {
              setUnit(value);
              setError(null);
            }}
            modifiers={[
              pickerStyle("wheel"),
              labelsHidden(),
              frame({ minWidth: 0, maxWidth: Infinity, minHeight: 180, maxHeight: 180 }),
              clipped(),
            ]}
          >
            {units.map((option) => (
              <Text
                key={option.value}
                modifiers={[tag(option.value), foregroundStyle(colors["--color-foreground"])]}
              >
                {option.label}
              </Text>
            ))}
          </Picker>
        </HStack>
      )}
      {error ? (
        <Text
          modifiers={[
            font({ textStyle: "footnote" }),
            foregroundStyle(colors["--color-danger-foreground"]),
          ]}
        >
          {error}
        </Text>
      ) : null}
    </VStack>
  );
}
