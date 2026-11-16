import { describe, it, expect } from "vitest";
import { readableHours, hoursClash, weekSummary } from "./hoursLine";

// Values as Google stores them on his places (Uffizi, Buca di Sant'Antonio, Sesriem Canyon).
describe("readableHours: the week text in the Hours row (7 Oct 2026)", () => {
  it("ordinary and split hours stay as Google wrote them", () => {
    expect(readableHours("8:15 AM – 6:30 PM")).toBe("8:15 AM – 6:30 PM");
    expect(readableHours("12:30 – 2:30 PM, 7:30 – 10:00 PM")).toBe("12:30 – 2:30 PM, 7:30 – 10:00 PM");
    expect(readableHours("Closed")).toBe("Closed");
    expect(readableHours("Open 24 hours")).toBe("Open 24 hours");
  });
  it("past midnight says next day or midnight instead of reading like a typo", () => {
    expect(readableHours("6:30 AM – 6:00 AM")).toBe("6:30 AM – 6:00 AM (next day)");
    expect(readableHours("6:30 AM – 12:00 AM")).toBe("6:30 AM – midnight");
    expect(readableHours("6:00 PM – 2:00 AM")).toBe("6:00 PM – 2:00 AM (next day)");
    expect(readableHours("11:00 AM – 2:30 PM, 6:00 PM – 1:00 AM")).toBe("11:00 AM – 2:30 PM, 6:00 PM – 1:00 AM (next day)");
  });
});

describe("hoursClash: the line under the time (7 Oct 2026, mock t04)", () => {
  it("phrases each clash the way the mock does", () => {
    expect(hoursClash({ kind: "closed", weekday: "Monday" })).toEqual({ lead: "Closed on Monday", tail: "" });
    expect(hoursClash({ kind: "opens", opensAt: "10:00" })).toEqual({ lead: "Opens 10:00 AM", tail: " — after you arrive" });
    expect(hoursClash({ kind: "closes", closesAt: "23:00" })).toEqual({ lead: "Closes 11:00 PM", tail: " — before you finish" });
    expect(hoursClash({ kind: "closes", closesAt: "00:00" }).lead).toBe("Closes at midnight");
  });
});

// The Accademia (David) as Google writes it, 16 Nov 2026.
const DAVID = ["Monday: Closed", "Tuesday: 8:15 AM – 6:20 PM", "Wednesday: 8:15 AM – 6:20 PM", "Thursday: 8:15 AM – 6:20 PM", "Friday: 8:15 AM – 6:20 PM", "Saturday: 8:15 AM – 6:20 PM", "Sunday: 8:15 AM – 6:20 PM"];
describe("weekSummary — the week in one line when the day is Closed", () => {
  it("the Accademia: usual hours, then the closed day", () => {
    expect(weekSummary(DAVID)).toBe("8:15 AM – 6:20 PM · closed Mon");
  });
  it("open every day the same: just the hours", () => {
    expect(weekSummary(DAVID.map((l) => l.replace("Closed", "8:15 AM – 6:20 PM")))).toBe("8:15 AM – 6:20 PM");
  });
  it("open days that differ: no summary (the day line stays)", () => {
    expect(weekSummary(["Monday: Closed", "Tuesday: 9:00 AM – 5:00 PM", "Wednesday: 10:00 AM – 4:00 PM"])).toBeNull();
  });
  it("nothing known, or closed all week: no summary", () => {
    expect(weekSummary(null)).toBeNull();
    expect(weekSummary(["Monday: Closed"])).toBeNull();
  });
});
