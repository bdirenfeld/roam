// ── Is it too early to ask where to stay? ─────────────────────────────────
//
// Brennan, 11 Sept 2026: "we should also have a view that you can't suggest a
// place to stay until a certain amount of pins are present, because at some
// points it may be too early in the analysis to find a place."
//
// He is describing a failure he has already seen. The search centres on where
// the pins are, so with three pins on the map it centres on three pins — and
// then recommends hotels around a place that happens to be the first thing
// anyone saved. It looks like an answer and it is an accident.
//
// Five is the floor. Below it a single pin moves the centre by more than a
// city; at five, one outlier cannot decide where the journey sleeps. It is
// also the same number of places the list itself proposes, which makes it a
// number that can be explained rather than defended.

export const MIN_PINS = 5;

export interface Readiness {
  ready: boolean;
  /** How many more are needed. Zero once ready. */
  need: number;
  /** What to say instead of a list of hotels. Null once ready. */
  note: string | null;
}

export function readiness(placed: number): Readiness {
  const have = Math.max(0, Math.trunc(placed));
  if (have >= MIN_PINS) return { ready: true, need: 0, note: null };
  const need = MIN_PINS - have;
  const note = have === 0
    ? `Add some places to the map first. Where to stay is worked out from where you are going.`
    : `${need} more ${need === 1 ? "place" : "places"} first. With ${have} on the map it is too early to say where the nights should go.`;
  return { ready: false, need, note };
}
