import { describe, it, expect } from "vitest";
import { calendarGrid, CALENDAR_CELLS } from "./calendarGrid";

describe("calendarGrid", () => {
  it("is six weeks for a 5-week month and a 6-week month alike, so the arrows never move", () => {
    // Feb 2027 starts Monday: 1 blank + 28 days = 5 rows of content.
    // Jul 2027 starts Thursday: 4 blanks + 31 days = 5 rows. Aug 2026 starts Saturday: 6 rows.
    for (const [y, m] of [[2027, 1], [2027, 6], [2026, 7], [2026, 1]] as const) {
      expect(calendarGrid(y, m)).toHaveLength(CALENDAR_CELLS);
    }
  });

  it("puts the 1st under its weekday and every day in order", () => {
    const jul = calendarGrid(2027, 6); // Thu 1 Jul 2027
    expect(jul.slice(0, 4)).toEqual([null, null, null, null]);
    expect(jul[4]).toBe("2027-07-01");
    expect(jul[34]).toBe("2027-07-31");
    expect(jul.slice(35).every((c) => c === null)).toBe(true);
    expect(jul.filter(Boolean)).toHaveLength(31);
  });
});
