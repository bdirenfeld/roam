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
export function driveDelta(hours: number, bestHours: number): string | null {
  const d = Math.round((hours - bestHours) * 2) / 2;
  if (d < 1) return null;
  const n = Number.isInteger(d) ? String(d) : d.toFixed(1);
  return `Adds about ${n} ${d === 1 ? "hour" : "hours"} of driving over the trip`;
}
