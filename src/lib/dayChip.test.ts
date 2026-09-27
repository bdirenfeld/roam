import { describe, it, expect } from "vitest";
import { dayChip, spansMonths } from "./dayChip";

describe("dayChip", () => {
  it("names the month once a journey crosses one", () => {
    expect(spansMonths(["2027-07-01", "2027-08-31"])).toBe(true);
    expect(dayChip("2027-08-16", true)).toBe("Mon 16 Aug");
  });
  it("stays short inside one month", () => {
    expect(spansMonths(["2027-09-16", "2027-09-19"])).toBe(false);
    expect(dayChip("2027-09-17", false)).toBe("Fri 17");
  });
});
