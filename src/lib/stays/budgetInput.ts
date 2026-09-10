// ── The budget, typed on the search itself ────────────────────────────────
// Brennan, 10 Sept 2026: "I don't think people are going to start from the
// budget menu and realize that the search ties to that."
//
// He is right: the ceiling lives on the Estimate screen and nothing on the
// stay search says so, which is how "Over your $480 a night" became a mystery.
// So the number moves onto the search — but as ONE field, seeded from the
// Estimate and written back to it. Two boxes, a nightly and a total, would
// only be somewhere for the two to disagree; they are the same number divided
// by the nights, so the total is shown as a hint rather than typed.
//
// The field still takes either, because people think in both: "480" is a
// night, "9000 total" is the week.

export interface ParsedBudget {
  /** What the ceiling works out at per night, or null when nothing usable was typed. */
  nightly: number | null;
  /** True when they gave a whole-stay figure and this was divided down. */
  fromTotal: boolean;
}

const TOTAL_WORDS = /\b(total|all ?in|altogether|for the (whole )?(trip|stay|week|month)|in total|overall)\b/i;
const NIGHT_WORDS = /\b(a|per|each)?\s*(night|nightly|evening)\b|\/\s*(night|n)\b/i;

/**
 * Read whatever they typed. A bare number is a nightly rate, because that is
 * the field's own label; "total" (and its synonyms) switches to the whole stay.
 */
export function parseBudget(text: string | null | undefined, nights: number): ParsedBudget {
  if (!text) return { nightly: null, fromTotal: false };
  // First number in the line, commas and a currency symbol allowed.
  const m = /(\d[\d,]*(?:\.\d+)?)/.exec(text.replace(/\s/g, ""));
  if (!m) return { nightly: null, fromTotal: false };
  const value = Number(m[1].replace(/,/g, ""));
  if (!isFinite(value) || value <= 0) return { nightly: null, fromTotal: false };

  const saysTotal = TOTAL_WORDS.test(text);
  const saysNight = NIGHT_WORDS.test(text);
  if (saysTotal && !saysNight && nights > 0) {
    return { nightly: Math.round(value / nights), fromTotal: true };
  }
  return { nightly: Math.round(value), fromTotal: false };
}

/** The hint under the field, so the whole-stay number is never a separate box. */
export function budgetHint(nightly: number | null, nights: number): string | null {
  if (nightly == null || nightly <= 0 || nights <= 0) return null;
  const total = nightly * nights;
  return `about $${total.toLocaleString("en-CA")} for ${nights} ${nights === 1 ? "night" : "nights"}`;
}

/** What to put in the field when it is first shown: the Estimate's own number. */
export function budgetFieldValue(nightlyRate: number | null | undefined): string {
  return typeof nightlyRate === "number" && nightlyRate > 0 ? String(Math.round(nightlyRate)) : "";
}
