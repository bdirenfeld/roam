// ── Which dates to ask a price for ────────────────────────────────────────
// The journey's own dates, unless nobody will quote them.
//
// Two ways that happens, both found by running the search over every journey
// on 10 Sept 2026:
//   • The journey has been and gone. New York ran 23–26 July; the search came
//     back priceless and read as a fault. But "I'm going to New York, where
//     should I stay" is a fair question to ask of a finished journey.
//   • The journey is far out. Tokyo for April 2028 returned 18 hotels and no
//     prices; the same days in April 2027 returned 18 of 18.
//
// Either way the window moves by WHOLE YEARS, so the season holds — New York
// in July stays New York in July — and the sheet says which dates the prices
// are for.

export type PriceShift = "past" | "far" | "unopened" | null;
export interface PriceWindow { start: string; end: string; shifted: PriceShift }

/** Furthest ahead anyone quotes, near enough. */
export const PRICE_HORIZON_DAYS = 400;

function addYears(date: string, years: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

export function priceWindow(start: string, end: string, today: Date = new Date()): PriceWindow {
  const todayStr = today.toISOString().slice(0, 10);
  const horizon = new Date(today.getTime() + PRICE_HORIZON_DAYS * 86400000).toISOString().slice(0, 10);

  if (end < todayStr) {
    for (let y = 1; y <= 5; y++) {
      const s = addYears(start, y);
      const e = addYears(end, y);
      if (e >= todayStr) return { start: s, end: e, shifted: "past" };
    }
    return { start, end, shifted: null };
  }

  if (start > horizon) {
    for (let y = 1; y <= 5; y++) {
      const s = addYears(start, -y);
      const e = addYears(end, -y);
      if (s <= todayStr) break;          // any further back is in the past
      if (s <= horizon) return { start: s, end: e, shifted: "far" };
    }
    return { start, end, shifted: null };
  }

  return { start, end, shifted: null };
}

/**
 * Inside the horizon, but nobody is quoting: Tuscany for August 2027 came
 * back 0 of 5 priced in September 2026 because hosts had not opened that
 * calendar (audit, 15 Sept 2026). The same week a year earlier is the
 * closest anyone has a number for — worth showing as "typical", and saying
 * so. Null when a year back would already be in the past.
 */
export function unopenedWindow(start: string, end: string, today: Date = new Date()): PriceWindow | null {
  const todayStr = today.toISOString().slice(0, 10);
  const s = addYears(start, -1);
  const e = addYears(end, -1);
  if (s <= todayStr) return null;
  return { start: s, end: e, shifted: "unopened" };
}

/** When places came back but not one has a price, and there is no earlier week to fall back on. */
export function unopenedNote(tripStart: string): string {
  const d = new Date(tripStart + "T00:00:00Z");
  const month = d.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  return `Nobody is quoting ${month} ${d.getUTCFullYear()} yet. Check again nearer the date.`;
}

/** The sentence the sheet shows when the window moved. */
export function priceWindowNote(w: PriceWindow, tripStart: string): string | null {
  if (w.shifted === "unopened") return `Nobody is quoting ${tripStart.slice(0, 4)} yet; prices are the same week in ${w.start.slice(0, 4)}.`;
  if (w.shifted === "past") return `These dates have passed; prices are for the same days in ${w.start.slice(0, 4)}.`;
  if (w.shifted === "far") return `Priced for the same days in ${w.start.slice(0, 4)}, since ${tripStart.slice(0, 4)} is too far ahead.`;
  return null;
}
