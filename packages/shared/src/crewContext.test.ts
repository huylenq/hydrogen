import { describe, expect, it } from "vite-plus/test";
import { estimateCrewTokens, formatCrewMessage, validateCrewMessage } from "./crewContext.ts";

describe("Grok Bot context brief", () => {
  it("keeps a plain message exact and includes only explicitly selected context", () => {
    expect(formatCrewMessage({ text: " hello\n" })).toBe(" hello\n");
    const wire = formatCrewMessage({
      text: "Review",
      context: {
        goal: "Goal",
        currentState: "State",
        constraints: ["Small"],
        evidence: [{ label: "diff", text: "+change" }],
        expectedResult: "Findings",
      },
    });
    for (const value of ["Review", "Goal", "State", "Small", "+change", "Findings"])
      expect(wire).toContain(value);
    expect(wire).not.toContain("t3-reply");
  });
  it("measures the full message, reports budgets, and never truncates selected evidence", () => {
    expect(estimateCrewTokens("12345")).toBe(2);
    expect(validateCrewMessage("x".repeat(8000))).toBeNull();
    expect(validateCrewMessage("x".repeat(8001))).toContain("2,000");
    expect(validateCrewMessage("x".repeat(32001), 4000)).toContain("32,000");
    const text = "x".repeat(8000);
    const formatted = formatCrewMessage({ text, replyMarker: "[t3-reply:test]" });
    expect(formatted.startsWith(text)).toBe(true);
    expect(validateCrewMessage(formatted)).toContain("2,000");
  });
});
