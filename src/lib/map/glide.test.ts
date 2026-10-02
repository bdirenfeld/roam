import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { glideMs, stayGlide, boxCentre, kmBetween, GLIDE_MIN_MS, GLIDE_MAX_MS, NEAR_KM } from "./glide";

/**
 * Where to stay's map moves (2 Oct 2026). Osaka to Tokyo took ~4–6 s under
 * Mapbox's distance-timed flyTo; Brennan: "super slow", and "don't make it
 * aggressive and jerky… it just needs to not lag or look jumpy".
 */

// Real places from his Japan journey's two bases.
const osaka = { lng: 135.5023, lat: 34.6937 };
const tokyo = { lng: 139.6917, lat: 35.6895 };
const dotonbori = { lng: 135.5013, lat: 34.6687 };

describe("Where to stay's glide", () => {
  it("Osaka to Tokyo is ~400 km and takes the capped time, not Mapbox's 4–6 s", () => {
    const km = kmBetween(osaka, tokyo);
    expect(km).toBeGreaterThan(380);
    expect(km).toBeLessThan(420);
    expect(stayGlide(osaka, tokyo)).toEqual({ duration: GLIDE_MAX_MS, linear: false });
  });

  it("every move takes about 1 to 1.5 s, whatever the distance", () => {
    for (const km of [0, 0.05, 1, 3, 10, 25, 50, 120, 300, 400, 2000, 9000]) {
      const ms = glideMs(km);
      expect(ms).toBeGreaterThanOrEqual(900);
      expect(ms).toBeLessThanOrEqual(1500);
    }
    expect(GLIDE_MIN_MS).toBeGreaterThanOrEqual(900);
    expect(GLIDE_MAX_MS).toBeLessThanOrEqual(1500);
  });

  it("a longer hop never takes less time than a shorter one (no lurch on the long ones)", () => {
    let last = 0;
    for (let km = 0; km <= 1000; km += 5) {
      const ms = glideMs(km);
      expect(ms).toBeGreaterThanOrEqual(last);
      last = ms;
    }
    expect(glideMs(400)).toBeGreaterThan(glideMs(3));
  });

  it("a hop across town eases straight across; a hop between cities arcs", () => {
    expect(stayGlide(osaka, dotonbori).linear).toBe(true);
    expect(stayGlide(osaka, { lng: 135.5023 + 0.4, lat: 34.6937 }).linear).toBe(false); // ~36 km
    expect(NEAR_KM).toBeLessThan(36);
  });

  it("nothing to measure from: still a glide, never zero (zero is a jump-cut)", () => {
    expect(stayGlide(null, tokyo).duration).toBe(GLIDE_MIN_MS);
    expect(glideMs(NaN)).toBe(GLIDE_MIN_MS);
  });

  it("the middle of the five pins is where fitBounds is heading", () => {
    expect(boxCentre([])).toBeNull();
    expect(boxCentre([[135, 34], [140, 36], [137, 35]])).toEqual({ lng: 137.5, lat: 35 });
  });
});

// The rule only helps if both maps use it. This reads the two components, the
// way lib/ui/layers.test.ts does, and names the file to fix.
describe("both maps' Where to stay moves go through stayGlide", () => {
  const files = ["src/components/map/FullMapClient.tsx", "src/components/plan/WeekMap.tsx"];
  for (const f of files) {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    it(`${f}: the stays fit and the focused stay are timed by stayGlide`, () => {
      expect(src, `${f} must import stayGlide from lib/map/glide`).toMatch(/import \{[^}]*stayGlide[^}]*\} from "@\/lib\/map\/glide"/);
      const fit = src.split("\n").find((l) => /fitBounds\(/.test(l) && /maxZoom: 13/.test(l));
      expect(fit, `${f}: the stays' fitBounds (maxZoom 13) not found`).toBeTruthy();
      expect(fit, `${f}: the stays' fitBounds must spread stayGlide(...)`).toMatch(/\.\.\.stayGlide\(/);
      const focus = src.slice(src.indexOf("if (!map || !focusedStay"), src.indexOf("if (!map || !focusedStay") + 600);
      expect(focus, `${f}: the focused stay's move must use stayGlide`).toMatch(/stayGlide\(/);
      expect(focus).not.toMatch(/map\.flyTo\(\{ center: \[focusedStay\.lng, focusedStay\.lat\], zoom: Math\.max\(map\.getZoom\(\), 12\) \}\)/);
    });
    it(`${f}: never maxDuration (Mapbox jump-cuts past it)`, () => {
      expect(src).not.toMatch(/maxDuration/);
    });
  }
});
