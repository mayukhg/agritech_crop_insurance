import { describe, expect, it } from "vitest";
import { decideClaim, isSurveyNumberVerifiable } from "../agent/decideClaim";
import goldens from "./golden/r1-r3.json";

describe("decideClaim regression R1–R3", () => {
  it("R1: rainfall shortfall approves proportional amount", () => {
    const g = goldens.R1;
    const result = decideClaim(g.input);
    expect(result.approved).toBe(g.expected.approved);
    if (result.approved) {
      expect(result.amount).toBe(g.expected.amount);
      expect(result.shortfallPercentage).toBe(g.expected.shortfallPercentage);
    }
  });

  it("R2: rainfall at threshold rejects", () => {
    const g = goldens.R2;
    const result = decideClaim(g.input);
    expect(result.approved).toBe(false);
    if (!result.approved) {
      expect(result.reasonCode).toBe(g.expected.reasonCode);
    }
  });

  it("R3: unverified land rejects", () => {
    const g = goldens.R3;
    const result = decideClaim(g.input);
    expect(result.approved).toBe(false);
    if (!result.approved) {
      expect(result.reasonCode).toBe(g.expected.reasonCode);
    }
  });

  it("survey number length gate", () => {
    expect(isSurveyNumberVerifiable("ABD-1")).toBe(false);
    expect(isSurveyNumberVerifiable("LTR-2218")).toBe(true);
  });
});
