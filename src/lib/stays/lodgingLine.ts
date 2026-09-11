// ── The Estimate's one accommodation line ─────────────────────────────────
// The Estimate is nine lines and every one is the same shape: a unit cost
// times a count. A journey with several places to sleep does NOT earn extra
// rows — it earns an honest unit cost and a line that shows the working
// (Brennan, 11 Sept 2026).
//
// Built for N, not two. Two months away could be six or eight stays, so
// nothing here assumes a Tokyo and an Osaka.
//
// The rate is blended across the stays actually chosen, weighted by nights:
// eight at $640 and five at $520 is $594, which times thirteen gives $7,720 —
// the real total. Before this the line showed whichever hotel was picked last
// and nothing explained the number.

export interface StayLeg {
  /** Where it is: "Tokyo". */
  label: string;
  /** Nights at this one. */
  nights: number;
  /** Per night, in home currency. Null when that stay has no price. */
  nightly: number | null;
}

/** How many legs are named before the line starts summarising. */
const NAMED = 3;

/** Only the legs that can carry a number, in trip order. */
function priced(legs: StayLeg[]): StayLeg[] {
  return legs.filter((l) => l.nightly != null && l.nightly > 0 && l.nights > 0);
}

/**
 * One nightly figure for the whole journey, weighted by nights.
 * Null when nothing is priced yet, so the Estimate keeps whatever it had.
 */
export function blendNightly(legs: StayLeg[]): number | null {
  const real = priced(legs);
  if (!real.length) return null;
  const nights = real.reduce((n, l) => n + l.nights, 0);
  if (nights <= 0) return null;
  const spend = real.reduce((s, l) => s + (l.nightly as number) * l.nights, 0);
  return Math.round(spend / nights);
}

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-CA");
}

/**
 * The line under the number, showing where it came from.
 *
 *   "Tokyo 8 × $640 + Osaka 5 × $520"
 *
 * Beyond three stays it stops listing and counts instead, because this sits on
 * one row of a nine-row screen. When some stays are still unchosen it says so,
 * since the rate is an average of the ones that are.
 */
export function accommodationBasis(legs: StayLeg[], totalLegs?: number): string | null {
  const real = priced(legs);
  if (!real.length) return null;

  const shown = real.slice(0, NAMED)
    .map((l) => `${l.label} ${l.nights} × ${money(l.nightly as number)}`)
    .join(" + ");
  const rest = real.length - NAMED;
  const body = rest > 0 ? `${shown} + ${rest} more` : shown;

  // "2 of 3 stays" — the rate is the average of what is chosen, and the
  // Estimate applies it to every night of the journey.
  const all = totalLegs ?? real.length;
  const partial = all > real.length ? ` · ${real.length} of ${all} stays` : "";
  return `${body}${partial}`;
}
