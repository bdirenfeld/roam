/**
 * Which nights each hotel covers (1 Oct 2026). Sandra, a tester, put her
 * Fort Lauderdale hotel on four days one at a time, because nothing said a
 * hotel carries on past the day it sits on. Brennan: a stay should read like
 * an all-day event in Outlook, "this is the hotel you're staying at and it
 * automatically covers all of those days".
 *
 * The journeys store a stay four different ways, so this reads all of them:
 *   - details.check_out (New York), check_out_date (Santa Barbara) or
 *     end_date (Rome, a year off) on the check-in card;
 *   - a second card of the same hotel titled "Check out…" (Tuscany, Costa Rica);
 *   - the same hotel on several days running (Sandra);
 *   - nothing at all: the stay runs to the next hotel, or to the journey's end.
 *
 * A stay's nights run from check-in to the morning of check-out: a run of
 * 24 Aug → 4 Sep covers the nights of 24 Aug to 3 Sep, eleven of them.
 */

import { timeFirst } from "@/lib/agendaOrder";

export interface StayCard {
  id: string;
  place_id: string | null;
  status?: string | null;
  start_time?: string | null;
  details?: Record<string, unknown> | null;
  place?: { sub_type?: string | null; title?: string | null } | null;
}

export interface StayDay { date: string; cards: StayCard[] }

export interface StayRun {
  /** The check-in card: the one a tap on the band opens. */
  cardId: string;
  placeId: string;
  title: string;
  checkIn: string;
  checkOut: string;
  nights: number;
}

const DAY = 86_400_000;
const toMs = (iso: string) => Date.parse(iso + "T12:00:00Z");
export const addDays = (iso: string, n: number) => new Date(toMs(iso) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A hotel booked onto a day. Saved ideas keep a stale day_id (Japan's three
 * ryokans all sit on day one as "interested"), and a cut card is gone.
 */
export function isHotel(c: StayCard): boolean {
  return !!c.place_id && c.place?.sub_type === "hotel" && c.status !== "interested" && c.status !== "cut";
}

/**
 * A check-out written on the card, if it makes sense after this check-in.
 * Rome's was saved a year early ("2025-04-28" for an April 2026 stay), so a
 * date that is not after check-in is tried again in check-in's year.
 */
export function writtenCheckOut(details: Record<string, unknown> | null | undefined, checkIn: string): string | null {
  const d = details ?? {};
  for (const key of ["check_out", "check_out_date", "end_date"]) {
    const v = d[key];
    if (typeof v !== "string" || !ISO.test(v)) continue;
    const tries = [v, checkIn.slice(0, 4) + v.slice(4)];
    for (const t of tries) {
      const n = daysBetween(checkIn, t);
      if (n >= 1 && n <= 90) return t;
    }
  }
  return null;
}

/** A day's booked hotels in the day's own order (lib/agendaOrder): timed by the clock, untimed after. */
function hotelsInOrder(d: StayDay): StayCard[] {
  return timeFirst(d.cards.filter(isHotel).map((c) => ({ start_time: c.start_time ?? null, end_time: null, details: c.details ?? null, place: { sub_type: c.place?.sub_type ?? null }, card: c }))).map((x) => x.card);
}

function looksLikeCheckOut(c: StayCard): boolean {
  const title = (c.details as { title?: unknown } | null)?.title;
  return typeof title === "string" && /check.?out|leave the villa|leave for the airport/i.test(title);
}

/**
 * The stays of a journey, in order. `tripEnd` is the journey's last day; a
 * stay with nothing else to go on checks out that morning.
 */
export function stayRuns(days: StayDay[], tripEnd: string): StayRun[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  // Every hotel card on a day, in day order then time order.
  const hits: { date: string; card: StayCard }[] = [];
  for (const d of sorted) for (const card of hotelsInOrder(d)) hits.push({ date: d.date, card });

  // Group into runs: the same hotel again, with no other hotel checked into
  // in between, belongs to the same stay.
  type Draft = { first: { date: string; card: StayCard }; later: { date: string; card: StayCard }[] };
  const drafts: Draft[] = [];
  for (const h of hits) {
    const last = drafts[drafts.length - 1];
    if (last && last.first.card.place_id === h.card.place_id) {
      // A duplicate on the check-in day itself adds nothing.
      if (h.date !== last.first.date) last.later.push(h);
      continue;
    }
    drafts.push({ first: h, later: [] });
  }

  const runs: StayRun[] = [];
  drafts.forEach((dr, i) => {
    const checkIn = dr.first.date;
    const next = drafts[i + 1]?.first.date ?? null;
    let checkOut = writtenCheckOut(dr.first.card.details, checkIn);
    if (!checkOut && dr.later.length) {
      const lastHit = dr.later[dr.later.length - 1];
      const nightly = dr.later.every((h, k) => daysBetween(k === 0 ? checkIn : dr.later[k - 1].date, h.date) === 1);
      // Sandra's four nights in a row check out the morning after the last;
      // a "Check out…" card, or one far later, is the check-out day itself.
      checkOut = nightly && !looksLikeCheckOut(lastHit.card) ? addDays(lastHit.date, 1) : lastHit.date;
    }
    if (!checkOut) checkOut = next ?? tripEnd;
    // Never past the next hotel's check-in, never before the morning after.
    if (next && checkOut > next) checkOut = next;
    if (checkOut <= checkIn) checkOut = addDays(checkIn, 1);
    runs.push({
      cardId: dr.first.card.id,
      placeId: dr.first.card.place_id as string,
      title: dr.first.card.place?.title ?? "Hotel",
      checkIn,
      checkOut,
      nights: daysBetween(checkIn, checkOut),
    });
  });
  return runs;
}

/**
 * The stay to show on a day: the hotel checked into that day, else the one
 * whose nights include it, else the one checked out of that morning.
 */
export function stayOn(runs: StayRun[], date: string): StayRun | null {
  return runs.find((r) => r.checkIn === date)
    ?? runs.find((r) => r.checkIn < date && date < r.checkOut)
    ?? runs.find((r) => r.checkOut === date)
    ?? null;
}
