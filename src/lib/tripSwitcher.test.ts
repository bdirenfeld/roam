import { describe, it, expect } from "vitest";
import { groupTrips } from "./tripSwitcher";

// Brennan's journeys as they stood on 26 Sep 2026 (from the live trips table).
const TRIPS = [
  { id: "au", title: "Australia", start_date: "2026-02-15", end_date: "2026-02-20", archived: false },
  { id: "cr", title: "Costa Rica", start_date: "2026-03-04", end_date: "2026-03-12", archived: false },
  { id: "ro", title: "Rome April 2026", start_date: "2026-04-22", end_date: "2026-04-28", archived: false },
  { id: "ny", title: "New York (Mia & Daddy)", start_date: "2026-07-23", end_date: "2026-07-26", archived: false },
  { id: "lw", title: "Last Week of Summer", start_date: "2026-08-31", end_date: "2026-09-04", archived: false },
  { id: "sb", title: "Santa Barbara Anniversary 2026", start_date: "2026-10-09", end_date: "2026-10-12", archived: true },
  { id: "ps", title: "Palm Springs", start_date: "2027-03-13", end_date: "2027-03-20", archived: true },
  { id: "tu", title: "Tuscany", start_date: "2027-08-24", end_date: "2027-09-04", archived: false },
  { id: "jp", title: "Japan", start_date: "2028-04-02", end_date: "2028-04-15", archived: true },
];

describe("groupTrips", () => {
  it("puts upcoming soonest first and past most recent first, archived left out", () => {
    const { upcoming, past } = groupTrips(TRIPS, "2026-09-26");
    expect(upcoming.map((t) => t.id)).toEqual(["tu"]);
    expect(past.map((t) => t.id)).toEqual(["lw", "ny", "ro", "cr", "au"]);
  });

  it("counts a journey under way as upcoming, including its last day", () => {
    const { upcoming, past } = groupTrips(TRIPS, "2026-09-04");
    expect(upcoming[0].id).toBe("lw");
    expect(past[0].id).toBe("ny");
  });

  it("handles no journeys", () => {
    expect(groupTrips([], "2026-09-26")).toEqual({ upcoming: [], past: [] });
  });
});
