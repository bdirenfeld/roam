/**
 * Where each screen of the week starts (27 Sep 2026, Brennan). A journey of
 * a week or less is one screen, whatever day it starts — a Friday-to-Monday
 * weekend must not split. Longer ones page Monday to Sunday, so a camp or a
 * school week sits on one screen instead of straddling two (weeks used to
 * start on the journey's first day: a Thursday on the Europe summer).
 */
export function weekStarts(dates: string[]): number[] {
  if (dates.length <= 7) return [0];
  const out: number[] = [0];
  dates.forEach((d, i) => {
    if (i > 0 && new Date(d + "T00:00:00Z").getUTCDay() === 1) out.push(i);
  });
  // A stub of one or two days at either end joins its neighbour (29 Sep
  // 2026): Japan starts on a Sunday, and its first screen was that Sunday
  // alone.
  if (out.length > 1 && out[1] <= 2) out.splice(1, 1);
  if (out.length > 1 && dates.length - out[out.length - 1] <= 2) out.pop();
  return out;
}

/** The screen a day is on: the last start at or before it. */
export function pageOf(starts: number[], dayIndex: number): number {
  let p = 0;
  starts.forEach((s, i) => { if (s <= dayIndex) p = i; });
  return p;
}
