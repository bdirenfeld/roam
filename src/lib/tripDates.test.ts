import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { tripDates } from "./tripDates";

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
