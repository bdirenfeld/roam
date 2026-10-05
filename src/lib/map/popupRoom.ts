/**
 * Desktop pin popup room (5 Oct 2026): the popup opens ABOVE its pin, so a
 * pin near the top of the map put the popup's top (photo, title, ✕) off the
 * map. Instead of flipping it, the map slides down just far enough.
 *
 * Returns how many pixels the pins should move down: 0 when the popup fits,
 * never so far that the pin itself leaves the bottom of the map.
 */
export function popupPanY(popupTop: number, mapTop: number, anchorY: number, mapBottom: number, margin = 8): number {
  const need = mapTop + margin - popupTop;
  if (need <= 0) return 0;
  const cap = mapBottom - margin - 24 - anchorY;
  return Math.max(0, Math.min(Math.ceil(need), Math.floor(cap)));
}
