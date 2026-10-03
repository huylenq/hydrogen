import { useId, useRef, useState } from "react";

import {
  localSnoozeDate,
  localSnoozeTime,
  resolveCustomSnooze,
  resolveSnoozeDuration,
  type CustomSnoozeInput,
} from "@t3tools/client-runtime/state/thread-settled";
import { Button } from "../../components/ui/button";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "../../components/ui/calendar";
import { weekStartsOn } from "../../timestampFormat";
import { Popover, PopoverTrigger, PopoverPopup } from "../../components/ui/popover";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Toggle, ToggleGroup } from "../../components/ui/toggle-group";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "../../components/ui/select";
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
  NumberFieldDecrement,
  NumberFieldIncrement,
} from "../../components/ui/number-field";
export function useSnoozeForm(quickDuration: boolean) {
  const durationRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [initial] = useState(() => new Date(Date.now() + 3_600_000));
  const [mode, setMode] = useState<CustomSnoozeInput["mode"]>("duration");
  const [date, setDate] = useState(initial);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [time, setTime] = useState(localSnoozeTime(initial));
  const [amount, setAmount] = useState(quickDuration ? "" : "30");
  const [unit, setUnit] = useState<"minutes" | "hours" | "days">("minutes");
  const [error, setError] = useState<string | null>(null);
  const input: CustomSnoozeInput =
    mode === "date" ? { mode, date: localSnoozeDate(date), time } : { mode, amount, unit };
  return {
    durationRef,
    id,
    mode,
    setMode,
    date,
    setDate,
    calendarOpen,
    setCalendarOpen,
    time,
    setTime,
    amount,
    setAmount,
    unit,
    setUnit,
    error,
    setError,
    quickDuration,
    title: quickDuration ? "Snooze thread" : "Custom snooze",
    description: quickDuration
      ? "Use s, m, h, or d; no unit means minutes. Enter snoozes, Escape cancels."
      : "Choose when snoozed threads return to your inbox.",
    resolve() {
      const snoozedUntil = quickDuration
        ? resolveSnoozeDuration(amount, new Date())
        : resolveCustomSnooze(input, new Date());
      if (!snoozedUntil) {
        setError(
          quickDuration
            ? "Enter a positive duration, such as 30s, 15m, 24h, or 2d."
            : mode === "date"
              ? "Choose a valid date and time in the future."
              : "Enter a positive duration.",
        );
        return null;
      }
      return snoozedUntil;
    },
  };
}

export function SnoozeFormFields({ form }: { form: ReturnType<typeof useSnoozeForm> }) {
  const {
    durationRef,
    id,
    mode,
    setMode,
    date,
    setDate,
    calendarOpen,
    setCalendarOpen,
    time,
    setTime,
    amount,
    setAmount,
    unit,
    setUnit,
    error,
    setError,
    quickDuration,
  } = form;
  return (
    <div className="flex flex-col gap-4">
      {quickDuration ? (
        <Label className="flex flex-col items-stretch" htmlFor={`${id}-duration`}>
          Duration
          <Input
            nativeInput
            ref={durationRef}
            id={`${id}-duration`}
            autoFocus
            required
            value={amount}
            placeholder="30s, 15m, 24h, 2d, or 15"
            onChange={(event) => {
              setAmount(event.target.value);
              setError(null);
            }}
          />
        </Label>
      ) : (
        <div className="flex flex-col gap-4">
          <ToggleGroup
            aria-label="Schedule type"
            className="w-full *:flex-1"
            value={[mode]}
            onValueChange={(next) => {
              const value = next[0];
              if (value === "date" || value === "duration") setMode(value);
              setError(null);
            }}
          >
            <Toggle value="date">Date and time</Toggle>
            <Toggle value="duration">Duration</Toggle>
          </ToggleGroup>
          <div className="flex flex-col gap-4">
            {mode === "date" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={`${id}-date`}>Date</Label>
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger
                      render={
                        <Button
                          id={`${id}-date`}
                          variant="outline"
                          className="w-full justify-between"
                        />
                      }
                    >
                      {date.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      <CalendarIcon className="size-4 text-muted-foreground" />
                    </PopoverTrigger>
                    <PopoverPopup align="start" aria-label="Choose snooze date">
                      <Calendar
                        mode="single"
                        required
                        selected={date}
                        defaultMonth={date}
                        {...(weekStartsOn === undefined ? {} : { weekStartsOn })}
                        disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
                        onSelect={(selected) => {
                          setDate(selected);
                          setCalendarOpen(false);
                          setError(null);
                        }}
                      />
                    </PopoverPopup>
                  </Popover>
                </div>
                <Label className="flex min-w-0 flex-col items-stretch" htmlFor={`${id}-time`}>
                  Time
                  <Input
                    nativeInput
                    id={`${id}-time`}
                    className="h-9 sm:h-8"
                    type="time"
                    required
                    value={time}
                    onChange={(event) => {
                      setTime(event.target.value);
                      setError(null);
                    }}
                  />
                </Label>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <NumberField
                  id={`${id}-amount`}
                  min={0}
                  step="any"
                  value={amount === "" ? null : Number(amount)}
                  onValueChange={(value) => {
                    setAmount(value === null ? "" : String(value));
                    setError(null);
                  }}
                >
                  <Label htmlFor={`${id}-amount`}>Snooze for</Label>
                  <NumberFieldGroup>
                    <NumberFieldDecrement aria-label="Decrease duration" />
                    <NumberFieldInput
                      required
                      autoFocus
                      onFocus={(event) => event.target.select()}
                    />
                    <NumberFieldIncrement aria-label="Increase duration" />
                  </NumberFieldGroup>
                </NumberField>
                <Label className="flex min-w-0 flex-col items-stretch" htmlFor={`${id}-unit`}>
                  Unit
                  <Select
                    value={unit}
                    items={{ minutes: "Minutes", hours: "Hours", days: "Days" }}
                    onValueChange={(value) => {
                      if (value === "minutes" || value === "hours" || value === "days")
                        setUnit(value);
                      setError(null);
                    }}
                  >
                    <SelectTrigger id={`${id}-unit`} className="min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      <SelectItem value="minutes">Minutes</SelectItem>
                      <SelectItem value="hours">Hours</SelectItem>
                      <SelectItem value="days">Days</SelectItem>
                    </SelectPopup>
                  </Select>
                </Label>
              </div>
            )}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
