import { describe, it, expect } from "vitest";
import { isSameLocalDay, isBeforeLocalDay, localDate, isUnderwayLocal } from "./isSameLocalDay";

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

describe("isBeforeLocalDay", () => {
  it("is true while the trip is still ahead, false on the day and after", () => {
    const now = new Date(2026, 8, 23, 21, 30); // 9:30 PM on 23 Sep, already 24 Sep in UTC
    expect(isBeforeLocalDay("2026-09-24", now)).toBe(true);
    expect(isBeforeLocalDay("2026-09-23", now)).toBe(false);
    expect(isBeforeLocalDay("2026-09-22", now)).toBe(false);
  });
});

describe("isUnderwayLocal", () => {
  const S = "2027-05-10", E = "2027-05-12";
  it("the first day, from just after local midnight", () => {
    expect(isUnderwayLocal(S, E, new Date(2027, 4, 10, 0, 1))).toBe(true);
  });
  it("the last day, until just before local midnight", () => {
    expect(isUnderwayLocal(S, E, new Date(2027, 4, 12, 23, 59))).toBe(true);
  });
  it("a day in the middle", () => {
    expect(isUnderwayLocal(S, E, new Date(2027, 4, 11, 12, 0))).toBe(true);
  });
  it("the evening before it starts: not yet (UTC would already say the 10th)", () => {
    expect(isUnderwayLocal(S, E, new Date(2027, 4, 9, 21, 0))).toBe(false);
  });
  it("the morning after it ends: over", () => {
    expect(isUnderwayLocal(S, E, new Date(2027, 4, 13, 0, 1))).toBe(false);
  });
  it("the last day's evening in Toronto is still the last day (UTC would say the 13th)", () => {
    expect(isUnderwayLocal(S, E, new Date(2027, 4, 12, 21, 0))).toBe(true);
  });
  it("a one-day journey, on its day", () => {
    expect(isUnderwayLocal(S, S, new Date(2027, 4, 10, 9, 0))).toBe(true);
  });
  it("missing dates or an end before the start: never", () => {
    expect(isUnderwayLocal(null, E, new Date(2027, 4, 11, 12, 0))).toBe(false);
    expect(isUnderwayLocal(S, undefined, new Date(2027, 4, 11, 12, 0))).toBe(false);
    expect(isUnderwayLocal(E, S, new Date(2027, 4, 11, 12, 0))).toBe(false);
  });
  it("a timestamp-shaped date is read as its date", () => {
    expect(isUnderwayLocal("2027-05-10T00:00:00", "2027-05-12T00:00:00", new Date(2027, 4, 12, 18, 0))).toBe(true);
  });
});
