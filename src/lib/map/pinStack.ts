/**
 * One stacking order for map pins, whatever was toggled last (29 Sep 2026).
 *
 * Mapbox puts a marker that is added back on top of everything, and leaves
 * the ones that never left where they were. So turning Food off and on laid
 * every food pin over the activities, and a place's pale saved pin could end
 * up over its solid planned one: pins seemed to go missing (Brennan: "it
 * kind of puts the icons behind it"). After any change the pins are put back
 * in one order: saved under planned, and otherwise the order they came in.
 */

export function stackOrder<T extends { status: string | null | undefined }>(items: T[]): T[] {
  const rank = (t: T) => (t.status === "in_itinerary" ? 1 : 0);
  return items
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i)
    .map((x) => x.t);
}

/** Re-append each element to its parent in the given order: last is on top. Elements off the map are skipped. */
export function restack(elements: HTMLElement[]): void {
  for (const el of elements) el.parentElement?.appendChild(el);
}
