/**
 * One Find request's body (30 Sep 2026), shared by the Find sheet and the
 * background warm-up (hooks/useWarmFind), so both ask the server the same
 * question and land on the same cached answer. Coffee and dessert carry the
 * base's sight clusters (lib/find/near), which are part of the cache key.
 */
import type { FindBase } from "./gaps";
import { nearCentres, NEAR_PLAN } from "./near";

export type FindMode = "google" | "travellers";

export function findRequest(tripId: string, base: FindBase, subType: string, mode: FindMode, ask: string | null = null) {
  const near = NEAR_PLAN.has(subType) && base.sights.length
    ? { near: nearCentres(base.sights, 4), nearNames: base.sights.slice(0, 6).map((x) => x.title) }
    : {};
  return { tripId, base: { label: base.label, lat: base.lat, lng: base.lng }, subType, ask, mode, ...near };
}

/**
 * What to search ahead for a journey: every category, both halves, for its
 * main bases (two at most), and only while the trip is still to come.
 */
export function warmPlan(bases: FindBase[], categories: string[], endDate: string | null, today: string): { base: FindBase; subType: string; mode: FindMode }[] {
  if (endDate && endDate < today) return [];
  const out: { base: FindBase; subType: string; mode: FindMode }[] = [];
  for (const base of bases.slice(0, 2)) {
    for (const subType of categories) {
      out.push({ base, subType, mode: "google" });
      out.push({ base, subType, mode: "travellers" });
    }
  }
  return out;
}
