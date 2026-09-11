// ── Which offers become rows ──────────────────────────────────────────────
// Lifted out of the search route so it can be TESTED.
//
// Brennan, 11 Sept 2026: "every time I look at the UI, I find an issue in
// like 2 seconds. You run like 200 tests and can't find a single one. What's
// the disconnect?" The disconnect was that every test lived in src/lib and
// tested arithmetic, while the decisions that put a wrong hotel in front of
// him lived inside a 450-line route handler that nothing could call.
//
// "Gallo Cedrone, sleeps 6" on a Tuscany list for seven is exactly that: the
// rule was one line in a filter chain, and no test could reach it.

import { greatCircleKm } from "./brief";
import { budgetVerdict, nightlyOf } from "./budget";
import { failsAsk, type Ask } from "./wants";

/** Only what the choosing actually reads — the route's offer type is wider. */
export interface Offer {
  name: string;
  lat: number;
  lng: number;
  score: number | null;
  reviews: number | null;
  total: number | null;
  nightly: number | null;
  beds: number | null;
  sleeps: number | null;
  amenities?: string[];
}

export interface PickOpts {
  /** Everyone coming. A listing that says it sleeps fewer is the wrong house. */
  party: number;
  /** Bedrooms the party needs; one short is still worth showing. */
  fitBedrooms: number;
  /** Nights at THIS base, for working a nightly rate out of a total. */
  nights: number;
  /** The Estimate's nightly rate, or null when the journey has none. */
  ceiling: number | null;
  /** What he typed he must have. */
  ask: Ask;
  /** The base's centre; a stay far from it is a different trip. */
  centre: { lat: number; lng: number };
  maxKm: number;
  /** Rejected or already-seen names, lower-cased. */
  skipNames: Set<string>;
  /** Names already on the list this run, lower-cased. */
  taken: Set<string>;
  /** Normalised names from the inventory the journey actually wants. */
  preferred: Set<string>;
  /** Room left on the list. */
  room: number;
}

const MIN_SCORE = 4.3;
const MIN_REVIEWS = 20;

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Why an offer was dropped — so a test can say which rule fired, not just that one did. */
export type DropReason =
  | "score" | "budget" | "must-have" | "too far" | "seen" | "duplicate"
  | "too few bedrooms" | "sleeps too few";

export function dropReason(o: Offer, opts: PickOpts): DropReason | null {
  if ((o.score ?? 0) < MIN_SCORE || (o.reviews ?? 0) < MIN_REVIEWS) return "score";
  if (budgetVerdict(nightlyOf(o.nightly, o.total, opts.nights), opts.ceiling) === "far") return "budget";
  if (failsAsk(opts.ask, o.amenities)) return "must-have";
  if (greatCircleKm(o.lat, o.lng, opts.centre.lat, opts.centre.lng) > opts.maxKm) return "too far";
  if (opts.skipNames.has(o.name.toLowerCase())) return "seen";
  if (opts.taken.has(o.name.toLowerCase())) return "duplicate";
  if (opts.fitBedrooms && o.beds != null && o.beds < opts.fitBedrooms - 1) return "too few bedrooms";
  // The one his eye caught. A stated number below the party is the wrong
  // house; silence still passes, because most listings say nothing.
  if (o.sleeps != null && o.sleeps < opts.party) return "sleeps too few";
  return null;
}

/**
 * The offers that earn a row, best first.
 * The wanted inventory ranks above the other, then score weighted by how many
 * people left one — a hotel with 3,000 reviews should not outrank a villa with
 * thirty just for being a hotel.
 */
export function pickOffers<T extends Offer>(offers: T[], opts: PickOpts): T[] {
  return offers
    .filter((o) => dropReason(o, opts) === null)
    .sort((a, b) =>
      (opts.preferred.has(norm(b.name)) ? 1 : 0) - (opts.preferred.has(norm(a.name)) ? 1 : 0)
      || (b.score ?? 0) * Math.log((b.reviews ?? 1) + 1) - (a.score ?? 0) * Math.log((a.reviews ?? 1) + 1))
    .slice(0, Math.max(0, opts.room));
}
