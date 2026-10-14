// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const STORAGE_KEY = "t3code:important-sessions:v1";

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});
afterEach(() => {
  vi.restoreAllMocks();
});

it("persists flags and their removal across reloads, separately for each environment", async () => {
  const { toggleSessionImportance, useSessionImportanceStore } =
    await import("./sessionImportance");
  expect(toggleSessionImportance("env-a:thread")).toBe(true);
  expect(toggleSessionImportance("env-b:thread")).toBe(true);
  expect(toggleSessionImportance("env-a:thread")).toBe(false);
  expect([...useSessionImportanceStore.getState().keys]).toEqual(["env-b:thread"]);

  vi.resetModules();
  const reloaded = await import("./sessionImportance");
  expect([...reloaded.useSessionImportanceStore.getState().keys]).toEqual(["env-b:thread"]);
  reloaded.toggleSessionImportance("env-b:thread");
  vi.resetModules();
  expect((await import("./sessionImportance")).useSessionImportanceStore.getState().keys.size).toBe(
    0,
  );
});

it.each(["broken json", "null", '{"thread":true}'])(
  "starts without flags when storage contains %s",
  async (saved) => {
    localStorage.setItem(STORAGE_KEY, saved);
    const { toggleSessionImportance, useSessionImportanceStore } =
      await import("./sessionImportance");
    expect(useSessionImportanceStore.getState().keys.size).toBe(0);
    expect(toggleSessionImportance("env:thread")).toBe(true);
  },
);

it("keeps usable keys when some saved entries are invalid", async () => {
  localStorage.setItem(STORAGE_KEY, '["env:thread", null, 42, "", "env:thread"]');
  const { useSessionImportanceStore } = await import("./sessionImportance");
  expect([...useSessionImportanceStore.getState().keys]).toEqual(["env:thread"]);
});

it("can flag and unflag when browser storage is unavailable", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Storage unavailable");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage unavailable");
  });
  const { toggleSessionImportance } = await import("./sessionImportance");
  expect(toggleSessionImportance("env:thread")).toBe(true);
  expect(toggleSessionImportance("env:thread")).toBe(false);
});
