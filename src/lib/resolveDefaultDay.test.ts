import { describe, it, expect } from "vitest";
import { resolveDefaultDay } from "./resolveDefaultDay";

/**
 * The days below are the real Rome journey, 22–28 April 2026.
 *
 * This decides which day you land on when you open a journey — from the
 * journeys list, from the trip root, and from a guest's invite link. Getting
 * it wrong doesn't crash anything; it just quietly puts someone on the wrong
 * day, which is why it is worth pinning down.
 *
 * Tests run with TZ=America/Toronto (vitest.config.ts) so the local-midnight
 * case below means something. On a UTC machine it would pass either way.
 */
const ROME = [
  { id: "d1", date: "2026-04-22" },
  { id: "d2", date: "2026-04-23" },
  { id: "d3", date: "2026-04-24" },
  { id: "d4", date: "2026-04-25" },
  { id: "d5", date: "2026-04-26" },
  { id: "d6", date: "2026-04-27" },
  { id: "d7", date: "2026-04-28" },
];

// `new Date(y, m, d, ...)` is local time, which is the point.
const localNoon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0);

describe("resolveDefaultDay", () => {
  it("returns null for a journey with no days", () => {
    expect(resolveDefaultDay([], localNoon(2026, 4, 25))).toBeNull();
  });

  it("opens day one when the journey is still ahead", () => {
    expect(resolveDefaultDay(ROME, localNoon(2026, 3, 1))?.id).toBe("d1");
  });

  it("opens day one on the first day", () => {
    expect(resolveDefaultDay(ROME, localNoon(2026, 4, 22))?.id).toBe("d1");
  });

  it("opens today's day mid-journey", () => {
    expect(resolveDefaultDay(ROME, localNoon(2026, 4, 25))?.id).toBe("d4");
  });

  it("stays on the last day rather than rolling over", () => {
    // The journey isn't over until the day is.
    expect(resolveDefaultDay(ROME, localNoon(2026, 4, 28))?.id).toBe("d7");
  });

  it("goes back to day one once the journey has passed", () => {
    expect(resolveDefaultDay(ROME, localNoon(2026, 5, 10))?.id).toBe("d1");
  });

  /**
   * The reason `toCalendarDate` builds the string by hand instead of using
   * toISOString(): at 11:30 PM in Toronto it is already tomorrow in UTC.
   * toISOString() would say 2026-04-23 and open the wrong day for anyone
   * checking their plan last thing at night.
   */
  it("uses the local calendar date late at night, not the UTC one", () => {
    const lateOnTheFirstNight = new Date(2026, 3, 22, 23, 30);
    expect(lateOnTheFirstNight.toISOString().slice(0, 10)).toBe("2026-04-23"); // the trap
    expect(resolveDefaultDay(ROME, lateOnTheFirstNight)?.id).toBe("d1"); // the behaviour
  });

  it("does not depend on the order the days were fetched in", () => {
    const shuffled = [ROME[4], ROME[0], ROME[6], ROME[2], ROME[1], ROME[5], ROME[3]];
    expect(resolveDefaultDay(shuffled, localNoon(2026, 4, 25))?.id).toBe("d4");
    expect(resolveDefaultDay(shuffled, localNoon(2026, 3, 1))?.id).toBe("d1");
    expect(resolveDefaultDay(shuffled, localNoon(2026, 4, 28))?.id).toBe("d7");
  });

  it("falls back to the last day on or before today when dates have a gap", () => {
    const gapped = [
      { id: "a", date: "2026-04-22" },
      { id: "b", date: "2026-04-24" },
      { id: "c", date: "2026-04-28" },
    ];
    expect(resolveDefaultDay(gapped, localNoon(2026, 4, 26))?.id).toBe("b");
  });

  it("returns a day from the array it was given, not a copy", () => {
    // Callers use the returned id to build a URL; an internally sorted copy
    // must not become the thing handed back.
    const picked = resolveDefaultDay(ROME, localNoon(2026, 4, 25));
    expect(ROME).toContain(picked);
  });
});
