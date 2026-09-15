// ── The stays the journey already has ─────────────────────────────────────
//
// Two things the search used to get wrong about places he saved himself
// (audit, 15 Sept 2026):
//
//   • A stay already booked — check-in on day one, check-out on the last, on
//     five of nine journeys — came back as one more unpriced candidate, or was
//     pushed aside as "seen" by a later run. Montecito Inn and Villa Bottino
//     both ended up under "earlier" on journeys where they ARE the stay.
//   • His saved hotels filled the list before the search had a slot. Tokyo
//     had four saved rows, so the search could propose one place, forever,
//     and two of the four were Hakone and Izu ryokans two hours away.
//
// So: the booked stay is recognised and marked chosen, and saved places take
// at most two rows — the rest are still on the map, they just do not crowd
// out the five.

import { greatCircleKm } from "./brief";

export interface OwnStay {
  place_id: string;
  title: string;
  lat: number;
  lng: number;
  /** ISO dates of the days this place is scheduled on (status in_itinerary). */
  scheduledDays?: string[] | null;
}

/** How many of his own saved places may sit on the list. */
export const MAX_SAVED_ROWS = 2;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Which saved place is the stay the journey has actually booked — its
 * `place_id`, or null when nothing is booked.
 *
 * The journey's own accommodation name wins when it names one of them
 * ("Modern Casita, Playa Langosta" names "Modern Casita"). Otherwise the
 * stay-type place scheduled on the earliest day: Rome has two hotels on the
 * itinerary, days 1 and 3, and the first is the one the journey opens at.
 * A saved idea that merely holds a day_id is not on the itinerary and never
 * counts — Japan's 31 pins all hold day one.
 */
export function bookedStay(stays: OwnStay[], accommodationName: string | null | undefined): string | null {
  const scheduled = stays.filter((s) => s.scheduledDays && s.scheduledDays.length > 0);
  if (accommodationName) {
    const want = norm(accommodationName);
    const named = stays.find((s) => {
      const have = norm(s.title);
      return have.length > 0 && (want === have || want.startsWith(have + " ") || have.startsWith(want + " ") || want.includes(have));
    });
    if (named) return named.place_id;
  }
  if (!scheduled.length) return null;
  scheduled.sort((a, b) => {
    const da = [...(a.scheduledDays as string[])].sort()[0];
    const db = [...(b.scheduledDays as string[])].sort()[0];
    return da < db ? -1 : da > db ? 1 : a.title.localeCompare(b.title);
  });
  return scheduled[0].place_id;
}

export interface SavedRow {
  lat: number;
  lng: number;
  /** He said yes: booked, or chosen on an earlier run. Always on the list. */
  chosen?: boolean;
  /** He hearted it. Always on the list. */
  hearted?: boolean;
}

/**
 * The saved places that earn a row: everything chosen or hearted, then the
 * nearest to the base until `max` is reached. Chosen and hearted rows are
 * never dropped even when they alone exceed the cap — that was his decision,
 * not the search's.
 */
export function pickSaved<T extends SavedRow>(rows: T[], base: { lat: number; lng: number }, max: number = MAX_SAVED_ROWS): T[] {
  const must = rows.filter((r) => r.chosen || r.hearted);
  const rest = rows
    .filter((r) => !(r.chosen || r.hearted))
    .map((r) => ({ r, km: greatCircleKm(base.lat, base.lng, r.lat, r.lng) }))
    .sort((a, b) => a.km - b.km)
    .map((x) => x.r);
  return [...must, ...rest.slice(0, Math.max(0, max - must.length))];
}

/**
 * Whether a saved place typed "hotel" is obviously NOT somewhere to sleep.
 * Holiday Pet Care — Finn's kennel — sat on the Last Week of Summer list as
 * row C because the type said hotel (audit, 15 Sept 2026). Precision over
 * recall: a villa can be called anything ("La Magnolia"), so only the plain
 * non-stays are turned away, by Google's own types when the row carries
 * them and by the name otherwise.
 */
const NOT_A_STAY_TYPES = new Set(["pet_store", "veterinary_care", "parking", "storage", "airport", "train_station", "bus_station", "transit_station", "car_rental", "gym", "school", "hospital"]);
const NOT_A_STAY_WORDS = /\b(pet|kennel|dog|cat|boarding|daycare|vet|veterinary|clinic|parking|storage|airport|station|car rental|gym|school|hospital|dentist)\b/i;

export function isNotAStay(title: string, types?: string[] | null): boolean {
  if (types?.some((t) => NOT_A_STAY_TYPES.has(t))) return true;
  if (types?.includes("lodging")) return false;
  return NOT_A_STAY_WORDS.test(title);
}
