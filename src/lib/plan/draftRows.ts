/**
 * "Plan my trip" end to end, minus the writing (28 Sep 2026): a journey's
 * saved places and its days in, the draft cards to insert out. Composes the
 * three tested steps — day groups (./dayGroups), groups onto days
 * (./draftTrip) and times within a day (lib/week/dayPlan) — so both screens
 * that offer the button (the week's map, the phone Map) make the same draft.
 *
 * A draft card is an ordinary scheduled copy of a saved place, marked
 * `details.draft = true` and `ai_generated = true`. The saved card stays, as
 * it does for every scheduled copy. Keep clears the mark; Clear deletes the
 * draft cards. Nothing already on a day is touched.
 */

import type { Card, Day } from "@/types/database";
import { groupPins, type Grouping, type Pin } from "./dayGroups";
import { placeGroups, regionLabel, freeDays, type DraftDay } from "./draftTrip";
import { planBatch, stayAnchor, type DayEdge } from "@/lib/week/dayPlan";
import { cardTimes } from "@/lib/cardTime";

export const isDraft = (c: { details?: unknown }): boolean => (c.details as Record<string, unknown> | null | undefined)?.draft === true;

/** Monday-first "1"/"0" from Google's weekday_text; null when unknown. */
export function openFromHours(hours: unknown): string | null {
  const text = (hours as { weekday_text?: unknown } | null)?.weekday_text;
  if (!Array.isArray(text) || text.length !== 7) return null;
  return text.map((t) => (typeof t === "string" && /closed/i.test(t) ? "0" : "1")).join("");
}

const FLIGHT = new Set(["flight_arrival", "flight_departure"]);

/** How much of each day is free: a planned sight takes it; a flight leaves half. */
export function draftDays(days: Pick<Day, "id" | "date" | "day_number">[], scheduled: Card[]): DraftDay[] {
  return [...days].sort((a, b) => a.day_number - b.day_number).map((d) => {
    const on = scheduled.filter((c) => c.day_id === d.id);
    const taken = on.some((c) => c.place?.type === "activity" || (!c.place && !isDraft(c) && !!cardTimes(c).start));
    const flight = on.some((c) => FLIGHT.has(c.place?.sub_type ?? ""));
    return { id: d.id, date: d.date, free: taken ? 0 : flight ? 0.5 : 1 };
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
  details: { draft: true }; ai_generated: true; confirmed: false;
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

export function previewDraft(cards: Card[], days: Pick<Day, "id" | "date" | "day_number">[], kids: boolean): DraftPreview {
  const pins = pinsToPlan(cards);
  const grouping = groupPins(pins, { kids });
  const scheduled = cards.filter((c) => c.status === "in_itinerary" && c.day_id);
  const free = freeDays(draftDays(days, scheduled));
  const regions = grouping.regions.filter((r) => r.days > 0).map((r) => {
    const mine = grouping.groups.filter((g) => g.region === r.id).flatMap((g) => g.items);
    return { id: r.id, label: regionLabel(mine) ?? mine[0]?.title ?? "Somewhere", days: r.days, places: r.pins };
  });
  // Biggest regions first while they fit, half a day for each move after the first.
  const suggested: number[] = [];
  let used = 0;
  for (const r of [...regions].sort((a, b) => b.days - a.days)) {
    const cost = r.days + (suggested.length ? 0.5 : 0);
    if (used + cost <= free) { suggested.push(r.id); used += cost; }
  }
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
  for (const p of placed) {
    const on = scheduled.filter((c) => c.day_id === p.dayId);
    const i = dayIds.indexOf(p.dayId);
    const edge: DayEdge = { first: i === 0, last: i === dayIds.length - 1 };
    const picked = [...p.group.items, ...p.group.meals].map((pin) => byId.get(pin.id)).filter((c): c is Card => !!c);
    const { toAdd, times } = planBatch(picked, on, stayAnchor(dayIds, scheduled, p.dayId), { edge });
    let pos = on.reduce((m, c) => Math.max(m, c.position ?? 0), 0);
    for (const c of toAdd) {
      const t = times.get(c.id);
      rows.push({
        day_id: p.dayId, trip_id: tripId, place_id: c.place_id as string, status: "in_itinerary", position: ++pos,
        start_time: t?.start ?? null, end_time: t?.end ?? null, source_url: null,
        details: { draft: true }, ai_generated: true, confirmed: false,
      });
    }
  }
  const leftOut = unplaced.reduce((s, g) => s + g.items.length, 0) + grouping.left.length;
  return { rows, dayIds: Array.from(new Set(rows.map((r) => r.day_id))), leftOut };
}
