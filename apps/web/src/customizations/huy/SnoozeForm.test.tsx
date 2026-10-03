import { act, useLayoutEffect } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useSnoozeForm } from "./SnoozeForm";

let form: ReturnType<typeof useSnoozeForm>;
let renderer: ReactTestRenderer | undefined;
function Probe({ quick = false }: { quick?: boolean }) {
  const current = useSnoozeForm(quick);
  useLayoutEffect(() => {
    form = current;
  });
  return null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-27T03:00:00Z"));
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Huy snooze input", () => {
  it("starts an arbitrary positive duration at confirmation", async () => {
    await act(() => {
      renderer = create(<Probe />);
    });
    await act(() => form.setAmount("12345.5"));
    vi.setSystemTime(new Date("2026-09-27T04:00:00Z"));
    expect(form.resolve()).toBe(new Date(Date.now() + 12345.5 * 60_000).toISOString());
  });
  it("rejects invalid duration without completing the form", async () => {
    await act(() => {
      renderer = create(<Probe />);
    });
    await act(() => form.setAmount("-1"));
    await act(() => {
      expect(form.resolve()).toBeNull();
    });
    expect(form.error).toBe("Enter a positive duration.");
  });
  it("opens quick snooze empty and accepts a seconds suffix", async () => {
    await act(() => {
      renderer = create(<Probe quick />);
    });
    expect(form.amount).toBe("");
    await act(() => form.setAmount("45s"));
    expect(form.resolve()).toBe(new Date(Date.now() + 45_000).toISOString());
  });
  it("keeps date and time scheduling available", async () => {
    await act(() => {
      renderer = create(<Probe />);
    });
    await act(() => {
      form.setMode("date");
      form.setDate(new Date(2026, 9, 1));
      form.setTime("14:30");
    });
    expect(form.resolve()).toBe(new Date(2026, 9, 1, 14, 30).toISOString());
  });
});
