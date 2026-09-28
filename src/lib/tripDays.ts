/**
 * What changing a journey's dates does to its days (27 Sep 2026).
 *
 * Days used to be re-dated by position: day 1 took the new first date, day 2
 * the next. Right for moving a trip to other dates, wrong for changing its
 * edges — moving Nashville's start from the 16th to the 15th slid every plan
 * back a day (Friday's dinner onto Thursday, Sunday's flight home onto
 * Saturday) and left the last two days empty.
 *
 * Overlapping ranges keep every day on its date: days outside the new range
 * go, new dates are added, and the numbers follow the dates. A range that does
 * not touch the old one is a move: days keep their order and take the new
 * dates in turn.
 */
export interface DayRow { id: string; date: string }
export interface DayChanges {
  update: { id: string; date: string; day_number: number }[];
  insert: { date: string; day_number: number }[];
  remove: string[];
}

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const t0 = (d: string) => Date.parse(d + "T00:00:00Z");

export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = t0(start); t <= t0(end); t += DAY) out.push(iso(t));
  return out;
}

export function planDayChanges(days: DayRow[], start: string, end: string): DayChanges {
  const want = datesBetween(start, end);
  const old = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const overlaps = old.some((d) => d.date >= start && d.date <= end);
  const out: DayChanges = { update: [], insert: [], remove: [] };
  if (overlaps || old.length === 0) {
    const byDate = new Map(old.map((d) => [d.date, d]));
    want.forEach((date, i) => {
      const d = byDate.get(date);
      if (d) out.update.push({ id: d.id, date, day_number: i + 1 });
      else out.insert.push({ date, day_number: i + 1 });
    });
    out.remove = old.filter((d) => d.date < start || d.date > end).map((d) => d.id);
  } else {
    want.forEach((date, i) => {
      const d = old[i];
      if (d) out.update.push({ id: d.id, date, day_number: i + 1 });
      else out.insert.push({ date, day_number: i + 1 });
    });
    out.remove = old.slice(want.length).map((d) => d.id);
  }
  return out;
}

/**
 * Where the plans on a dropped day go when a journey is shortened (27 Sep
 * 2026): the nearest day that stays — the new first day for days cut off the
 * front, the new last day for days cut off the end. It used to refuse and
 * send the person off to move every plan by hand first.
 */
export function rehomeDays(removed: DayRow[], kept: DayRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (kept.length === 0) return out;
  const sorted = [...kept].sort((a, b) => a.date.localeCompare(b.date));
  for (const r of removed) {
    let best = sorted[0];
    for (const k of sorted) {
      if (Math.abs(t0(k.date) - t0(r.date)) < Math.abs(t0(best.date) - t0(r.date))) best = k;
    }
    out[r.id] = best.id;
  }
  return out;
}
