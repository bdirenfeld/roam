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

// A trattoria: 7:30 pm to 11 pm daily. A late bar: 6 pm to 2 am daily.
// Lunch and dinner: 12:30–2:30 pm and 7:30–10 pm. 2027-07-02 is a Friday.
const TRATTORIA = { periods: [0, 1, 2, 3, 4, 5, 6].map((d) => p(d, "1930", d, "2300")) };
const LATE = { periods: [0, 1, 2, 3, 4, 5, 6].map((d) => p(d, "1800", (d + 1) % 7, "0200")) };
const SPLIT = { periods: [0, 1, 2, 3, 4, 5, 6].flatMap((d) => [p(d, "1230", d, "1430"), p(d, "1930", d, "2200")]) };

describe("getOpeningHoursConflict: ending after closing (7 Oct 2026)", () => {
  it("a dinner planned past closing says when it closes", () => {
    expect(getOpeningHoursConflict(TRATTORIA, "2027-07-02", "21:30:00", null, "23:30:00")).toEqual({ kind: "closes", closesAt: "23:00" });
    expect(cap(getOpeningHoursConflict(TRATTORIA, "2027-07-02", "21:30:00", null, "23:30:00"))).toBe("Closes 11:00 PM");
    // Ending past midnight is still after an 11 pm close.
    expect(cap(getOpeningHoursConflict(TRATTORIA, "2027-07-02", "21:30:00", null, "00:30:00"))).toBe("Closes 11:00 PM");
  });
  it("a dinner that ends by closing, or has no end, is silent", () => {
    expect(getOpeningHoursConflict(TRATTORIA, "2027-07-02", "20:00:00", null, "23:00:00")).toBeNull();
    expect(getOpeningHoursConflict(TRATTORIA, "2027-07-02", "20:00:00", null, null)).toBeNull();
  });
  it("a place closing 2 am next day does not clash with an 11 pm end, but does with 3 am", () => {
    expect(getOpeningHoursConflict(LATE, "2027-07-02", "21:00:00", null, "23:00:00")).toBeNull();
    expect(getOpeningHoursConflict(LATE, "2027-07-03", "22:00:00", null, "01:30:00")).toBeNull();
    // Saturday night into Sunday wraps the week.
    expect(getOpeningHoursConflict(LATE, "2027-07-03", "23:00:00", null, "01:59:00")).toBeNull();
    expect(cap(getOpeningHoursConflict(LATE, "2027-07-03", "23:00:00", null, "03:00:00"))).toBe("Closes 2:00 AM");
  });
  it("arriving after the doors shut for the day says when it closed", () => {
    expect(cap(getOpeningHoursConflict(MUSEUM, "2027-07-02", "18:00:00", null, "19:00:00"))).toBe("Closes 5:00 PM");
  });
  it("arriving in the afternoon gap of a lunch-and-dinner place says when it reopens", () => {
    expect(cap(getOpeningHoursConflict(SPLIT, "2027-07-02", "16:00:00", null, "17:00:00"))).toBe("Opens 7:30 PM");
    expect(getOpeningHoursConflict(SPLIT, "2027-07-02", "13:00:00", null, "14:30:00")).toBeNull();
    expect(cap(getOpeningHoursConflict(SPLIT, "2027-07-02", "13:00:00", null, "15:00:00"))).toBe("Closes 2:30 PM");
  });
  it("closed days and early starts win over the closing check", () => {
    expect(cap(getOpeningHoursConflict(MUSEUM, "2027-07-01", "16:00:00", null, "18:00:00"))).toBe("Closed Thursdays");
    expect(cap(getOpeningHoursConflict(MUSEUM, "2027-07-02", "08:00:00", null, "18:00:00"))).toBe("Opens 9:00 AM");
  });
  it("a hotel and a 24-hour place never warn", () => {
    expect(getOpeningHoursConflict(TRATTORIA, "2027-07-02", "21:30:00", "hotel", "23:30:00")).toBeNull();
    expect(getOpeningHoursConflict({ periods: [{ open: { day: 0, time: "0000" } }] }, "2027-07-02", "21:30:00", null, "23:30:00")).toBeNull();
  });
});
