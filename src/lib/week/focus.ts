/**
 * The week's columns (26 Sep 2026). Normally every day shares the width. With
 * a day in focus it takes the room and the others shrink to strips that still
 * show the shape of their day, so the week zooms into a day and back out on
 * one screen. Every track is written out (never repeat()) so the browser can
 * animate from one layout to the other.
 */
export const STRIP_W = 34;
export const FOCUS_MIN = 360;

export function weekColumns(hoursW: number, nDays: number, colMin: number, focusIdx: number): string {
  const tracks = Array.from({ length: nDays }, (_, i) =>
    focusIdx < 0 ? `minmax(${colMin}px, 1fr)` : i === focusIdx ? `minmax(${FOCUS_MIN}px, 1fr)` : `minmax(${STRIP_W}px, 0fr)`,
  );
  return `${hoursW}px ${tracks.join(" ")}`;
}

/** The narrowest the week can be before it scrolls sideways. */
export function weekMinWidth(hoursW: number, nDays: number, colMin: number, focusIdx: number): number {
  if (focusIdx < 0) return hoursW + nDays * colMin;
  return hoursW + FOCUS_MIN + (nDays - 1) * STRIP_W;
}
