/**
 * "Plan my trip" end to end, minus the writing (28 Sep 2026): a journey's
 * saved places and its days in, the draft cards to insert out. Composes the
 * three tested steps — day groups (./dayGroups), groups onto days
 * (./draftTrip) and times within a day (lib/week/dayPlan) — so both screens
 * that offer the button (the week's map, the phone Map) make the same draft.
 *
 * What it writes are ordinary scheduled cards — no draft stage, nothing to
 * confirm (29 Sep 2026, Brennan: pressing Plan my trip plans the trip). Each
 * carries `ai_generated` and `details.plan` = where it was put, so "Remove
 * what Plan my trip added" can take off the cards still where it put them
 * and leave any the person has moved. The saved card stays, as it does for
 * every scheduled copy. Nothing already on a day is touched.
 */

import type { Card, Day } from "@/types/database";
import { groupPins, km, type Grouping, type Pin } from "./dayGroups";
import { placeGroups, regionLabel, freeDays, type DraftDay } from "./draftTrip";
import { planBatch, stayAnchor, type DayEdge } from "@/lib/week/dayPlan";
import { cardTimes } from "@/lib/cardTime";
import { toMin, toTime } from "@/lib/week/layout";
import { dayShare } from "./dayGroups";
import { hoursWindow, assumedWindow, retimeDay, sightMinutes, type RetimeItem } from "./retime";
import { isAirport, dayBounds, freeWithin, boundBlocks } from "./airports";

/** Where Plan my trip put a card; absent on everything else. */
export interface PlanMark { day: string; start: string | null }
export const planMark = (c: { details?: unknown }): PlanMark | null => {
  const m = (c.details as Record<string, unknown> | null | undefined)?.plan as PlanMark | undefined;
  return m && typeof m.day === "string" ? m : null;
};
/** A card Plan my trip added that is still where it put it (not moved, not re-timed). */
export const untouchedPlan = (c: { details?: unknown; day_id?: string | null; start_time?: string | null }): boolean => {
  const m = planMark(c);
  return !!m && m.day === c.day_id && (m.start ?? null) === (c.start_time ?? null);
};

/** Monday-first "1"/"0" from Google's weekday_text; null when unknown. */
export function openFromHours(hours: unknown): string | null {
  const text = (hours as { weekday_text?: unknown } | null)?.weekday_text;
  if (!Array.isArray(text) || text.length !== 7) return null;
  return text.map((t) => (typeof t === "string" && /closed/i.test(t) ? "0" : "1")).join("");
}

const FLIGHT = new Set(["flight_arrival", "flight_departure"]);
/** A bar on a trip with children starts no earlier than nine. */
export const LATE_BAR = 21 * 60;

/**
 * How much of each day is free: a planned sight takes it; a flight leaves
 * half; so do the first and last days, which are travel days whether or not
 * a flight is saved — Japan has none, and its first draft put a full day at
 * DisneySea on the day they land (29 Sep 2026).
 */
export function draftDays(days: Pick<Day, "id" | "date" | "day_number">[], scheduled: Card[]): DraftDay[] {
  const ordered = [...days].sort((a, b) => a.day_number - b.day_number);
  return ordered.map((d, i) => {
    const on = scheduled.filter((c) => c.day_id === d.id);
    const taken = on.some((c) => c.place?.type === "activity" || (!c.place && !!cardTimes(c).start));
    // An airport counts as a flight however it was saved (./airports).
    const flight = on.some((c) => FLIGHT.has(c.place?.sub_type ?? "") || isAirport(c));
    const edge = ordered.length > 2 && (i === 0 || i === ordered.length - 1);
    const free = taken ? 0 : flight || edge ? 0.5 : 1;
    // A morning departure or an afternoon landing leaves nothing to plan.
    return { id: d.id, date: d.date, free: freeWithin(dayBounds(on, { first: i === 0, last: i === ordered.length - 1 }), free) };
  });
}

/** The saved places not yet on any day, as pins (id = the saved card's id). */
export function pinsToPlan(cards: Card[]): Pin[] {
  const onADay = new Set(cards.filter((c) => c.status === "in_itinerary" && c.place_id).map((c) => c.place_id as string));
  const seen = new Set<string>();
  const out: Pin[] = [];
  for (const c of cards) {
    if (c.status !== "interested" || !c.place || !c.place_id || onADay.has(c.place_id) || seen.has(c.place_id)) continue;
    seen.add(c.place_id);
    const pl = c.place as unknown as { types?: unknown; details?: { types?: unknown } };
    const types = pl.types ?? pl.details?.types;
    out.push({
      id: c.id, title: c.place.title, type: c.place.type, subType: c.place.sub_type,
      lat: c.place.lat, lng: c.place.lng, address: c.place.address,
      open: openFromHours((c.place as unknown as { hours?: unknown }).hours),
      types: Array.isArray(types) ? (types as string[]) : null,
    });
  }
  return out;
}

export interface DraftRow {
  day_id: string; trip_id: string; place_id: string; status: "in_itinerary"; position: number;
  start_time: string | null; end_time: string | null; source_url: null;
  details: { plan: PlanMark }; ai_generated: true; confirmed: false;
}

export interface RegionChoice { id: number; label: string; days: number; places: number }

export interface DraftPreview {
  grouping: Grouping;
  /** Days free on the journey for a draft. */
  free: number;
  regions: RegionChoice[];
  /** Regions ticked to start with: all of them when they fit, else the biggest that do. */
  suggested: number[];
}

/**
 * Days as full as they need to be, and no fuller. Places are grouped into
 * full days first; when that leaves more free days than a rest day a week,
 * they are grouped again, lighter, as long as they still fit. Rome with
 * nine sights and seven days came out as three packed days and four empty
 * ones (29 Sep 2026); a person spreads them. A trip with more places than
 * days (Japan) never gets here.
 */
export function spreadGroups(pins: Pin[], kids: boolean, free: number): Grouping {
  let grouping = groupPins(pins, { kids });
  const room = Math.floor(free) - Math.floor(free / 7);
  for (const loadCap of [0.75, 0.5]) {
    if (grouping.daysNeeded >= room) break;
    const lighter = groupPins(pins, { kids, loadCap });
    if (lighter.daysNeeded > room) break;
    grouping = lighter;
  }
  return grouping;
}

export function previewDraft(cards: Card[], days: Pick<Day, "id" | "date" | "day_number">[], kids: boolean): DraftPreview {
  const pins = pinsToPlan(cards);
  const scheduled = cards.filter((c) => c.status === "in_itinerary" && c.day_id);
  const free = freeDays(draftDays(days, scheduled));
  const grouping = spreadGroups(pins, kids, free);
  const regions = grouping.regions.filter((r) => r.days > 0).map((r) => {
    const mine = grouping.groups.filter((g) => g.region === r.id).flatMap((g) => g.items);
    return { id: r.id, label: regionLabel(mine) ?? mine[0]?.title ?? "Somewhere", days: r.days, places: r.pins };
  });
  // What to tick: the region with the most days first, then, while they
  // fit, the region with the most places for how far it is from what is
  // already ticked (half a day per move). "Biggest first" alone ticked
  // Yakushima, an island a flight away, ahead of the places beside Tokyo.
  const centre = new Map(grouping.regions.map((r) => [r.id, r.centre]));
  const suggested: number[] = [];
  let used = 0;
  const left = [...regions];
  while (left.length) {
    const score = (r: RegionChoice) => {
      if (!suggested.length) return r.days * 1000 + r.places;
      const d = Math.min(...suggested.map((id) => km(centre.get(id)!, centre.get(r.id)!)));
      return r.places / (1 + d / 300);
    };
    left.sort((a, b) => score(b) - score(a));
    const i = left.findIndex((r) => used + r.days + (suggested.length ? 0.5 : 0) <= free);
    if (i < 0) break;
    const [r] = left.splice(i, 1);
    used += r.days + (suggested.length ? 0.5 : 0);
    suggested.push(r.id);
  }
  // No area fits whole (New York test, 29 Sep 2026: 13 places, one city,
  // three free days): plan the biggest area as far as the days go and leave
  // the rest saved. Ticking nothing planned nothing, and said nothing.
  if (!suggested.length && regions.length) suggested.push([...regions].sort((a, b) => b.days - a.days || b.places - a.places)[0].id);
  return { grouping, free, regions, suggested };
}


export function buildDraft(
  tripId: string,
  cards: Card[],
  days: Pick<Day, "id" | "date" | "day_number">[],
  opts: { kids: boolean; regions?: number[] },
): { rows: DraftRow[]; dayIds: string[]; leftOut: number } {
  const { grouping } = previewDraft(cards, days, opts.kids);
  const scheduled = cards.filter((c) => c.status === "in_itinerary" && c.day_id);
  const dd = draftDays(days, scheduled);
  const dayIds = dd.map((d) => d.id);
  const hotel = scheduled.find((c) => (c.place?.sub_type === "hotel" || c.place?.sub_type === "accommodation") && c.place.lat != null);
  const flight = scheduled.find((c) => FLIGHT.has(c.place?.sub_type ?? "") && c.place?.lat != null);
  const startCard = hotel ?? flight;
  const start = startCard ? { lat: startCard.place!.lat!, lng: startCard.place!.lng! } : null;
  const { placed, unplaced } = placeGroups(grouping, dd, { regions: opts.regions, start });

  const byId = new Map(cards.map((c) => [c.id, c]));
  const rows: DraftRow[] = [];
  let airportLeft = 0;
  for (const p of placed) {
    const on = scheduled.filter((c) => c.day_id === p.dayId);
    const i = dayIds.indexOf(p.dayId);
    const edge: DayEdge = { first: i === 0, last: i === dayIds.length - 1 };
    const picked = [...p.group.items, ...p.group.meals].map((pin) => byId.get(pin.id)).filter((c): c is Card => !!c);
    const { toAdd, times } = planBatch(picked, on, stayAnchor(dayIds, scheduled, p.dayId), { edge });
    // The planner's order, then real lengths and opening hours (./retime).
    const date = dd[i].date;
    const pinOf = new Map([...p.group.items, ...p.group.meals].map((x) => [x.id, x]));
    const town = p.group.items.some((x) => (x.types ?? []).includes("locality"));
    const inTown = toAdd.filter((c) => { const x = pinOf.get(c.id)!; return town && dayShare(x) < 1 && x.type === "activity" && !p.group.meals.some((m) => m.id === c.id); }).length;
    // Two whole-day places on one site (Super Nintendo World inside Universal
    // Studios) share one day: the second takes the first's hours.
    const sameSite = new Map<string, string>();
    toAdd.forEach((c, k) => {
      const x = pinOf.get(c.id)!;
      if (dayShare(x) < 1 || x.lat == null || x.lng == null) return;
      const first = toAdd.slice(0, k).find((o) => { const y = pinOf.get(o.id)!; return dayShare(y) >= 1 && y.lat != null && y.lng != null && km({ lat: x.lat!, lng: x.lng! }, { lat: y.lat!, lng: y.lng! }) < 0.6; });
      if (first) sameSite.set(c.id, first.id);
    });
    const items: RetimeItem[] = toAdd.filter((c) => !sameSite.has(c.id)).map((c) => {
      const pin = pinOf.get(c.id)!;
      const t = times.get(c.id);
      const w = hoursWindow((c.place as unknown as { hours?: unknown }).hours, date) ?? assumedWindow(pin.types);
      const share = dayShare(pin);
      const meal = p.group.meals.some((m) => m.id === c.id);
      // With children on the trip a bar is a late evening, from nine, for
      // whoever goes out once they are down (Brennan, 29 Sep 2026).
      const late = opts.kids && pin.subType === "bar";
      const s0 = t ? toMin(t.start) : null;
      const start = late ? Math.max(s0 ?? LATE_BAR, LATE_BAR) : s0;
      return {
        id: c.id, start, end: late ? start! + 90 : t ? toMin(t.end) : null,
        kind: meal ? "meal" : "sight",
        // Inside a pinned town (Kamakura's beach) a place is part of the
        // town's day: an hour and a half each, and the town leaves room.
        minutes: town && share < 1 ? 90 : town && share >= 1 ? Math.max(180, sightMinutes(1) - 105 * inTown) : sightMinutes(share),
        whole: share >= 1, window: w === "closed" ? { open: 0, close: 0 } : w,
      };
    });
    const fixed = on.flatMap((c) => { const t = cardTimes(c); return t.start ? [{ start: toMin(t.start), end: t.end ? toMin(t.end) : toMin(t.start) + 60 }] : []; });
    // Nothing before landing or after leaving for the airport (./airports).
    const bounds = dayBounds(on, edge);
    const bounded = bounds.from !== null || bounds.until !== null;
    const real = retimeDay(items, [...fixed, ...boundBlocks(bounds)]);
    sameSite.forEach((first, id) => real.set(id, real.get(first) ?? null));
    let pos = on.reduce((m, c) => Math.max(m, c.position ?? 0), 0);
    for (const c of toAdd) {
      const t = real.get(c.id);
      // On an airport day, what does not fit before the flight stays saved
      // rather than landing untimed after it.
      if (bounded && !t) { airportLeft++; continue; }
      rows.push({
        day_id: p.dayId, trip_id: tripId, place_id: c.place_id as string, status: "in_itinerary", position: ++pos,
        start_time: t ? toTime(t.start) : null, end_time: t ? toTime(t.end) : null, source_url: null,
        details: { plan: { day: p.dayId, start: t ? toTime(t.start) : null } }, ai_generated: true, confirmed: false,
      });
    }
  }
  // Tour companies: the lightest planned day in their region, untimed, to book.
  const count = new Map<string, number>();
  for (const r of rows) count.set(r.day_id, (count.get(r.day_id) ?? 0) + 1);
  let toursLeft = 0;
  for (const t of grouping.tours) {
    const card = byId.get(t.pin.id);
    const choices = placed.filter((p) => p.group.region === t.region).map((p) => p.dayId);
    if (!card || !choices.length) { toursLeft++; continue; }
    const day = choices.sort((a, b) => (count.get(a) ?? 0) - (count.get(b) ?? 0) || dayIds.indexOf(a) - dayIds.indexOf(b))[0];
    const pos = Math.max(0, ...rows.filter((r) => r.day_id === day).map((r) => r.position), ...scheduled.filter((c) => c.day_id === day).map((c) => c.position ?? 0)) + 1;
    rows.push({
      day_id: day, trip_id: tripId, place_id: card.place_id as string, status: "in_itinerary", position: pos,
      start_time: null, end_time: null, source_url: null,
      details: { plan: { day, start: null } }, ai_generated: true, confirmed: false,
    });
    count.set(day, (count.get(day) ?? 0) + 1);
  }
  const leftOut = unplaced.reduce((s, g) => s + g.items.length, 0) + grouping.left.length + toursLeft + airportLeft;
  return { rows, dayIds: Array.from(new Set(rows.map((r) => r.day_id))), leftOut };
}

/**
 * Whether children are on the journey, for day loads and bars (28 Sep 2026).
 * Ages first, then the travellers' birthdates at the start of the trip; with
 * neither, a party of three or more is taken to maybe include children —
 * Japan (five of them) has no ages saved, and leaving the bars to the person
 * costs nothing, while scheduling them for a nine-year-old would be absurd.
 */
export function hasChildren(ages: number[] | null, birthdates: (string | null)[], partySize: number, startDate: string): boolean {
  if (ages && ages.length) return ages.some((a) => a < 13);
  const start = Date.parse(startDate + "T00:00:00Z");
  const known = birthdates.filter((b): b is string => !!b).map((b) => (start - Date.parse(b + "T00:00:00Z")) / (365.25 * 86_400_000));
  if (known.length) return known.some((a) => a < 13);
  return partySize >= 3;
}
