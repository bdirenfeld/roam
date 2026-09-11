// ── Which rows actually make the list ─────────────────────────────────────
//
// Brennan, 11 Sept 2026: "I can't stress this enough, you need to test things
// and make them make sense before giving it to me."
//
// He is right, and this file is the answer to it. Every rule about which
// stays survive used to live inside a 500-line route handler, so the only
// thing a test could reach was a single rule at a time. Each one passed. The
// LIST was still wrong — five Osaka rows with no prices, a New York list with
// nothing in Manhattan — because no test ever looked at the finished list and
// asked whether it made sense.
//
// So the decision lives here, it takes the numbers a real run produces, and
// `shortlist.test.ts` feeds it the real ones off his own journeys.

import { tooFarFromBase, tooMuchDriving } from "./drive";

export interface Row {
  name: string;
  /** Drive minutes to this base's centre. Null when Google would not say. */
  toCentre: number | null;
  /** Weighted driving hours over the whole stay. */
  hours: number;
  /** He saved, chose or hearted it: his decision, not the search's. */
  kept?: boolean;
}

export interface ShortlistOpts {
  /** The radius the brief tells him to stay inside, in minutes. */
  radiusMin: number;
  /** Nights at this base. */
  nights: number;
}

export type Cut = "too far" | "too much driving";

/** Why a row was cut, or null when it stays. */
export function cutReason(row: Row, best: number, opts: ShortlistOpts): Cut | null {
  if (row.kept) return null;
  if (tooFarFromBase(row.toCentre, opts.radiusMin)) return "too far";
  if (tooMuchDriving(row.hours, best, opts.nights)) return "too much driving";
  return null;
}

/**
 * The rows that belong on the list, closest first.
 *
 * Never returns nothing: if every row is cut, the closest survives, because a
 * list of one with a warning beats an empty screen.
 */
export function shortlist<T extends Row>(rows: T[], opts: ShortlistOpts): T[] {
  if (!rows.length) return [];
  const best = Math.min(...rows.map((r) => r.hours).filter((h) => Number.isFinite(h)));
  const kept = rows.filter((r) => cutReason(r, best, opts) === null);
  const out = kept.length ? kept : rows.slice().sort((a, b) => a.hours - b.hours).slice(0, 1);
  return out.slice().sort((a, b) => a.hours - b.hours);
}
