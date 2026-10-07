import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { tripDates, monthYear } from "./tripDates";

describe("tripDates", () => {
  const tz = process.env.TZ;
  beforeAll(() => { process.env.TZ = "America/Toronto"; });
  afterAll(() => { process.env.TZ = tz; });

  it("keeps the last day across the spring clock change (Irving, Mar 14–17 2027)", () => {
    expect(tripDates("2027-03-14", "2027-03-17")).toEqual(["2027-03-14", "2027-03-15", "2027-03-16", "2027-03-17"]);
  });
  it("and across the autumn one, and for a one-day trip", () => {
    expect(tripDates("2026-10-30", "2026-11-02")).toHaveLength(4);
    expect(tripDates("2026-09-29", "2026-09-29")).toEqual(["2026-09-29"]);
  });
});

describe("monthYear (7 Oct 2026, delight audit)", () => {
  it("reads a past journey as its month and year", () => {
    expect(monthYear("2026-03-04")).toBe("MAR 2026");
    expect(monthYear("2025-12-27")).toBe("DEC 2025");
  });
  it("is blank for a missing or malformed date", () => {
    expect(monthYear("")).toBe("");
    expect(monthYear(null)).toBe("");
    expect(monthYear("2026-13-01")).toBe("");
  });
});
