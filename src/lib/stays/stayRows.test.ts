// ── The LIST over his real rows, not the rules one at a time ──────────────
//
// `fixtures/stayRows.json` is every journey's stay_candidates plus the
// stay-type places on its itinerary, pulled from the live database on
// 15 Sept 2026. Pull it again when the journeys change (the query is in the
// roam-stay-audit-2 memory). The assertions are the things a person would
// laugh at, which 370 green tests missed that morning: a booked stay shown as
// a candidate, a kennel offered as a hotel, Hakone on the Tokyo list.

import { describe, it, expect } from "vitest";
import rows from "./fixtures/stayRows.json";
import { bookedStay, pickSaved, MAX_SAVED_ROWS } from "./ownStays";
import { greatCircleKm } from "./brief";

interface Fixture {
  title: string;
  accommodation_name: string | null;
  bases: { label: string; lat: number; lng: number; nights: number }[];
  stays: { place_id: string; title: string; lat: number; lng: number; scheduledDays: string[] | null; interested: boolean }[];
  candidates: { name: string; base: number | null; status: string; source: string; feel: string | null; place_id: string | null; lat: number; lng: number; total: number | null; hours: number | null }[];
}
const journeys = rows as Fixture[];

/** The ones where he has actually booked: the itinerary carries the stay. */
const BOOKED: Record<string, string> = {
  "Costa Rica": "Modern Casita",
  "Santa Barbara Anniversary 2026": "Montecito Inn",
  "Tuscany": "Villa Bottino",
  "New York (Mia & Daddy)": "11 Howard",
  "Rome April 2026": "Hotel NH Collection Roma Palazzo Cinquecento",
};

describe("the stays each journey already has", () => {
  it("explores enough to mean something", () => {
    expect(journeys.length).toBeGreaterThanOrEqual(9);
    expect(journeys.filter((j) => j.stays.some((s) => s.scheduledDays?.length)).length).toBeGreaterThanOrEqual(5);
  });

  it.each(journeys.map((j) => [j.title, j] as const))("%s — the booked stay is recognised, and nothing else is", (title, j) => {
    const got = bookedStay(j.stays, j.accommodation_name);
    const want = BOOKED[title] ?? null;
    const name = got ? j.stays.find((s) => s.place_id === got)?.title ?? null : null;
    expect(name).toBe(want);
  });

  it.each(journeys.filter((j) => j.bases.length > 0).map((j) => [j.title, j] as const))("%s — saved places never crowd the list", (_title, j) => {
    j.bases.forEach((base, i) => {
      const saved = j.stays.map((s) => ({
        ...s,
        chosen: bookedStay(j.stays, j.accommodation_name) === s.place_id,
        hearted: j.candidates.some((c) => c.place_id === s.place_id && c.feel === "up"),
      })).filter((s) => {
        // the nearest-base rule from the route
        let best = 0, bestKm = Infinity;
        j.bases.forEach((b, k) => { const km = greatCircleKm(b.lat, b.lng, s.lat, s.lng); if (km < bestKm) { bestKm = km; best = k; } });
        return best === i;
      });
      const picked = pickSaved(saved, base);
      const optional = picked.filter((s) => !s.chosen && !s.hearted);
      expect(optional.length).toBeLessThanOrEqual(MAX_SAVED_ROWS);
      // An optional saved row is one of the NEAREST — never a ryokan two
      // hours out while a hotel in town waits.
      const skipped = saved.filter((s) => !picked.includes(s));
      for (const o of optional) for (const s of skipped) {
        expect(greatCircleKm(base.lat, base.lng, o.lat, o.lng)).toBeLessThanOrEqual(greatCircleKm(base.lat, base.lng, s.lat, s.lng) + 0.01);
      }
    });
  });

  it("Tokyo keeps HOSHINOYA and Hamacho, and the search gets three slots back", () => {
    const japan = journeys.find((j) => j.title === "Japan") as Fixture;
    const tokyo = japan.bases[0];
    const picked = pickSaved(japan.stays.filter((s) => greatCircleKm(tokyo.lat, tokyo.lng, s.lat, s.lng) < 200), tokyo);
    expect(picked.map((s) => s.title).sort()).toEqual(["HOSHINOYA Tokyo", "Hamacho Hotel"]);
  });
});
