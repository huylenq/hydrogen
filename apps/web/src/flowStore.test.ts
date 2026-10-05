import { afterEach, expect, it, vi } from "vite-plus/test";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("carries the saved queue preference into Flow mode", async () => {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => (key === "t3code:work-queue-mode:v1" ? "true" : null),
    },
  });
  const { useFlowStore } = await import("./flowStore");
  expect(useFlowStore.getState().open).toBe(true);
});

it("keeps Flow disabled after leaving a migrated session and reloading", async () => {
  const saved = new Map([["t3code:work-queue-mode:v1", "true"]]);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    },
  });
  const { useFlowStore } = await import("./flowStore");
  useFlowStore.getState().toggle();
  vi.resetModules();
  const reloaded = await import("./flowStore");
  expect(reloaded.useFlowStore.getState().open).toBe(false);
});

it("remains usable when browser storage is unavailable", async () => {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: () => {
        throw new Error("Storage unavailable");
      },
      setItem: () => {
        throw new Error("Storage unavailable");
      },
    },
  });
  const { useFlowStore } = await import("./flowStore");
  expect(useFlowStore.getState().open).toBe(false);
  useFlowStore.getState().toggle();
  expect(useFlowStore.getState().open).toBe(true);
});

it("inspects sessions and returns to previews without changing the saved Flow preference", async () => {
  const saved = new Map([["t3code:flow-mode:v1", "true"]]);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    },
  });
  const { useFlowStore } = await import("./flowStore");
  const revision = useFlowStore.getState().interactionRevision;
  useFlowStore.getState().inspectSession("environment:thread");
  expect(useFlowStore.getState().open).toBe(true);
  expect(useFlowStore.getState().inspectedThreadKey).toBe("environment:thread");
  expect(useFlowStore.getState().interactionRevision).toBe(revision + 1);
  expect(saved.get("t3code:flow-mode:v1")).toBe("true");
  useFlowStore.getState().inspectSession(null);
  expect(useFlowStore.getState().open).toBe(true);
  expect(useFlowStore.getState().inspectedThreadKey).toBeNull();
  useFlowStore.getState().inspectSession("environment:thread");
  useFlowStore.getState().toggle();
  useFlowStore.getState().toggle();
  expect(useFlowStore.getState().inspectedThreadKey).toBeNull();
});

it("holds the overview open until toggled again or a session is opened", async () => {
  vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => undefined } });
  const { useFlowStore } = await import("./flowStore");
  const flow = () => useFlowStore.getState();

  flow().toggleOverview();
  expect(flow()).toMatchObject({ open: true, overviewOpen: true });

  flow().inspectSession(null);
  expect(flow().overviewOpen).toBe(true);
  flow().inspectSession("session");
  expect(flow().overviewOpen).toBe(false);

  // From that session, the toggle brings the overview back.
  flow().toggleOverview();
  expect(flow()).toMatchObject({ overviewOpen: true, inspectedThreadKey: null });
  flow().toggleOverview();
  expect(flow()).toMatchObject({ open: true, overviewOpen: false });

  flow().toggleOverview();
  flow().toggle();
  expect(flow()).toMatchObject({ open: false, overviewOpen: false });
});
