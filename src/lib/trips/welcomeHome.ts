/**
 * "Welcome home" (7 Oct 2026, delight audit): the first time the organiser
 * opens a journey on the phone in the 14 days after it ends, a small card in
 * the "Your trip's started" spot adds the trip up — "4 days, 14 places, 3 you
 * loved ♥". The ✕ closes it for good on that phone (localStorage, per trip).
 *
 *   welcomeHomeOpen  — today is 1 to 14 days after the end date
 *   welcomeHomeLine  — "{N} days, {P} places, {L} you loved"; the loved part
 *                      is left out at 0, "1 day" / "1 place" are singular
 *
 * Dates are calendar days ("YYYY-MM-DD") counted as UTC dates, never local
 * midnights (see lib/trips/countdown.ts). `todayISO` must be the reader's
 * LOCAL date worked out in the browser (lib/isSameLocalDay `localDate`).
 */

const DAY_MS = 86_400_000;
export const WELCOME_HOME_DAYS = 14;

function dayNumber(iso: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS) : null;
}

/** The localStorage key that remembers the ✕ for this journey on this phone. */
export function welcomeHomeKey(tripId: string): string {
  return `roam_welcome_home_${tripId}`;
}

/** Is today inside the 14 days after the journey's last day (end day itself excluded)? */
export function welcomeHomeOpen(end: string | null | undefined, todayISO: string): boolean {
  const e = dayNumber(end), t = dayNumber(todayISO);
  if (e === null || t === null) return false;
  const after = t - e;
  return after >= 1 && after <= WELCOME_HOME_DAYS;
}

export type WelcomeCard = { day_id: string | null; place: { id: string; loved?: boolean | null } | null };

/** The card's line, or null when the dates can't say how long the trip was. */
export function welcomeHomeLine(
  start: string | null | undefined,
  end: string | null | undefined,
  cards: WelcomeCard[],
): string | null {
  const s = dayNumber(start), e = dayNumber(end);
  if (s === null || e === null || e < s) return null;
  const n = e - s + 1;
  // Distinct places on the days (an unscheduled idea is not a place you went).
  const places = new Map<string, boolean>();
  for (const c of cards) {
    if (!c.day_id || !c.place?.id) continue;
    places.set(c.place.id, places.get(c.place.id) || c.place.loved === true);
  }
  const p = places.size;
  const l = Array.from(places.values()).filter(Boolean).length;
  const line = `${n} ${n === 1 ? "day" : "days"}, ${p} ${p === 1 ? "place" : "places"}`;
  return l > 0 ? `${line}, ${l} you loved` : line;
}
