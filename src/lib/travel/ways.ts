/**
 * The ways to make a trip, and the legs of each (28 Nov 2026, Brennan; mock approved:
 * https://claude.ai/artifact/LbFYCDN84q6wCu3xMMHhHL). "If you do a start and an end destination,
 * is it going to be smart enough to add in the different legs?" — the Rome2Rio / Google Maps
 * answer: pick the start and the end, the card offers a few ways ("🚗 1 h 05", "🚗 + 🚆 1 h 25 ·
 * via Lucca", "🚌 + 🚆 1 h 40 · 1 change"), and a tap fills that way's legs into the ONE card.
 *
 *   drive   — Google Directions, driving.
 *   transit — Google Directions, transit: every ride and the walks between, from the timetables.
 *   mix     — drive to a station, then the train. No service plans this, Google included, so the
 *             app builds it from two Google answers (the drive to the nearest station, the transit
 *             from it), the way it already builds drive-park-walk (lib/travel/park).
 *
 * A chosen way's legs live on the card as `details.legs`, each with its offset from the card's
 * start (`at`, minutes) and its length, so moving the card (a drag on the Day view, the time sheet)
 * moves every leg with it.
 */
import type { Route, RouteStep } from "@/lib/plan/gettingThere";

export type WayMode = "drive" | "bus" | "train" | "tram" | "metro" | "ferry" | "walk";
export interface WayStop { title: string; lat?: number; lng?: number }
export interface WayLeg { mode: WayMode; from: WayStop; to: WayStop; at: number; mins: number; line?: string }
export interface Way {
  kind: "drive" | "transit" | "mix";
  /** Door to door. */
  mins: number;
  legs: WayLeg[];
  /** Rides on it (2 = one change). */
  rides: number;
  /** The station a mix drives to. */
  via?: string;
}

/** Minutes a mix allows to park at the station and get to the platform. */
export const PARK_MIN = 10;
/** A walk shorter than this is not a leg (getting off one train and onto the next). */
const WALK_MIN = 5;

/** Google's vehicle type → the leg's mode. */
export function vehicleMode(v: string | undefined): WayMode {
  if (!v) return "train";
  if (/BUS/.test(v)) return "bus";
  if (v === "FERRY") return "ferry";
  if (v === "TRAM" || v === "LIGHT_RAIL" || v === "MONORAIL" || v === "CABLE_CAR") return "tram";
  if (v === "SUBWAY" || v === "METRO_RAIL") return "metro";
  return "train";
}

/** A transit route as legs: each ride, and each walk worth naming, from `offset` minutes on. */
export function transitLegs(route: Route, from: WayStop, to: WayStop, offset = 0): WayLeg[] {
  const legs: WayLeg[] = [];
  let t = offset;
  let at: WayStop = from;
  const steps = route.steps;
  steps.forEach((s: RouteStep, i) => {
    const last = i === steps.length - 1;
    if (s.kind === "ride") {
      // The timetable says when it leaves; the wait before it is the time to change.
      const start = route.dep != null && s.dep != null ? offset + Math.max(0, Math.round((s.dep - route.dep) / 60)) : t;
      const stop: WayStop = last ? to : { title: s.to ?? "", ...(s.toPt ?? {}) };
      legs.push({ mode: vehicleMode(s.vehicle), from: at, to: stop, at: Math.max(start, t), mins: s.minutes, ...(s.line ? { line: s.line } : {}) });
      t = Math.max(start, t) + s.minutes;
      at = stop;
    } else {
      if (s.minutes >= WALK_MIN) {
        const next = steps[i + 1];
        const stop: WayStop = last ? to : { title: next?.from ?? "" };
        legs.push({ mode: "walk", from: at, to: stop, at: t, mins: s.minutes });
        at = stop;
      }
      t += s.minutes;
    }
  });
  return legs;
}

const ridesOf = (r: Route) => r.steps.filter((s) => s.kind === "ride").length;

export function driveWay(r: Route, from: WayStop, to: WayStop): Way {
  return { kind: "drive", mins: r.minutes, rides: 0, legs: [{ mode: "drive", from, to, at: 0, mins: r.minutes }] };
}

/** Null when Google's "transit" is all walking. */
export function transitWay(r: Route, from: WayStop, to: WayStop): Way | null {
  if (!ridesOf(r)) return null;
  const legs = transitLegs(r, from, to);
  const end = legs.length ? legs[legs.length - 1].at + legs[legs.length - 1].mins : r.minutes;
  return { kind: "transit", mins: Math.max(end, r.minutes), rides: ridesOf(r), legs };
}

/** Drive to `station`, park, then transit from it. Null when there is no ride from the station. */
export function mixWay(drive: Route, station: WayStop, transit: Route, from: WayStop, to: WayStop): Way | null {
  if (!ridesOf(transit)) return null;
  // The walk from the car park to the platform is the parking allowance: drop a first walk.
  const steps = transit.steps[0]?.kind === "walk" ? transit.steps.slice(1) : transit.steps;
  const t2: Route = { ...transit, steps, dep: transit.dep != null && transit.steps[0]?.kind === "walk" ? transit.dep + transit.steps[0].minutes * 60 : transit.dep };
  const rest = transitLegs(t2, station, to, drive.minutes + PARK_MIN);
  const legs: WayLeg[] = [{ mode: "drive", from, to: station, at: 0, mins: drive.minutes }, ...rest];
  const last = legs[legs.length - 1];
  return { kind: "mix", mins: last.at + last.mins, rides: ridesOf(transit), legs, via: station.title };
}

/**
 * Which ways to offer, in order: the drive, the mix when it beats transit (or there is none),
 * then transit. A mix that takes twice the drive is no help and is left out.
 */
export function offerWays(drive: Way | null, transit: Way | null, mix: Way | null): Way[] {
  const out: Way[] = [];
  if (drive) out.push(drive);
  if (mix && (!transit || mix.mins < transit.mins) && (!drive || mix.mins <= drive.mins * 2)) out.push(mix);
  if (transit) out.push(transit);
  return out;
}

const MODE_WORD: Record<WayMode, string> = { drive: "Drive", bus: "Bus", train: "Train", tram: "Tram", metro: "Metro", ferry: "Ferry", walk: "Walk" };
/** The Material glyph per mode (each is in lib/mapPins' font list). */
export const WAY_GLYPH: Record<WayMode, string> = { drive: "directions_car", bus: "directions_bus", train: "train", tram: "tram", metro: "subway", ferry: "directions_boat", walk: "directions_walk" };
export const wayWord = (m: string) => MODE_WORD[m as WayMode] ?? "Travel";
/** The card's own mode (lib/travel/leg: drive, bus, train, ferry) for a way's first ride. */
export function cardModeOf(legs: { mode: string }[]): "drive" | "bus" | "train" | "ferry" {
  const m = legs.find((l) => l.mode !== "walk")?.mode;
  return m === "drive" || m === "bus" || m === "ferry" ? m : m ? "train" : "drive";
}

/** "Drive + train", "Bus + train": the ridden modes in order, walks left out. */
export function waysLabel(legs: { mode: string }[]): string {
  const seen: string[] = [];
  for (const l of legs) {
    const w = MODE_WORD[l.mode as WayMode];
    if (!w || l.mode === "walk" || seen.includes(w)) continue;
    seen.push(w);
  }
  return seen.map((w, i) => (i ? w.toLowerCase() : w)).join(" + ");
}

/** The card's legs, when it holds a multi-leg way; null otherwise. */
export function readLegs(details: unknown): WayLeg[] | null {
  const raw = (details as Record<string, unknown> | null)?.legs;
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const ok = raw.every((l) => l && typeof l === "object" && typeof (l as WayLeg).mode === "string" && Number.isFinite((l as WayLeg).at) && Number.isFinite((l as WayLeg).mins)
    && typeof (l as WayLeg).to?.title === "string");
  return ok ? (raw as WayLeg[]) : null;
}

/** The stored ways on an estimate, if Google gave any. */
export function readWays(raw: unknown): Way[] | null {
  if (!Array.isArray(raw)) return null;
  const ways = raw.filter((w) => w && typeof w === "object" && ["drive", "transit", "mix"].includes((w as Way).kind) && Number.isFinite((w as Way).mins) && Array.isArray((w as Way).legs)) as Way[];
  return ways;
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** "HH:MM:00" `at` minutes after a card's "HH:MM[:SS]" start, wrapping at midnight. */
export function clockAt(start: string, at: number): string {
  const m = (((toMin(start) + Math.round(at)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;
}

/**
 * The legs of a run of separate leg cards, as one way (the run the list joins as "Leave for
 * Florence"), so the one card can show them before they are merged.
 */
export function runLegs(cards: { start_time: string | null; end_time: string | null; details?: unknown; place?: { title?: string | null; lat?: number | null; lng?: number | null } | null }[], title: (c: (typeof cards)[number]) => string): WayLeg[] | null {
  const first = cards[0]?.start_time;
  if (cards.length < 2 || !first) return null;
  const legs: WayLeg[] = [];
  for (const c of cards) {
    if (!c.start_time) return null;
    const d = (c.details ?? {}) as { mode?: string; from?: { title?: string; lat?: number; lng?: number } };
    const at = toMin(c.start_time) - toMin(first);
    const mins = c.end_time ? Math.max(0, toMin(c.end_time) - toMin(c.start_time)) : 0;
    const mode = (["drive", "bus", "train", "tram", "metro", "ferry", "walk"].includes(d.mode ?? "") ? d.mode : "drive") as WayMode;
    const p = c.place;
    legs.push({
      mode, at, mins,
      from: { title: d.from?.title ?? "", ...(typeof d.from?.lat === "number" && typeof d.from?.lng === "number" ? { lat: d.from.lat, lng: d.from.lng } : {}) },
      to: { title: title(c), ...(p?.lat != null && p?.lng != null ? { lat: p.lat, lng: p.lng } : {}) },
    });
  }
  return legs;
}

/** The way a card is set to now: its stored kind, else read from its mode. */
export function currentWay(details: unknown): Way["kind"] | null {
  const d = (details ?? {}) as { way?: unknown; mode?: unknown };
  if (d.way === "drive" || d.way === "transit" || d.way === "mix") return d.way;
  if (d.mode === "drive") return "drive";
  if (d.mode === "train" || d.mode === "bus" || d.mode === "ferry") return "transit";
  return null;
}
