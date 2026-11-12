/**
 * Travel on the Plan board as a thin strip (Brennan, 12 Nov 2026): a dashed
 * line and one line of text, "🚗 9:40am My Tuscan Kitchen · 55 min", instead
 * of a white card titled "Villa Zambaldi → My Tuscan Kitchen (Montefoscoli)".
 * The leave time comes first because that is the question he asks of the
 * board ("when do we leave the villa?"). Legs that run back to back (drive to
 * the station, then the train) read as ONE strip with one leave time; the
 * cards stay separate and a click lists both.
 */

/** Back-to-back means the next leg starts within this many minutes of the last one ending. */
export const JOIN_GAP_MIN = 15;

/** Words that make a stay's first word enough on its own: "Villa Zambaldi" → "Villa". */
const STAY_NOUNS = new Set(["villa", "casa", "cottage", "chalet", "cabin", "house", "apartment", "condo", "farmhouse", "agriturismo"]);

/** A stay's short name on a strip: its first word when that word says what it is, else the name. */
export function shortStay(title: string): string {
  const t = title.trim();
  const first = t.split(/\s+/)[0] ?? "";
  return STAY_NOUNS.has(first.toLowerCase()) ? first : t;
}

/**
 * Where a leg goes, short: the end of "A → B", without the bracketed detail
 * or anything after a comma ("Lucca (station car park)" → "Lucca",
 * "Florence (Santa Maria Novella)" → "Florence"). A leg that ends at one of
 * the trip's stays says the stay's short name ("Villa").
 */
export function stripDest(legTitle: string, stays: string[] = []): string {
  const parts = legTitle.split("→");
  const raw = (parts[parts.length - 1] ?? "").trim();
  const dest = raw.replace(/\s*\([^)]*\)/g, "").split(",")[0].replace(/\s+station$/i, "").trim() || raw;
  const stay = stays.find((s) => s.trim() && dest.toLowerCase() === s.trim().toLowerCase());
  return stay ? shortStay(stay) : dest;
}

/** "30 min", "1 h", "1 h 40". */
export function stripDuration(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r}` : `${h} h`;
}

export interface LegSpan { id: string; startMin: number; endMin: number | null }
export interface LegRun { lead: string; ids: string[]; startMin: number; endMin: number | null }

/**
 * Group a day's legs into runs: each leg joins the run before it when it
 * starts no earlier than 5 min before, and no later than JOIN_GAP_MIN after,
 * that run's end. A leg without an end time can't be joined onto. Input in
 * any order; runs come back by start time, legs inside a run in order.
 */
export function joinLegs(legs: LegSpan[]): LegRun[] {
  const sorted = [...legs].sort((a, b) => a.startMin - b.startMin);
  const runs: LegRun[] = [];
  for (const l of sorted) {
    const last = runs[runs.length - 1];
    if (last && last.endMin !== null && l.startMin >= last.endMin - 5 && l.startMin - last.endMin <= JOIN_GAP_MIN) {
      last.ids.push(l.id);
      last.endMin = l.endMin;
    } else {
      runs.push({ lead: l.id, ids: [l.id], startMin: l.startMin, endMin: l.endMin });
    }
  }
  return runs;
}
