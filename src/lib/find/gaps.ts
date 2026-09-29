/**
 * What a journey's bases are short of, in Roam's own categories (29 Sep
 * 2026, Find). Brennan: "why are we creating new slices of data when our
 * database is pretty MECE" — so the gaps are the sub-types every place
 * already has, counted against the days spent at each base. Who is going
 * (children) shapes the results, never the categories.
 *
 * A base is a region of the journey's places (lib/plan/dayGroups: the same
 * 100 km rule as Where to stay). A journey with nothing on its map has one
 * base: its destination, for all its days.
 */

import type { Card } from "@/types/database";
import { groupPins, type Pin } from "@/lib/plan/dayGroups";
import { regionLabel } from "@/lib/plan/draftTrip";
import { subTypeLabel } from "@/lib/subTypeLabel";

export interface FindCategory {
  subType: string;
  type: "activity" | "food";
  label: string;
}

/**
 * Exactly the food and activity kinds a person can pick anywhere else in Roam
 * (the map's Filter, the add-a-place sheet), in the same words: Find covers
 * the whole list, not a slice, and cannot drift from it (his call, 29 Sep
 * 2026; the first cut said "Guided" where the app says "Tour", and had a
 * Shopping the app does not). Explore first because Find opens on it, then
 * the rest by how often a trip needs them. No targets: "7 of 14" was a guess
 * (Tamarindo has about eight restaurants worth listing, and a family with a
 * kitchen eats in); a chip shows only how many are saved.
 */
const KINDS: [string, FindCategory["type"]][] = [
  ["self_directed", "activity"], ["restaurant", "food"], ["coffee", "food"], ["dessert", "food"], ["bar", "food"],
  ["guided", "activity"], ["beach", "activity"], ["wellness", "activity"], ["event", "activity"], ["challenge", "activity"], ["camp", "activity"],
];
export const FIND_CATEGORIES: FindCategory[] = KINDS.map(([subType, type]) => ({ subType, type, label: subTypeLabel(subType)! }));

export interface FindBase {
  label: string;
  lat: number;
  lng: number;
  days: number;
  /** Places saved or planned at this base, by sub-type. */
  counts: Record<string, number>;
}

export interface Gap { category: FindCategory; have: number }

type TripLike = { destination: string | null; destination_lat: number | null; destination_lng: number | null; start_date: string; end_date: string };

const daysOf = (t: TripLike) => Math.max(1, Math.round((Date.parse(t.end_date) - Date.parse(t.start_date)) / 86_400_000) + 1);

export function findBases(cards: Card[], trip: TripLike): FindBase[] {
  const total = daysOf(trip);
  const seen = new Set<string>();
  const pins: (Pin & { dayId: string | null })[] = [];
  for (const c of cards) {
    const p = c.place;
    if (!p || p.lat == null || p.lng == null || p.type === "logistics") continue;
    const key = c.place_id ?? c.id;
    if (seen.has(key)) continue;
    seen.add(key);
    pins.push({ id: c.id, title: p.title, type: p.type, subType: p.sub_type, lat: p.lat, lng: p.lng, address: p.address, dayId: c.status === "in_itinerary" ? c.day_id : null });
  }
  if (pins.length === 0) {
    if (trip.destination_lat == null || trip.destination_lng == null) return [];
    return [{ label: (trip.destination ?? "").split(",")[0].trim() || "Destination", lat: trip.destination_lat, lng: trip.destination_lng, days: total, counts: {} }];
  }

  const g = groupPins(pins, { kids: false });
  const regionOf = new Map<string, number>();
  for (const gr of g.groups) for (const p of [...gr.items, ...gr.meals]) regionOf.set(p.id, gr.region);
  for (const m of g.spareMeals) {
    // A meal no day had room for still belongs to the nearest region.
    let best = -1, d = Infinity;
    g.regions.forEach((r) => { const k = Math.hypot(r.centre.lat - (m.lat ?? 0), r.centre.lng - (m.lng ?? 0)); if (k < d) { d = k; best = r.id; } });
    if (best >= 0) regionOf.set(m.id, best);
  }

  const regions = g.regions.filter((r) => pins.some((p) => regionOf.get(p.id) === r.id));
  // Days at a base: its planned days when the journey is planned, else a share
  // of the journey in proportion to its places.
  const planned = new Map<number, Set<string>>();
  for (const p of pins) { const r = regionOf.get(p.id); if (r != null && p.dayId) { if (!planned.has(r)) planned.set(r, new Set()); planned.get(r)!.add(p.dayId); } }
  const plannedTotal = Array.from(planned.values()).reduce((s, x) => s + x.size, 0);
  const placesTotal = regions.reduce((s, r) => s + pins.filter((p) => regionOf.get(p.id) === r.id).length, 0) || 1;

  const byPlan = plannedTotal > 0 && planned.size === regions.length;
  // Share the journey's days out: one each, the rest by places, largest
  // remainder first, so the bases add up to the trip (rounding each one gave
  // Japan 17 days of bases for a 14-day trip).
  const sizes = regions.map((r) => pins.filter((p) => regionOf.get(p.id) === r.id).length);
  const spare = Math.max(0, total - regions.length);
  const raw = sizes.map((n) => (n / placesTotal) * spare);
  const alloc = raw.map((x) => 1 + Math.floor(x));
  let left = total - alloc.reduce((a, b) => a + b, 0);
  raw.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r).forEach(({ i }) => { if (left > 0) { alloc[i]++; left--; } });

  return regions.map((r, i) => {
    const mine = pins.filter((p) => regionOf.get(p.id) === r.id);
    const counts: Record<string, number> = {};
    for (const p of mine) if (p.subType) counts[p.subType] = (counts[p.subType] ?? 0) + 1;
    const days = byPlan ? Math.max(1, planned.get(r.id)!.size) : alloc[i];
    return { label: regionLabel(mine) ?? mine[0].title, lat: r.centre.lat, lng: r.centre.lng, days, counts };
  }).sort((a, b) => b.days - a.days);
}

/** Every Find category with how many places this base already has in it. */
export function gapsFor(base: FindBase): Gap[] {
  return FIND_CATEGORIES.map((category) => ({ category, have: base.counts[category.subType] ?? 0 }));
}
