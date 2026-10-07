import { describe, it, expect } from "vitest";
import { readableHours, hoursClash } from "./hoursLine";

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
