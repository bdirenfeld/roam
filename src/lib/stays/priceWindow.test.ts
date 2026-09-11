import { describe, it, expect } from "vitest";
import journeys from "./fixtures/journeys.json";
import { priceWindow, priceWindowNote, PRICE_HORIZON_DAYS } from "./priceWindow";

/**
 * Run over every journey Brennan has, on the day this was written, because
 * "it didn't work for Japan" was a price window nobody would quote and the
 * only way to know is to try all of them (roam-ship §3).
 */
const TODAY = new Date("2026-09-10T12:00:00Z");
interface Fixture { title: string; startDate: string; endDate: string; archived: boolean }
const ALL = journeys as unknown as Fixture[];

describe("priceWindow", () => {
  it("leaves a bookable window alone", () => {
    const w = priceWindow("2026-10-09", "2026-10-12", TODAY);
    expect(w).toEqual({ start: "2026-10-09", end: "2026-10-12", shifted: null });
    expect(priceWindowNote(w, "2026-10-09")).toBeNull();
  });

  it("rolls a finished journey forward a year, keeping the season", () => {
    const w = priceWindow("2026-07-23", "2026-07-26", TODAY);
    expect(w).toEqual({ start: "2027-07-23", end: "2027-07-26", shifted: "past" });
    expect(priceWindowNote(w, "2026-07-23")).toBe("These dates have passed; prices are for the same days in 2027.");
  });

  it("rolls a far journey back a year, keeping the season", () => {
    const w = priceWindow("2028-04-02", "2028-04-15", TODAY);
    expect(w).toEqual({ start: "2027-04-02", end: "2027-04-15", shifted: "far" });
    expect(priceWindowNote(w, "2028-04-02")).toBe("Priced for the same days in 2027, since 2028 is too far ahead.");
  });

  it("never rolls a window into the past to reach the horizon", () => {
    // Six months out, so already inside the horizon: untouched.
    const w = priceWindow("2027-03-13", "2027-03-20", TODAY);
    expect(w.shifted).toBeNull();
  });

  it("keeps the trip's length whatever it does", () => {
    const nights = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400000;
    for (const j of ALL) {
      const w = priceWindow(j.startDate, j.endDate, TODAY);
      expect(nights(w.start, w.end), j.title).toBe(nights(j.startDate, j.endDate));
    }
  });

  it("gives every journey a window someone would quote", () => {
    const todayStr = TODAY.toISOString().slice(0, 10);
    const horizon = new Date(TODAY.getTime() + PRICE_HORIZON_DAYS * 86400000).toISOString().slice(0, 10);
    for (const j of ALL) {
      const w = priceWindow(j.startDate, j.endDate, TODAY);
      expect(w.end >= todayStr, `${j.title} ends in the past`).toBe(true);
      expect(w.start <= horizon, `${j.title} starts beyond the horizon`).toBe(true);
    }
  });

  it("names what each of his journeys does today", () => {
    const shifts = Object.fromEntries(ALL.map((j) => [j.title, priceWindow(j.startDate, j.endDate, TODAY).shifted]));
    expect(shifts).toMatchObject({
      "Australia": "past",
      "Costa Rica": "past",
      "New York (Mia & Daddy)": "past",
      "Rome April 2026": "past",
      "Last Week of Summer": "past",
      "Santa Barbara Anniversary 2026": null,
      "Palm Springs": null,
      "Tuscany": null,
      "Japan": "far",
    });
  });
});
