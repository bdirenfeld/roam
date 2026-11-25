/**
 * Journeys on a computer is two sides (25 Nov 2026): the journeys on the left,
 * the map on the right, and a seam between them that drags, as on the week
 * (WeekBoard). These are the limits the seam keeps to, and the width at which
 * Your year has room for its 12-month strip.
 */

/** The map is never narrower than this. */
export const MAP_MIN = 380;
/** Nor are the journeys: a card's caption and its booking marks need the room. */
export const LEFT_MIN = 420;
/** Where the map's width is remembered, per browser (the week keeps its own). */
export const JOURNEYS_MAP_WIDTH_KEY = "roam.journeys.mapWidth";
/** Until it is dragged, the map takes this share of the page, in percent. */
export const MAP_SHARE = 58;

/** The map's width for a pointer `fromRight` px from the frame's right edge, kept inside both limits. */
export function clampMapWidth(frameWidth: number, fromRight: number): number {
  const max = Math.max(MAP_MIN, frameWidth - LEFT_MIN);
  return Math.round(Math.min(max, Math.max(MAP_MIN, fromRight)));
}

/** A remembered width is used only if it is a real number at or over the minimum. */
export function readMapWidth(raw: string | null): number | null {
  const v = Number(raw);
  return raw !== null && Number.isFinite(v) && v >= MAP_MIN ? v : null;
}

/**
 * Your year draws its 12-month strip from this width up, and its list of free
 * dates below it. 640px is what the strip already gets in a 768px window, the
 * narrowest it has ever been shown at.
 */
export const YEAR_STRIP_MIN = 640;

export function yearHasRoom(width: number): boolean {
  return width >= YEAR_STRIP_MIN;
}
