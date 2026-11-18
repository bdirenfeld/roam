/**
 * Time in the air, shaded on the week (18 Nov 2026, Brennan, mock approved:
 * "similar to what we did for the ports on cruises"). A pale grey band from
 * takeoff to landing, across midnight, labelled "In the air · to Pisa"; the
 * label opens the flight's card.
 *
 * Flights are stored two ways (every journey checked, 18 Nov 2026):
 *  - one card, start = takeoff, end = landing (Rome AC890 19:45 → 10:20 the
 *    next morning; an end before the start is the next day), and
 *  - a takeoff card with no end, then a landing card for the airport it names
 *    (Tuscany's placeholders: YYZ 7 pm, then Pisa 11:30 the next day).
 * Only a card that names both airports counts (details.origin_airport and
 * details.arriving_at), so "Land in Sydney 7:00–9:30", time AT the airport,
 * gets nothing. Each city's own clock is used, as the cards are entered.
 */

type Day = { id: string; date: string };
export type FlightCard = {
  id: string; day_id: string | null; status?: string | null; start_time: string | null; end_time: string | null;
  details?: unknown; place?: { title?: string | null; sub_type?: string | null } | null;
};
export interface FlightSpan<C> { start: number; end: number; card: C; to: string }

const DAY_MS = 86_400_000;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const airports = (c: FlightCard) => {
  const d = (c.details ?? {}) as { origin_airport?: unknown; arriving_at?: unknown };
  return typeof d.origin_airport === "string" && typeof d.arriving_at === "string" && d.origin_airport.trim() && d.arriving_at.trim()
    ? { from: d.origin_airport.trim(), to: d.arriving_at.trim() } : null;
};
/** "PSA", "Roma Fiumicino Airport (FCO)", "Toronto Pearson (YYZ)" → the code, or null. */
const codeOf = (s: string) => (s.match(/\(([A-Z]{3})\)/)?.[1] ?? (/^[A-Z]{3}$/.test(s) ? s : null));

/** Where a flight is going, said plainly: "Pisa", "Roma Fiumicino", "Toronto Pearson", or the code. */
export function placeName(s: string): string {
  const t = s.replace(/\([A-Z]{3}\)/g, "").replace(/\b(international|int\.?)\b/gi, "").replace(/\bairport\b/gi, "").replace(/\s+/g, " ").replace(/[\s,–-]+$/, "").trim();
  return t || s.trim();
}

/** Minutes from the first day of the journey: a card's moment on one clock. */
function momentOf(dayNum: Map<string, number>, c: FlightCard, time: string): number | null {
  const n = c.day_id ? dayNum.get(c.day_id) : undefined;
  return n === undefined ? null : n * 1440 + toMin(time);
}

/** Every flight's time in the air, as moments, with the card the label opens and where it lands. */
export function flightsInAir<C extends FlightCard>(days: Day[], cards: C[]): FlightSpan<C>[] {
  const first = Math.min(...days.map((d) => Date.parse(d.date + "T00:00:00Z")));
  const dayNum = new Map(days.map((d) => [d.id, Math.round((Date.parse(d.date + "T00:00:00Z") - first) / DAY_MS)]));
  const live = cards.filter((c) => c.status !== "cut" && c.start_time && airports(c));
  const out: FlightSpan<C>[] = [];
  const landingCards = new Set<string>();
  // The two-card flight: a takeoff with no end, landed by the next card at the airport it names (within two days).
  for (const c of live) {
    if (c.end_time) continue;
    const a = airports(c)!, start = momentOf(dayNum, c, c.start_time!);
    if (start === null) continue;
    const want = codeOf(a.to) ?? a.to.toLowerCase();
    const landing = live
      .filter((x) => x.id !== c.id)
      .map((x) => ({ x, at: momentOf(dayNum, x, x.start_time!) }))
      .filter(({ x, at }) => at !== null && at > start && at - start <= 2 * 1440 && (codeOf(airports(x)!.to) ?? airports(x)!.to.toLowerCase()) === want)
      .sort((p, q) => p.at! - q.at!)[0];
    if (!landing) continue;
    landingCards.add(landing.x.id);
    out.push({ start, end: landing.at!, card: c, to: placeName(landing.x.place?.title || a.to) });
  }
  // The one-card flight: start to end; an end before the start lands the next day.
  for (const c of live) {
    if (!c.end_time || landingCards.has(c.id)) continue;
    const start = momentOf(dayNum, c, c.start_time!);
    if (start === null) continue;
    let end = start - toMin(c.start_time!) + toMin(c.end_time);
    if (end <= start) end += 1440;
    out.push({ start, end, card: c, to: placeName(airports(c)!.to) });
  }
  // A flight entered twice (a departure and an arrival card with the same times) shades once.
  const seen = new Set<string>();
  return out.filter((f) => { const k = `${f.start}-${f.end}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((p, q) => p.start - q.start);
}

/**
 * The bands for each day, clipped to the grid's hours: [from, to) minutes of
 * that day, whether it is long enough to carry a label (2 h, as the ship's),
 * whether the band starts that day at takeoff, the card, and where it lands.
 */
export function flightBands<C extends FlightCard>(days: Day[], cards: C[], hourStart: number, hourEnd: number): Map<string, { from: number; to: number; label: boolean; takeoff: boolean; card: C; dest: string }[]> {
  const out = new Map<string, { from: number; to: number; label: boolean; takeoff: boolean; card: C; dest: string }[]>();
  if (!days.length) return out;
  const first = Math.min(...days.map((d) => Date.parse(d.date + "T00:00:00Z")));
  const byNum = new Map(days.map((d) => [Math.round((Date.parse(d.date + "T00:00:00Z") - first) / DAY_MS), d.id]));
  for (const f of flightsInAir(days, cards)) {
    for (let n = Math.floor(f.start / 1440); n <= Math.floor((f.end - 1) / 1440); n++) {
      const id = byNum.get(n);
      if (!id) continue;
      const s = Math.max(f.start, n * 1440) - n * 1440, e = Math.min(f.end, (n + 1) * 1440) - n * 1440;
      const s2 = Math.max(s, hourStart * 60), e2 = Math.min(e, (hourEnd + 1) * 60);
      if (e2 <= s2) continue;
      const list = out.get(id) ?? [];
      list.push({ from: s2, to: e2, label: e2 - s2 >= 120, takeoff: n * 1440 + s === f.start, card: f.card, dest: f.to });
      out.set(id, list);
    }
  }
  return out;
}
