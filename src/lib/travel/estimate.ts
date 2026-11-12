/**
 * How long a leg takes by car and by public transit (Brennan, 12 Nov 2026):
 * the drive card shows "🚗 55 min · 🚆 1 h 40" once it has a From and a To,
 * and a tap sets the mode and the end time. One Google Directions call
 * per mode (the same cached route the getting-there cards use), made only when the card's From/To pair has no saved answer; the
 * answer is kept on the card (details.estimate) so reopening costs nothing.
 */

export interface Pt { lat: number; lng: number }

export interface LegEstimate {
  /** "lat,lng>lat,lng" to 4 places; a moved From or To asks again. */
  key: string;
  drive: number | null;
  transit: number | null;
  /** Rides on the transit route (2 = one change); null when there is no transit answer. */
  rides: number | null;
  /** What the transit route mostly rides: the mode a tap on it sets. */
  via: "train" | "bus" | "ferry" | null;
}

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

export function estimateKey(from: Pt, to: Pt): string {
  return `${r4(from.lat)},${r4(from.lng)}>${r4(to.lat)},${r4(to.lng)}`;
}

/** The saved estimate when it is for this From/To pair, else null. */
export function readEstimate(details: unknown, from: Pt | null, to: Pt | null): LegEstimate | null {
  if (!from || !to) return null;
  const e = (details as Record<string, unknown> | null)?.estimate as Record<string, unknown> | undefined;
  if (!e || typeof e !== "object" || e.key !== estimateKey(from, to)) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null);
  return { key: e.key as string, drive: num(e.drive), transit: num(e.transit), rides: num(e.rides), via: e.via === "train" || e.via === "bus" || e.via === "ferry" ? e.via : null };
}

/** Round to what a person plans by: 5-minute steps, never below 5. */
export function planMinutes(m: number): number {
  return Math.max(5, Math.round(m / 5) * 5);
}

/** "HH:MM[:SS]" + minutes → "HH:MM", wrapping past midnight. */
export function endAfter(start: string, mins: number): string {
  const t = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + mins;
  const w = ((t % 1440) + 1440) % 1440;
  const h = Math.floor(w / 60), m = w % 60;
  return `${h < 10 ? "0" : ""}${h}:${m < 10 ? "0" : ""}${m}`;
}

/** "55 min", "1 h", "1 h 40". */
export function estimateLabel(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), r = mins % 60;
  return r ? `${h} h ${r}` : `${h} h`;
}

/** "1 change", "2 changes", "" for a direct ride. */
export function changesLabel(rides: number | null): string {
  if (!rides || rides < 2) return "";
  const n = rides - 1;
  return n === 1 ? "1 change" : n + " changes";
}

/** Google vehicle types to the leg modes: rail of any kind is a train, a ferry a ferry, anything else a bus. */
export function viaOf(vehicles: (string | undefined)[]): "train" | "bus" | "ferry" | null {
  const v = vehicles.filter(Boolean) as string[];
  if (!v.length) return null;
  if (v.some((x) => /RAIL|TRAIN|SUBWAY|METRO|TRAM|MONORAIL|FUNICULAR/.test(x))) return "train";
  if (v.some((x) => /FERRY/.test(x))) return "ferry";
  return "bus";
}
