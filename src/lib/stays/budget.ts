// ── What the journey can afford a night ───────────────────────────────────
// Brennan, 10 Sept 2026: "Do you want to factor in a budget there too, just so
// you don't keep recommending things that are crazy outside the budget?"
//
// No new question, because the number already exists: the Estimate screen's
// `nightlyRate`, seeded from the party size and editable by him, and already
// written back when he chooses a stay. A journey with no Estimate row, or a
// rate still at zero, simply has no ceiling and nothing here applies.

/** Flagged above this multiple of the Estimate's nightly rate. */
export const OVER = 1.25;
/** Dropped above this one: too far out to be worth a row. */
export const FAR_OVER = 2;

export type BudgetVerdict = "within" | "over" | "far";

/** A usable ceiling, or null when the journey has not set one. */
export function nightlyCeiling(rate: unknown): number | null {
  return typeof rate === "number" && rate > 0 ? rate : null;
}

/** The nightly this candidate works out at, from whichever figure exists. */
export function nightlyOf(nightly: number | null, total: number | null, nights: number): number | null {
  if (nightly != null && nightly > 0) return nightly;
  if (total != null && total > 0 && nights > 0) return total / nights;
  return null;
}

/** Where this one sits. Null when either number is missing — never a guess. */
export function budgetVerdict(nightly: number | null, ceiling: number | null): BudgetVerdict | null {
  if (nightly == null || ceiling == null) return null;
  if (nightly > ceiling * FAR_OVER) return "far";
  if (nightly > ceiling * OVER) return "over";
  return "within";
}

/**
 * The flag on the row. It names his own number rather than saying "over
 * budget", so the figure it is judged against is never a mystery.
 */
export function budgetFlag(nightly: number | null, ceiling: number | null): string | null {
  const v = budgetVerdict(nightly, ceiling);
  if (v !== "over" && v !== "far") return null;
  return `Over your Estimate ($${Math.round(ceiling as number).toLocaleString("en-CA")} a night)`;
}
