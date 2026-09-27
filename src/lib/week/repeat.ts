/**
 * Days grouped Monday to Sunday, for "Repeat on…" (27 Sep 2026). A two-week
 * summer camp on a journey that starts on a Thursday is ten weekdays across
 * three calendar weeks; each week gets a Mon–Fri shortcut, so a camp takes a
 * few taps instead of one Copy per day (about sixty taps before).
 */
export interface DayLike { id: string; date: string }
export interface WeekGroup<D extends DayLike> { monday: string; days: D[]; weekdays: D[] }

const mondayOf = (date: string): string => {
  const d = new Date(date + "T00:00:00Z");
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 86_400_000).toISOString().slice(0, 10);
};
const isWeekday = (date: string) => { const w = new Date(date + "T00:00:00Z").getUTCDay(); return w >= 1 && w <= 5; };

export function weeksOf<D extends DayLike>(days: D[]): WeekGroup<D>[] {
  const out: WeekGroup<D>[] = [];
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const m = mondayOf(d.date);
    let g = out[out.length - 1];
    if (!g || g.monday !== m) { g = { monday: m, days: [], weekdays: [] }; out.push(g); }
    g.days.push(d);
    if (isWeekday(d.date)) g.weekdays.push(d);
  }
  return out;
}
