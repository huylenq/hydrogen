import { afterEach, describe, expect, it } from "vite-plus/test";

import { useFlowStore } from "../../flowStore";
import { useModalKeyboardStore } from "../../modalKeyboardStore";
import { returnToFlowOverview } from "./flowSessionInspection";

afterEach(() => {
  useFlowStore.setState(useFlowStore.getInitialState(), true);
  useModalKeyboardStore.setState(useModalKeyboardStore.getInitialState(), true);
});

describe("returnToFlowOverview", () => {
  it("returns an inspected Flow session to the working-session grid", () => {
    useFlowStore.setState({ open: true, inspectedThreadKey: "environment:thread" });
    useModalKeyboardStore.setState({ mode: "normal", focusRequest: null });

    expect(returnToFlowOverview()).toBe(true);
    expect(useFlowStore.getState().open).toBe(true);
    expect(useFlowStore.getState().inspectedThreadKey).toBeNull();
    expect(useModalKeyboardStore.getState()).toMatchObject({
      mode: "normal",
      focusRequest: "conversation",
    });
  });

  it("leaves ordinary conversation focus unchanged outside Flow inspection", () => {
    useFlowStore.setState({ open: true, inspectedThreadKey: null });

    expect(returnToFlowOverview()).toBe(false);
    expect(useModalKeyboardStore.getState().focusRequest).toBeNull();
  });
});
