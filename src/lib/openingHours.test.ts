import { describe, it, expect } from "vitest";
import { getOpeningHoursConflict, openingHoursCaption } from "./openingHours";

// Google's shape, as stored (places.hours). Day 0 = Sunday; 2027-07-01 is a Thursday.
const p = (od: number, ot: string, cd: number, ct: string) => ({ open: { day: od, time: ot }, close: { day: cd, time: ct } });
// A museum: 9–5, shut Thursdays.
const MUSEUM = { periods: [0, 1, 2, 3, 5, 6].map((d) => p(d, "0900", d, "1700")) };
// The Europe summer's Kensington apartments, live: "Open 24 hours" Mon–Fri,
// stored as one period, Monday 0000 to Saturday 0000.
const KENSINGTON = { periods: [p(1, "0000", 6, "0000")] };
// A bar: Fri and Sat 6 pm to 2 am.
const BAR = { periods: [p(5, "1800", 6, "0200"), p(6, "1800", 0, "0200")] };
const cap = (s: ReturnType<typeof getOpeningHoursConflict>) => (s ? openingHoursCaption(s) : null);

describe("getOpeningHoursConflict", () => {
  it("a museum on its closed day says so, and before opening says when it opens", () => {
    expect(cap(getOpeningHoursConflict(MUSEUM, "2027-07-01", "10:00:00"))).toBe("Closed Thursdays");
    expect(cap(getOpeningHoursConflict(MUSEUM, "2027-07-02", "08:00:00"))).toBe("Opens 9:00 AM");
  });
  it("a period across days is open on every day inside it", () => {
    for (const d of ["2027-07-05", "2027-07-06", "2027-07-07", "2027-07-01", "2027-07-02"]) {
      expect(getOpeningHoursConflict(KENSINGTON, d, "10:00:00")).toBeNull();
    }
    expect(cap(getOpeningHoursConflict(KENSINGTON, "2027-07-03", "10:00:00"))).toBe("Closed Saturdays");
  });
  it("an overnight bar still opens at 6 pm on Saturday", () => {
    expect(cap(getOpeningHoursConflict(BAR, "2027-07-03", "12:00:00"))).toBe("Opens 6:00 PM");
  });
  it("a hotel never warns: its hours are the front desk, not check-in", () => {
    expect(getOpeningHoursConflict(KENSINGTON, "2027-07-03", "15:00:00", "hotel")).toBeNull();
    expect(getOpeningHoursConflict(MUSEUM, "2027-07-01", "15:00:00", "accommodation")).toBeNull();
  });
  it("stays silent without a time, a date, or usable hours", () => {
    expect(getOpeningHoursConflict(MUSEUM, "2027-07-01", null)).toBeNull();
    expect(getOpeningHoursConflict(MUSEUM, null, "10:00:00")).toBeNull();
    expect(getOpeningHoursConflict(null, "2027-07-01", "10:00:00")).toBeNull();
  });
});
