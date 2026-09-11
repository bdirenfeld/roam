// ── Drive arithmetic for a candidate stay ─────────────────────────────────
// The route asks Google for minutes from each candidate to each anchor. This
// turns those minutes into the three things the sheet shows: the hours a
// candidate costs over the whole trip (return drives × the days each anchor
// is visited), the one-line "Lucca 10 min · airport 30 · Volterra 1 h 20",
// and the sentence for a place outside the area ("Adds about 4 hours of
// driving over the trip"). Geography disqualifies; it does not pick — so the
// hours are shown, never ranked on alone.

export interface DrivePart { label: string; minutes: number | null }

/** Past this, a cluster is a second base, not a day trip (Tokyo → Kagoshima is 21 h). */
export const DAY_TRIP_MAX_MIN = 180;

/**
 * Which anchors a candidate is scored against. A day-trip cluster more than
 * DAY_TRIP_MAX_MIN from the evening centre is somewhere you would move to,
 * not drive to and back, so it drops out of the hours, the line and the
 * "adds N hours" sentence. The split sentence still names it. Evening and
 * airport anchors always count.
 */
export function usableAnchorIndexes(
  anchors: { kind: string }[],
  minutesFromCentre: (number | null)[],
  maxMin: number = DAY_TRIP_MAX_MIN,
): number[] {
  const out: number[] = [];
  anchors.forEach((a, i) => {
    const m = minutesFromCentre[i];
    if (a.kind === "daytrip" && m != null && m > maxMin) return;
    out.push(i);
  });
  return out;
}

/** "10 min" · "1 h" · "1 h 20". Null when Google had no road. */
export function fmtMinutes(m: number | null): string {
  if (m == null) return "—";
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r === 0 ? `${h} h` : `${h} h ${r}`;
}

/**
 * Return-trip hours over the journey. Each anchor is driven to and back on
 * every day it is visited, so a place visited twice counts twice. Anchors
 * with no road (null) contribute nothing rather than poisoning the total.
 */
export function driveHours(minutes: (number | null)[], weights: number[]): number {
  let total = 0;
  for (let i = 0; i < minutes.length; i++) {
    const m = minutes[i];
    if (m == null) continue;
    total += 2 * m * (weights[i] ?? 1);
  }
  return Math.round(total / 60 * 10) / 10;
}

/**
 * The drive line on a row. The first part says "min"; later parts under an
 * hour drop it, the way you would say it: "Lucca 10 min · airport 30 · Volterra 1 h 20".
 */
export function driveLine(parts: DrivePart[]): string {
  return parts
    .filter((p) => p.minutes != null)
    .map((p, i) => {
      const m = p.minutes as number;
      const txt = i > 0 && m < 60 ? String(Math.round(m)) : fmtMinutes(m);
      return `${p.label} ${txt}`;
    })
    .join(" · ");
}

/**
 * The cost of a hell-bent choice against the best-placed candidate, to the
 * nearest half hour. Under an hour it says nothing — that is noise, not a trade.
 */
/**
 * Extra driving a person would actually accept, in hours over the whole stay.
 *
 * Measured against every candidate on his nine journeys (11 Sept 2026). The
 * ones that make sense cost between 0 and 0.55 hours a night more than the
 * best; Villa Bottino, which he weighed up himself, is 0.76. Above an hour a
 * night they stop being options: a New York list offered an Airbnb at 1.23,
 * Santa Barbara a hotel in Ventura at 1.33, a Palm Springs run once proposed
 * a cabin in Minnesota at 122, and Tokyo's list carried a Kyushu ryokan at
 * 8.3. Every one of those was shown with a polite warning attached instead of
 * being left out ("those don't make a whole lot of sense" — Brennan).
 */
export const HOURS_PER_NIGHT = 1;

/**
 * How far from the base a stay can sit, as a multiple of the radius the brief
 * already tells him to stay inside ("stay within 15 minutes of it").
 *
 * Straight-line kilometres do not work in a city. The New York flat he
 * queried was 8.9 km from his centre — comfortably inside the 35 km gate —
 * and 44 minutes' drive, against 20 to 29 for the Manhattan hotels. Nine
 * kilometres is not nine kilometres when there is a river in the way.
 *
 * Measured against every candidate on all nine journeys, 11 Sept 2026. The
 * ones that belong are 3 to 34 minutes out (Rome's Palazzo Cinquecento is 34,
 * Villa Bottino 24). The ones that do not start at 40: New York at 40 and 44,
 * Palm Springs' Highland Springs Ranch at 42, Tokyo's Hakone ryokans at 112
 * and 142, Sydney's farm stays at 72 and up.
 */
export const RADIUS_MULTIPLE = 2.5;

/** True when a stay is simply not in the place the journey is in. */
export function tooFarFromBase(minutes: number | null | undefined, radiusMin: number): boolean {
  if (minutes == null || !Number.isFinite(minutes)) return false;
  return minutes > Math.max(30, (radiusMin || 15) * RADIUS_MULTIPLE);
}

/** True when this stay costs so much extra driving it is a different trip. */
export function tooMuchDriving(hours: number, bestHours: number, nights: number): boolean {
  if (!Number.isFinite(hours) || !Number.isFinite(bestHours)) return false;
  const extra = hours - bestHours;
  if (extra <= 0) return false;
  return extra > Math.max(1, nights) * HOURS_PER_NIGHT;
}

export function driveDelta(hours: number, bestHours: number): string | null {
  const d = Math.round((hours - bestHours) * 2) / 2;
  if (d < 1) return null;
  const n = Number.isInteger(d) ? String(d) : d.toFixed(1);
  return `Adds about ${n} ${d === 1 ? "hour" : "hours"} of driving over the trip`;
}
