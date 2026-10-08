// ── Where the one toast sits on a phone (7 Oct 2026, phone harness) ──────
// The toast lives at bottom-24 on a phone, just above the BottomNav. With a
// bottom sheet open that is the sheet's footer: "Car: booked · Undo" sat on
// top of "Book 2 on Kayak" in the Bookings sheet. So while a sheet is open the
// toast stands just above the sheet's top edge, over the dimmed page, and when
// the sheet is too tall to leave room (the card sheet is 95dvh) it goes to the
// top of the screen, where only the sheet's drag handle is.
//
// Controls that ride ABOVE a sheet count too (7 Oct 2026, Brennan: "if you delete
// a pin from a map ... the legend at the bottom disappears"). The Map's Filter /
// Plan my trip / Find row sits 12px above Find's half sheet, and the Filter's
// pill rows grow up from it — exactly where the toast stood, so "Removed from
// the map · Undo" covered the row for six seconds. Such a control is marked
// `data-toast-clear` and its top edge is `clearTop`; the toast stands above it.
//
// Pure: Toast.tsx finds the open sheet's top edge and the toast's own height;
// this decides. `null` = leave the CSS default (bottom-24 on a phone, under
// the masthead from md up, where sheets are centred and never at the bottom).

export const TOAST_GAP = 8;
/** bottom-24: the phone default, clear of the BottomNav. */
export const TOAST_PHONE_BOTTOM = 96;
const MD = 768;

export type ToastPlacement = { bottom: number } | { top: number } | null;

export function toastPlacement(p: {
  viewportW: number;
  viewportH: number;
  /** Top edge of the open bottom sheet in px from the viewport top, or null for none. */
  sheetTop: number | null;
  /** The toast's own height in px. */
  toastH: number;
  /** Top edge of the highest control the toast must not cover (`data-toast-clear`), or null. */
  clearTop?: number | null;
}): ToastPlacement {
  if (p.viewportW >= MD) return null;
  // A control low enough to sit under the usual place changes nothing.
  const lift = p.clearTop != null && p.viewportH - p.clearTop + TOAST_GAP > TOAST_PHONE_BOTTOM ? p.clearTop : null;
  const edge = lift == null ? p.sheetTop : p.sheetTop == null ? lift : Math.min(p.sheetTop, lift);
  if (edge == null) return null;
  const bottom = Math.max(TOAST_PHONE_BOTTOM, p.viewportH - edge + TOAST_GAP);
  // No room above the sheet: the top of the screen, never off it.
  if (bottom + p.toastH + TOAST_GAP > p.viewportH) return { top: TOAST_GAP };
  return { bottom };
}
