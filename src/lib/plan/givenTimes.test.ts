import { describe, it, expect } from "vitest";
import { givenTimesLine } from "./givenTimes";

describe("givenTimesLine (7 Oct 2026, re-audit)", () => {
  it("counts the places that got a time, not 'Tue arranged'", () => {
    expect(givenTimesLine(3, 0)).toBe("3 places given a time");
    expect(givenTimesLine(1, 0)).toBe("1 place given a time");
    expect(givenTimesLine(3, 0)).not.toMatch(/arranged/);
  });
  it("says how many did not fit", () => {
    expect(givenTimesLine(2, 1)).toBe("2 places given a time; 1 left without a time");
  });
});
