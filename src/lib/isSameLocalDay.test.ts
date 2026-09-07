import { describe, it, expect } from "vitest";
import { isSameLocalDay, localDate } from "./isSameLocalDay";

/**
 * Runs at TZ=America/Toronto (vitest.config.ts). That is not incidental: on a
 * UTC machine every case below passes whether the function is right or wrong,
 * because local and UTC agree. GitHub's runners are UTC.
 *
 * The bug this guards is the shared page marking the wrong day as "today" for a
 * family checking the plan after dinner — which is exactly when they check it.
 */

describe("localDate", () => {
  it("formats a local calendar date", () => {
    expect(localDate(new Date(2027, 7, 19, 12, 0))).toBe("2027-08-19");
  });

  it("pads single-digit months and days", () => {
    expect(localDate(new Date(2027, 0, 5, 12, 0))).toBe("2027-01-05");
  });

  it("is still yesterday's date at 11:30 PM, when UTC has already rolled over", () => {
    const lateEvening = new Date(2027, 7, 19, 23, 30);
    expect(lateEvening.toISOString().slice(0, 10)).toBe("2027-08-20"); // the trap
    expect(localDate(lateEvening)).toBe("2027-08-19");                // the behaviour
  });

  it("is already today's date at 12:30 AM", () => {
    expect(localDate(new Date(2027, 7, 20, 0, 30))).toBe("2027-08-20");
  });
});

describe("isSameLocalDay", () => {
  it("matches the day it is", () => {
    expect(isSameLocalDay("2027-08-19", new Date(2027, 7, 19, 9, 0))).toBe(true);
  });

  it("does not match the day before or after", () => {
    const noon = new Date(2027, 7, 19, 12, 0);
    expect(isSameLocalDay("2027-08-18", noon)).toBe(false);
    expect(isSameLocalDay("2027-08-20", noon)).toBe(false);
  });

  it("still matches late at night, when UTC says tomorrow", () => {
    // 11:30 PM in Toronto on the 19th is 03:30 UTC on the 20th. A server-side
    // check would mark the 20th as today and scroll the family past a day they
    // have not had yet.
    expect(isSameLocalDay("2027-08-19", new Date(2027, 7, 19, 23, 30))).toBe(true);
    expect(isSameLocalDay("2027-08-20", new Date(2027, 7, 19, 23, 30))).toBe(false);
  });

  it("matches across a month boundary", () => {
    expect(isSameLocalDay("2027-09-01", new Date(2027, 8, 1, 0, 5))).toBe(true);
    expect(isSameLocalDay("2027-08-31", new Date(2027, 8, 1, 0, 5))).toBe(false);
  });

  it("returns false for a date outside the journey", () => {
    expect(isSameLocalDay("2027-08-19", new Date(2026, 7, 19, 12, 0))).toBe(false);
  });
});
