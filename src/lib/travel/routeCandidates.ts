/**
 * The places offered when you change where a trip starts or ends (Brennan,
 * 14 Nov 2026, the From / To editor, Google Maps style): your own places
 * before Google, because most of the time the place is already in the trip.
 *
 *   Your places (at most 4):  last night's stay, then today's timed stops in
 *                             order, then car parks / stations used on the trip.
 *   Saved on your map (3):    saved pins, nearest to where the trip is first.
 *
 * Whatever is already in the other box is never offered ("Villa Zambaldi as
 * To when it's already From"). Typing narrows both lists by name, across every
 * place in the trip, and Google's results go under them.
 */

import type { LegFrom } from "@/lib/travel/leg";
import { formatTimeValue } from "@/lib/formatTime";
import { timeFirst } from "@/lib/agendaOrder";
import type { TimedCard } from "@/lib/cardTime";

export interface RouteCard {
  id: string;
  day_id: string | null;
  status: string | null;
  archived?: boolean | null;
  start_time: string | null;
  details?: unknown;
  place?: { id?: string | null; title?: string | null; type?: string | null; sub_type?: string | null; lat?: number | null; lng?: number | null; address?: string | null; google_place_id?: string | null } | null;
}

export interface Candidate extends LegFrom {
  /** The grey line under the name. */
  sub: string;
  kind: "stay" | "stop" | "used" | "trip" | "saved";
}

export const YOURS_MAX = 4;
export const SAVED_MAX = 3;
const SAME_KM = 0.05;

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** "Via Santa Lucia, 20, 55100 Lucca LU, Italy" → "Lucca". */
export function townOf(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  // The last part with a postcode: Google writes some car parks as "viale 55100, …".
  const withCode = [...parts].reverse().find((p) => /\b\d{4,6}\b/.test(p));
  if (withCode) {
    const town = withCode.replace(/\b\d{4,6}\b/, "").replace(/\b[A-Z]{2}\b$/, "").trim();
    if (town) return town;
  }
  return parts.length >= 2 ? parts[parts.length - 2] : null;
}

const isTravel = (c: RouteCard) => {
  const f = (c.details as { from?: unknown } | null)?.from;
  return !!f && typeof f === "object";
};
const titleOf = (c: RouteCard) => {
  const t = (c.details as { title?: unknown } | null)?.title;
  return (typeof t === "string" && t.trim() ? t.trim() : null) ?? c.place?.title ?? null;
};
const point = (c: RouteCard): LegFrom | null => {
  const p = c.place;
  if (!p || p.lat == null || p.lng == null || !p.title) return null;
  return {
    title: p.title, lat: p.lat, lng: p.lng,
    ...(p.id ? { place_id: p.id } : {}),
    ...(p.google_place_id ? { google_place_id: p.google_place_id } : {}),
    ...(p.address ? { address: p.address } : {}),
  };
};

function same(a: { lat: number; lng: number; title: string }, b: { lat: number; lng: number; title: string } | null): boolean {
  if (!b) return false;
  return a.title.toLowerCase() === b.title.toLowerCase() || km(a, b) <= SAME_KM;
}

export function routeCandidates(opts: {
  cards: RouteCard[];
  dayId: string | null;
  stay: LegFrom | null;
  /** What is in the other box: never offered. */
  exclude: LegFrom | null;
  /** Where the trip is, to put the nearest saved pins first. */
  near: { lat: number; lng: number } | null;
  query?: string;
}): { yours: Candidate[]; saved: Candidate[] } {
  const { cards, dayId, stay, exclude, near } = opts;
  const q = (opts.query ?? "").trim().toLowerCase();
  const live = cards.filter((c) => !c.archived && c.status !== "cut");
  const all: Candidate[] = [];
  const push = (c: Candidate) => {
    if (same(c, exclude)) return;
    if (all.some((x) => same(x, c))) return;
    all.push(c);
  };

  if (stay) push({ ...stay, sub: "Last night’s stay", kind: "stay" });

  // In the day’s own order (lib/agendaOrder’s timeFirst: a flight sits at its landing).
  const todays = live.filter((c) => c.day_id === dayId && c.status === "in_itinerary" && c.start_time && !isTravel(c));
  const asTimed = todays.map((c) => ({ ...c, end_time: null, details: c.details ?? null, place: c.place ? { ...c.place, sub_type: c.place.sub_type ?? null } : null })) as unknown as (TimedCard & RouteCard)[];
  for (const c of timeFirst(asTimed)) {
    const p = point(c);
    if (!p) continue;
    const town = townOf(p.address);
    push({ ...p, title: titleOf(c) ?? p.title, sub: ["Today", formatTimeValue(c.start_time), town].filter(Boolean).join(" · "), kind: "stop" });
  }

  for (const c of live) {
    if (!isTravel(c) || c.place?.sub_type !== "transit") continue;
    const p = point(c);
    if (!p) continue;
    // The name the card gives it ("Lucca (station car park)"), not the bare pin's ("Lucca").
    const d = c.details as { named?: unknown; title?: unknown } | null;
    if (d?.named === true && typeof d.title === "string" && d.title.includes("→")) p.title = d.title.slice(d.title.lastIndexOf("→") + 1).trim() || p.title;
    push({ ...p, sub: ["Used on this trip", townOf(p.address)].filter(Boolean).join(" · "), kind: "used" });
  }

  // Everything else in the trip only answers a search.
  if (q) {
    for (const c of live) {
      if (c.status !== "in_itinerary" || isTravel(c)) continue;
      const p = point(c);
      if (!p) continue;
      push({ ...p, title: titleOf(c) ?? p.title, sub: ["In your trip", townOf(p.address)].filter(Boolean).join(" · "), kind: "trip" });
    }
  }

  const saved: Candidate[] = [];
  const pins = live.filter((c) => c.status === "interested").map(point).filter((p): p is LegFrom => !!p);
  const ranked = near ? pins.map((p) => ({ p, d: km(p, near) })).sort((a, b) => a.d - b.d).map((x) => x.p) : pins;
  for (const p of ranked) {
    const c: Candidate = { ...p, sub: ["Saved on your map", townOf(p.address)].filter(Boolean).join(" · "), kind: "saved" };
    if (same(c, exclude) || all.some((x) => same(x, c)) || saved.some((x) => same(x, c))) continue;
    saved.push(c);
  }

  const match = (c: Candidate) => !q || c.title.toLowerCase().includes(q);
  return { yours: all.filter(match).slice(0, YOURS_MAX), saved: saved.filter(match).slice(0, SAVED_MAX) };
}
