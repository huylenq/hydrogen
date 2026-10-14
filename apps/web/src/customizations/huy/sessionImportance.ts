import { create } from "zustand";

const STORAGE_KEY = "t3code:important-sessions:v1";

function readImportantSessions(): ReadonlySet<string> {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return new Set(
      Array.isArray(saved)
        ? saved.filter((key): key is string => typeof key === "string" && key.length > 0)
        : [],
    );
  } catch {
    return new Set();
  }
}

/** Client-local flags, keyed by scopedThreadKey so environments cannot share a flag. */
export const useSessionImportanceStore = create<{
  readonly keys: ReadonlySet<string>;
}>(() => ({ keys: readImportantSessions() }));

export function toggleSessionImportance(key: string): boolean {
  const keys = new Set(useSessionImportanceStore.getState().keys);
  const important = !keys.has(key);
  if (important) keys.add(key);
  else keys.delete(key);
  useSessionImportanceStore.setState({ keys });
  return important;
}

useSessionImportanceStore.subscribe((state, previous) => {
  if (state.keys === previous.keys || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.keys]));
  } catch {
    // Flags still work for this window when storage is unavailable.
  }
});

export const IMPORTANT_SESSION_SURFACE_CLASS =
  "flow-important-session border-[var(--session-gold)]/60 bg-[var(--session-gold)]/5 hover:border-[var(--session-gold)]/80 hover:bg-[var(--session-gold)]/10";
export const IMPORTANT_SESSION_ACTIVE_CLASS =
  "border-[var(--session-gold)] bg-[var(--session-gold)]/20 hover:border-[var(--session-gold)] hover:bg-[var(--session-gold)]/25 shadow-[inset_3px_0_0_var(--session-gold)]";
export const IMPORTANT_SESSION_TITLE_CLASS =
  "text-[var(--session-gold-text)] hover:text-[var(--session-gold-text-hover)]";
