import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

/**
 * Speed (29 Sep 2026, testers: "screens load too slowly"). The Journeys page
 * asked Google for the next trip's destination on every load — two calls,
 * ~1.5 s, for a section folded by default — and read climate data for it.
 * The journey already stores its coordinates; the climate waits until the
 * section is opened.
 */
const year = readFileSync("src/components/trips/YearView.tsx", "utf8");
const page = readFileSync("src/app/(app)/trips/page.tsx", "utf8");

describe("the Journeys page does no lookups it does not need", () => {
  it("uses the journey's saved coordinates before asking Google", () => {
    const saved = year.indexOf("next.destination_lat");
    const google = year.indexOf("await resolvePlaceByName(name");
    expect(saved).toBeGreaterThan(-1);
    expect(saved).toBeLessThan(google);
    expect(page).toMatch(/destination_lat: t\.destination_lat/);
  });
  it("reads climate only once Your year is open", () => {
    expect(year).toMatch(/if \(!dest \|\| openState !== true\) return;/);
  });
});

describe("picking a day moves the week's map gently", () => {
  const map = readFileSync("src/components/plan/WeekMap.tsx", "utf8");
  it("a straight glide to the neighbourhood, not a dive to the street", () => {
    // 12, not 13 (30 Sep 2026): "still zoomed in a bit too close".
    expect(map).toMatch(/const DAY_ZOOM = 12;/);
    expect(map).toMatch(/maxZoom: DAY_ZOOM, duration: DAY_GLIDE_MS, linear: true/);
    expect(map).not.toMatch(/maxZoom: 15, duration: 600/);
  });
});
