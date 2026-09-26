import { describe, it, expect } from "vitest";
import { landingTripId, isPhone } from "./landing";

// His journeys on 26 Sep 2026 (live trips table), trimmed to what decides.
const TRIPS = [
  { id: "lw", title: "Last Week of Summer", start_date: "2026-08-31", end_date: "2026-09-04", archived: false },
  { id: "sb", title: "Santa Barbara Anniversary 2026", start_date: "2026-10-09", end_date: "2026-10-12", archived: true },
  { id: "tu", title: "Tuscany", start_date: "2027-08-24", end_date: "2027-09-04", archived: false },
];

describe("landingTripId", () => {
  it("opens the soonest upcoming journey, never an archived one", () => {
    expect(landingTripId(TRIPS, "2026-09-26")).toBe("tu");
  });
  it("opens the journey under way", () => {
    expect(landingTripId(TRIPS, "2026-09-02")).toBe("lw");
  });
  it("gives no journey when nothing is ahead, so the Journeys list opens", () => {
    expect(landingTripId(TRIPS, "2027-12-01")).toBeNull();
    expect(landingTripId([], "2026-09-26")).toBeNull();
  });
});

describe("isPhone", () => {
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
  const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
  const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
  it("trusts the client hint first", () => {
    expect(isPhone(WINDOWS, "?1")).toBe(true);
    expect(isPhone(ANDROID, "?0")).toBe(false);
  });
  it("reads the user agent otherwise", () => {
    expect(isPhone(IPHONE, null)).toBe(true);
    expect(isPhone(ANDROID, null)).toBe(true);
    expect(isPhone(WINDOWS, null)).toBe(false);
    expect(isPhone(IPAD, null)).toBe(false);
    expect(isPhone(null, null)).toBe(false);
  });
});
