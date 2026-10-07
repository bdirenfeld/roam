/**
 * The travel leg (7 Oct 2026, mock d13 approved with three tweaks).
 *
 * A card that is a journey between two places, not a stop: "Lusaka → Mfuwe ·
 * Overland truck · 13h". No schema change. The card's place stays the END of
 * the leg (so its pin, photo and directions are where you arrive) and the
 * start lives in the card's details:
 *
 *   details.from       = { title, lat, lng, google_place_id?, place_id? }
 *   details.mode       = "drive" | "bus" | "train" | "ferry"
 *   details.mode_label = optional words for the mode ("Overland truck",
 *                        "Mokoro") — read before the mode's own word.
 *
 * A card is a leg only when its place is logistics/transit (or ferry/train,
 * should those sub_types ever exist) AND details.from is a real point. A
 * transit card without `from` is still a plain transit stop.
 *
 * His tweaks: the map draws the dashed line only for legs over about an hour
 * (shouldDrawLine); a leg added by hand starts at last night's stay
 * (defaultFromForDay); the line is thin, low-opacity and dashed (DayMap).
 */

import { cardTimes, type TimedCard } from "@/lib/cardTime";
import { stayRuns, addDays, type StayCard } from "@/lib/stays/stayRuns";

export type LegMode = "drive" | "bus" | "train" | "ferry";

export interface LegFrom {
  title: string;
  lat: number;
  lng: number;
  google_place_id?: string | null;
  place_id?: string | null;
}

/** The mode picker, in the order the sheet shows it. */
export const LEG_MODES: { value: LegMode; label: string }[] = [
  { value: "drive", label: "Drive" },
  { value: "bus",   label: "Bus" },
  { value: "train", label: "Train" },
  { value: "ferry", label: "Ferry" },
];

/** Material glyph per mode (each is in mapPins' OTHER_GLYPHS, or it shows as a word). */
export const LEG_MODE_GLYPH: Record<LegMode, string> = {
  drive: "directions_car",
  bus:   "directions_bus",
  train: "train",
  ferry: "directions_boat",
};

/** Sub_types a leg can be. Only "transit" exists in the data today (7 Oct 2026). */
const LEG_SUB_TYPES = new Set(["transit", "ferry", "train"]);

/** Over an hour, by the clock (his tweak 1). */
export const LINE_MIN_MINUTES = 60;
/** An untimed leg is drawn when it is clearly over an hour away: ~60 km straight-line. */
const LINE_MIN_KM_UNTIMED = 60;
/** A "leg" that starts where it ends (a border post after the truck) draws nothing. */
const LINE_MIN_KM = 0.5;

type LegCard = TimedCard & {
  details?: unknown;
  place?: { title?: string | null; type?: string | null; sub_type?: string | null; lat?: number | null; lng?: number | null } | null;
};

const det = (card: { details?: unknown } | null | undefined) =>
  (card?.details ?? null) as Record<string, unknown> | null;

/** details.from, if it is a usable point. */
export function readFrom(details: unknown): LegFrom | null {
  const f = (details as Record<string, unknown> | null)?.from as Record<string, unknown> | undefined;
  if (!f || typeof f !== "object") return null;
  const lat = typeof f.lat === "number" ? f.lat : Number.NaN;
  const lng = typeof f.lng === "number" ? f.lng : Number.NaN;
  const title = typeof f.title === "string" ? f.title.trim() : "";
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !title) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {
    title, lat, lng,
    ...(typeof f.google_place_id === "string" ? { google_place_id: f.google_place_id } : {}),
    ...(typeof f.place_id === "string" ? { place_id: f.place_id } : {}),
  };
}

export function readMode(details: unknown): LegMode | null {
  const m = (details as Record<string, unknown> | null)?.mode;
  return m === "drive" || m === "bus" || m === "train" || m === "ferry" ? m : null;
}

/** A place that can carry a leg: logistics, and transit (or ferry/train). */
export function canBeLeg(place: { type?: string | null; sub_type?: string | null } | null | undefined): boolean {
  return place?.type === "logistics" && !!place.sub_type && LEG_SUB_TYPES.has(place.sub_type);
}

export function isTravelLeg(card: LegCard | null | undefined): boolean {
  return !!card && canBeLeg(card.place) && readFrom(card.details) !== null;
}

/** "Lusaka → Mfuwe", in full. A named title that already reads A → B wins
 *  (the imported tour legs name the town, not the gate the pin sits on). */
export function legTitle(card: LegCard): string {
  const d = det(card);
  const own = typeof d?.title === "string" ? d.title.trim() : "";
  if (d?.named === true && own.includes("→")) return own;
  const from = readFrom(d);
  const to = card.place?.title?.trim() || own || "";
  return from ? `${from.title} → ${to}` : to;
}

/** Minutes between the leg's start and end; an overnight leg wraps. Null when untimed. */
export function legDurationMins(card: LegCard): number | null {
  const { start, end } = cardTimes(card);
  if (!start || !end) return null;
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
  const a = toMin(start), b = toMin(end);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const mins = b - a;
  return mins > 0 ? mins : mins < 0 ? mins + 24 * 60 : null;
}

/** "13h", "1h 30m", "45m". */
export function formatLegDuration(mins: number): string {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** The mode in words: mode_label first ("Overland truck"), else the mode's word.
 *  No mode, no word (7 Oct 2026, mock t05): a leg added without one says only
 *  how long it takes; the app does not guess Drive. */
export function legModeWord(details: unknown): string {
  const label = (details as Record<string, unknown> | null)?.mode_label;
  if (typeof label === "string" && label.trim()) return label.trim();
  const mode = readMode(details);
  return LEG_MODES.find((x) => x.value === mode)?.label ?? "";
}

/** "Overland truck · 13h" — the mode word, then the duration when the leg is timed. */
export function legSubtitle(card: LegCard): string {
  const mins = legDurationMins(card);
  return [legModeWord(card.details), mins ? formatLegDuration(mins) : null].filter(Boolean).join(" · ");
}

export function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Does the day map draw this leg's dashed line? Only a leg over about an hour
 * (his tweak 1): by the clock when it is timed, by ~60 km straight-line when
 * it is not. Never a leg that starts where it ends.
 */
export function shouldDrawLine(card: LegCard): boolean {
  if (!isTravelLeg(card)) return false;
  const p = card.place;
  if (p?.lat == null || p?.lng == null) return false;
  const from = readFrom(card.details)!;
  const km = kmBetween(from, { lat: p.lat, lng: p.lng });
  if (km < LINE_MIN_KM) return false;
  const mins = legDurationMins(card);
  return mins != null ? mins >= LINE_MIN_MINUTES : km >= LINE_MIN_KM_UNTIMED;
}

export interface LegLine {
  cardId: string;
  from: [number, number];
  to: [number, number];
  mid: [number, number];
  mode: LegMode;
}

/** What the day map draws, [lng, lat] pairs. */
export function legLines(cards: (LegCard & { id: string; status?: string | null })[]): LegLine[] {
  return cards
    .filter((c) => c.status !== "cut" && shouldDrawLine(c))
    .map((c) => {
      const f = readFrom(c.details)!;
      const to: [number, number] = [c.place!.lng as number, c.place!.lat as number];
      return {
        cardId: c.id,
        from: [f.lng, f.lat],
        to,
        mid: [(f.lng + to[0]) / 2, (f.lat + to[1]) / 2],
        mode: readMode(c.details) ?? "drive",
      };
    });
}

/**
 * New details for a leg whose start changed. A named "A → B" title keeps its
 * B and takes the new A. The mode is left alone: until 7 Oct 2026 (mock t05)
 * a leg with none was set to drive here; now nobody's mode is guessed.
 */
export function withFrom(details: unknown, from: LegFrom): Record<string, unknown> {
  const d = { ...((details as Record<string, unknown> | null) ?? {}) };
  d.from = from;
  if (d.named === true && typeof d.title === "string" && d.title.includes("→")) {
    const to = d.title.slice(d.title.indexOf("→") + 1).trim();
    d.title = `${from.title} → ${to}`;
  }
  return d;
}

export interface LegDayCard extends StayCard {
  place?: { id?: string | null; sub_type?: string | null; title?: string | null; lat?: number | null; lng?: number | null; google_place_id?: string | null } | null;
}
export interface LegDay { id: string; date: string; cards: LegDayCard[] }

/**
 * Where a leg added by hand starts (his tweak 2): the hotel that covers the
 * night before this day, read through stayRuns like every other stay. Null on
 * the first day, or when no stay covers that night or it has no point.
 */
export function defaultFromForDay(days: LegDay[], dayId: string): LegFrom | null {
  const day = days.find((d) => d.id === dayId);
  if (!day) return null;
  const night = addDays(day.date, -1);
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const tripEnd = addDays(sorted[sorted.length - 1].date, 1);
  const run = stayRuns(sorted, tripEnd).find((r) => r.checkIn <= night && night < r.checkOut);
  if (!run) return null;
  const card = sorted.flatMap((d) => d.cards).find((c) => c.id === run.cardId);
  const p = card?.place;
  if (!p || p.lat == null || p.lng == null || !p.title) return null;
  return {
    title: p.title, lat: p.lat, lng: p.lng,
    ...(p.google_place_id ? { google_place_id: p.google_place_id } : {}),
    ...(card?.place_id ? { place_id: card.place_id } : {}),
  };
}
