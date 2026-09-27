/**
 * The part of a journey a forecast can cover (27 Sep 2026). Open-Meteo's
 * forecast runs 16 days ahead (and 92 back); asked for a range beyond that it
 * answers 400 — for the whole range. So a two-month summer got no weather at
 * all, not even on its first days once they were close, and every journey
 * months out logged "Open-Meteo responded 400" on each day it opened.
 * Returns null when no day of the journey can have a forecast yet.
 */
const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export function forecastWindow(start: string, end: string, today: string): { start: string; end: string } | null {
  const t = Date.parse(today + "T00:00:00Z");
  const lo = Math.max(Date.parse(start + "T00:00:00Z"), t - 92 * DAY);
  const hi = Math.min(Date.parse(end + "T00:00:00Z"), t + 15 * DAY);
  return lo > hi ? null : { start: iso(lo), end: iso(hi) };
}
