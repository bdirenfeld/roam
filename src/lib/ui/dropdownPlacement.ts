/**
 * Where a field's suggestion list goes so it can be seen (2 Oct 2026).
 *
 * Brennan, on the phone's Plan a journey: "the keyboard is so high that you
 * can't see that it's giving you a suggestion of the place below it unless
 * you scroll down." The list hung below the Destination field, and with the
 * keyboard up the space below the field is mostly keyboard.
 *
 * `view` is what is actually visible: `window.visualViewport` (it shrinks for
 * the keyboard; offsetTop is how far the browser has panned), in the same
 * layout-viewport coordinates as getBoundingClientRect. The list goes below
 * when there is room for about four rows there (or more room than above),
 * otherwise above the field, and it is never taller than the room it has.
 */

export interface FieldBox { top: number; bottom: number }
export interface VisibleBox { offsetTop: number; height: number }
export interface Placement { side: "below" | "above"; maxHeight: number }

const GAP = 4;
const MIN = 96;   // never squeeze it to nothing: about one and a half rows
const WANT = 220; // about four suggestion rows

export function dropdownPlacement(field: FieldBox, view: VisibleBox): Placement {
  const below = view.offsetTop + view.height - field.bottom - GAP * 2;
  const above = field.top - view.offsetTop - GAP * 2;
  if (below >= WANT || below >= above) return { side: "below", maxHeight: Math.max(MIN, Math.round(below)) };
  return { side: "above", maxHeight: Math.max(MIN, Math.round(above)) };
}

export const DROPDOWN_GAP = GAP;
