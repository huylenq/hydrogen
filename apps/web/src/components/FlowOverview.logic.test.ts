import { describe, expect, it } from "vite-plus/test";

import { shouldControlFlowRoute } from "./FlowOverview";

describe("shouldControlFlowRoute", () => {
  it("leaves a new-session draft visible while Flow mode is open", () => {
    expect(
      shouldControlFlowRoute({
        open: true,
        bootstrapped: true,
        chatRoute: true,
        draftRoute: true,
      }),
    ).toBe(false);
  });

  it("continues controlling ordinary thread routes in Flow mode", () => {
    expect(
      shouldControlFlowRoute({
        open: true,
        bootstrapped: true,
        chatRoute: true,
        draftRoute: false,
      }),
    ).toBe(true);
  });
});
