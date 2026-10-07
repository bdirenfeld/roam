import { describe, it, expect } from "vitest";
import { welcomeHomeKey, welcomeHomeLine, welcomeHomeOpen } from "./welcomeHome";

// "Welcome home" after a journey (7 Oct 2026, delight audit).
describe("welcomeHomeOpen", () => {
  const END = "2026-10-12";
  it("not before or during the trip, not on the last day", () => {
    expect(welcomeHomeOpen(END, "2026-10-09")).toBe(false);
    expect(welcomeHomeOpen(END, "2026-10-12")).toBe(false);
  });
  it("the day after through the 14th day after", () => {
    expect(welcomeHomeOpen(END, "2026-10-13")).toBe(true);
    expect(welcomeHomeOpen(END, "2026-10-26")).toBe(true);
  });
  it("not after the 14 days", () => {
    expect(welcomeHomeOpen(END, "2026-10-27")).toBe(false);
    expect(welcomeHomeOpen(END, "2027-01-01")).toBe(false);
  });
  it("by calendar day across a month end and a clock change", () => {
    expect(welcomeHomeOpen("2026-10-25", "2026-11-08")).toBe(true);
    expect(welcomeHomeOpen("2026-10-25", "2026-11-09")).toBe(false);
  });
  it("missing dates never open", () => {
    expect(welcomeHomeOpen(null, "2026-10-13")).toBe(false);
    expect(welcomeHomeOpen("soon", "2026-10-13")).toBe(false);
  });
});

describe("welcomeHomeLine", () => {
  const card = (day: string | null, id: string, loved = false) => ({ day_id: day, place: { id, loved } });
  it("days, distinct places on the days, and the loved ones", () => {
    const cards = [card("d1", "a", true), card("d1", "b"), card("d2", "a", true), card("d2", "c", true), card("d3", "d")];
    expect(welcomeHomeLine("2026-10-09", "2026-10-12", cards)).toBe("4 days, 4 places, 2 you loved");
  });
  it("cards with no day or no place don't count", () => {
    const cards = [card(null, "x", true), { day_id: "d1", place: null }, card("d1", "a")];
    expect(welcomeHomeLine("2026-10-09", "2026-10-12", cards)).toBe("4 days, 1 place");
  });
  it("singular day and place; loved left out at 0", () => {
    expect(welcomeHomeLine("2026-10-09", "2026-10-09", [card("d1", "a")])).toBe("1 day, 1 place");
  });
  it("one loved place", () => {
    expect(welcomeHomeLine("2026-10-09", "2026-10-10", [card("d1", "a", true), card("d2", "b")])).toBe("2 days, 2 places, 1 you loved");
  });
  it("backwards or missing dates: nothing", () => {
    expect(welcomeHomeLine("2026-10-12", "2026-10-09", [])).toBeNull();
    expect(welcomeHomeLine(null, "2026-10-09", [])).toBeNull();
  });
  it("one key per journey", () => {
    expect(welcomeHomeKey("t1")).not.toBe(welcomeHomeKey("t2"));
  });
});
