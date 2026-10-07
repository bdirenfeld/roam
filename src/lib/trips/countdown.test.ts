import { describe, it, expect, afterEach } from "vitest";
import { tripCountdown } from "./countdown";

/**
 * The journey card's countdown (6 Oct 2026, Brennan). Mar 14–17 is the trip in
 * the approved mock.
 */
describe("tripCountdown", () => {
  it("more than 60 days out: whole months", () => {
    expect(tripCountdown("2027-03-14", "2027-03-17", "2026-10-06")).toBe("IN 5 MONTHS");
    expect(tripCountdown("2027-03-14", "2027-03-17", "2026-10-14")).toBe("IN 5 MONTHS");
    expect(tripCountdown("2027-03-14", "2027-03-17", "2026-10-15")).toBe("IN 4 MONTHS");
  });

  it("61 days is two months, not one, even from the 31st into a short month", () => {
    // Dec 31 → Mar 2 (61 days): Feb has no 31st, so Feb 28 counts as a whole month.
    expect(tripCountdown("2027-03-02", "2027-03-05", "2026-12-31")).toBe("IN 2 MONTHS");
    // Jul 31 → Sep 30 (61 days).
    expect(tripCountdown("2027-09-30", "2027-10-02", "2027-07-31")).toBe("IN 2 MONTHS");
  });

  it("a year out", () => {
    expect(tripCountdown("2027-10-06", "2027-10-10", "2026-10-06")).toBe("IN 12 MONTHS");
  });

  it("60 days down to 2: days", () => {
    expect(tripCountdown("2026-12-05", "2026-12-08", "2026-10-06")).toBe("IN 60 DAYS");
    expect(tripCountdown("2026-10-08", "2026-10-10", "2026-10-06")).toBe("IN 2 DAYS");
  });

  it("across a month boundary, days count the calendar", () => {
    expect(tripCountdown("2026-11-02", "2026-11-05", "2026-10-30")).toBe("IN 3 DAYS");
    expect(tripCountdown("2028-03-01", "2028-03-03", "2028-02-27")).toBe("IN 3 DAYS"); // leap year: Feb 29 exists
    expect(tripCountdown("2027-03-01", "2027-03-03", "2027-02-27")).toBe("IN 2 DAYS");
  });

  it("one day out: tomorrow", () => {
    expect(tripCountdown("2026-10-07", "2026-10-10", "2026-10-06")).toBe("TOMORROW");
    expect(tripCountdown("2027-01-01", "2027-01-03", "2026-12-31")).toBe("TOMORROW");
  });

  it("during the journey: day N of M, both ends included", () => {
    expect(tripCountdown("2027-03-14", "2027-03-17", "2027-03-14")).toBe("DAY 1 OF 4");
    expect(tripCountdown("2027-03-14", "2027-03-17", "2027-03-16")).toBe("DAY 3 OF 4");
    expect(tripCountdown("2027-03-14", "2027-03-17", "2027-03-17")).toBe("DAY 4 OF 4");
    expect(tripCountdown("2026-10-06", "2026-10-06", "2026-10-06")).toBe("DAY 1 OF 1");
    expect(tripCountdown("2026-10-30", "2026-11-03", "2026-11-02")).toBe("DAY 4 OF 5");
  });

  it("up to a week after: just back; then nothing", () => {
    expect(tripCountdown("2027-03-14", "2027-03-17", "2027-03-18")).toBe("JUST BACK");
    expect(tripCountdown("2027-03-14", "2027-03-17", "2027-03-24")).toBe("JUST BACK");
    expect(tripCountdown("2027-03-14", "2027-03-17", "2027-03-25")).toBeNull();
  });

  it("missing or backwards dates say nothing", () => {
    expect(tripCountdown(null, "2027-03-17", "2026-10-06")).toBeNull();
    expect(tripCountdown("2027-03-14", undefined, "2026-10-06")).toBeNull();
    expect(tripCountdown("2027-03-17", "2027-03-14", "2026-10-06")).toBeNull();
    expect(tripCountdown("2027-03-14", "2027-03-17", "")).toBeNull();
  });

  describe("across the spring clock change (Toronto, 14 Mar 2027)", () => {
    const tz = process.env.TZ;
    afterEach(() => { process.env.TZ = tz; });

    it("counts calendar days, not 23-hour days", () => {
      process.env.TZ = "America/Toronto";
      // A trip that straddles the change: Mar 12–17 is six days.
      expect(tripCountdown("2027-03-12", "2027-03-17", "2027-03-15")).toBe("DAY 4 OF 6");
      expect(tripCountdown("2027-03-12", "2027-03-17", "2027-03-17")).toBe("DAY 6 OF 6");
      // Counting down over the change.
      expect(tripCountdown("2027-03-20", "2027-03-24", "2027-03-10")).toBe("IN 10 DAYS");
      expect(tripCountdown("2027-03-15", "2027-03-17", "2027-03-14")).toBe("TOMORROW");
      // Just back over the autumn change too (7 Nov 2027).
      expect(tripCountdown("2027-11-01", "2027-11-06", "2027-11-13")).toBe("JUST BACK");
      expect(tripCountdown("2027-11-01", "2027-11-06", "2027-11-14")).toBeNull();
    });
  });
});
