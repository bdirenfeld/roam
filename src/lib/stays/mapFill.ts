// ── When to pad the list with places off the map ──────────────────────────
// A row that came from Google's map data can never carry a price. That is
// fine when a booking search returns nothing at all — Tuscany's villas are
// only on the map, and five unpriced villas beat an empty screen.
//
// It is NOT fine as padding. Brennan, 11 Sept 2026: "none of the Osaka places
// have a price." Osaka had been searched three times; each run set the last
// five aside, the priced offers ran out, and the list was topped up from the
// map until four of five rows had no price. He was looking at the dregs and
// nothing said so.
//
// So: the map fills an empty list, never a thin one. Three priced hotels are
// a better answer than three priced hotels and two that cannot be booked.

export interface FillDecision {
  /** How many map rows to add. */
  take: number;
  /** True when the list is short because the area is used up, not because it failed. */
  exhausted: boolean;
}

export function mapFill(opts: {
  /** Rows already on the list. */
  have: number;
  /** How many of those carry a price. */
  priced: number;
  /** Map rows available to add. */
  available: number;
  /** Rows the list wants. */
  want: number;
}): FillDecision {
  const room = Math.max(0, opts.want - opts.have);
  if (room === 0) return { take: 0, exhausted: false };

  // Nothing bookable came back: the map is all there is, so use it.
  if (opts.priced === 0) return { take: Math.min(room, opts.available), exhausted: false };

  // Something bookable did. Padding the rest with rows that can never have a
  // price makes a short answer look like a full one.
  return { take: 0, exhausted: true };
}

/** What to tell him when the area is used up rather than broken. */
export function exhaustedNote(place: string, priced: number, earlier: number): string {
  const seen = earlier > 0 ? ` The ${earlier} you have already seen are under “${earlier} earlier”.` : "";
  return priced === 0
    ? `Nothing new around ${place} this time.${seen}`
    : `${priced} left around ${place} that anyone is quoting.${seen}`;
}
