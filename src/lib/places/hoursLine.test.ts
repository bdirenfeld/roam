import { describe, it, expect } from "vitest";
import { hoursSummary, isLocalToday } from "./hoursLine";

// Values as Google stores them on his places (Uffizi, Buca di Sant'Antonio).
describe("hoursSummary (7 Oct 2026, taps audit)", () => {
  it("an open day reads 'Open … today'", () => {
    expect(hoursSummary("8:15 AM – 6:30 PM", "Tuesday", true)).toBe("Open 8:15 AM – 6:30 PM today");
  });
  it("split hours stay as Google wrote them", () => {
    expect(hoursSummary("12:30 – 2:30 PM, 7:30 – 10:00 PM", "Tuesday", true)).toBe("Open 12:30 – 2:30 PM, 7:30 – 10:00 PM today");
  });
  it("a closed day is phrased the same way", () => {
    expect(hoursSummary("Closed", "Monday", true)).toBe("Closed today");
  });
  it("'Open 24 hours' is not doubled", () => {
    expect(hoursSummary("Open 24 hours", "Sunday", true)).toBe("Open 24 hours today");
  });
  it("a card on another day names that day, never 'today'", () => {
    expect(hoursSummary("8:15 AM – 6:30 PM", "Tuesday", false)).toBe("Open 8:15 AM – 6:30 PM on Tuesday");
    expect(hoursSummary("Closed", "Monday", false)).toBe("Closed on Monday");
  });
});

describe("isLocalToday", () => {
  it("compares local calendar dates, not UTC", () => {
    const lateEvening = new Date(2026, 9, 13, 23, 30);
    expect(isLocalToday("2026-10-13", lateEvening)).toBe(true);
    expect(isLocalToday("2026-10-14", lateEvening)).toBe(false);
  });
});
