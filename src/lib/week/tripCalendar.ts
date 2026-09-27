/**
 * The journey as month grids, Monday first, for "jump to a day" (27 Sep 2026).
 * A two-month summer was nine clicks of the week arrows from July to the last
 * week of August. Days outside the journey keep their place in the grid (so a
 * month reads like a calendar) but cannot be picked.
 */
export interface CalDay { date: string; dayId: string | null; planned: boolean; travel: boolean }
export interface CalMonth { key: string; label: string; weeks: (CalDay | null)[][] }

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * What kind of day each day is, from the journey's scheduled cards: a day that
 * moves you (a flight, a train, a check-in or check-out) is a travel day; any
 * other card makes it planned. The phone calendar marks both (27 Sep 2026) —
 * on a long journey the travel days are the ones you find your way by.
 */
export const TRAVEL_SUB_TYPES = new Set(["flight_arrival", "flight_departure", "transit", "hotel"]);

export function dayMarks(
  rows: { day_id: string | null; sub_type: string | null | undefined }[],
): { planned: Set<string>; travel: Set<string> } {
  const planned = new Set<string>(), travel = new Set<string>();
  for (const r of rows) {
    if (!r.day_id) continue;
    planned.add(r.day_id);
    if (r.sub_type && TRAVEL_SUB_TYPES.has(r.sub_type)) travel.add(r.day_id);
  }
  return { planned, travel };
}

export function monthGrids(
  days: { id: string; date: string }[],
  planned: Set<string> = new Set(),
  travel: Set<string> = new Set(),
): CalMonth[] {
  if (days.length === 0) return [];
  const byDate = new Map(days.map((d) => [d.date, d.id]));
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0].date, last = sorted[sorted.length - 1].date;
  const out: CalMonth[] = [];
  let y = +first.slice(0, 4), m = +first.slice(5, 7);
  const endKey = last.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const start = Date.UTC(y, m - 1, 1);
    const lead = (new Date(start).getUTCDay() + 6) % 7;
    const len = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells: (CalDay | null)[] = Array(lead).fill(null);
    for (let i = 0; i < len; i++) {
      const date = iso(start + i * DAY);
      const dayId = byDate.get(date) ?? null;
      cells.push({ date, dayId, planned: !!dayId && planned.has(dayId), travel: !!dayId && travel.has(dayId) });
    }
    while (cells.length % 7) cells.push(null);
    const weeks: (CalDay | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    const label = new Date(start).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    out.push({ key, label, weeks });
    if (key === endKey) break;
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
