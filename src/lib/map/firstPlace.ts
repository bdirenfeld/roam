/**
 * The journey's first place (7 Oct 2026, delight audit). The first place saved
 * on a journey whose map was empty used to get the same line as the fiftieth,
 * so the moment the map stopped being empty went by unnoticed. That save now
 * reads "Your first place for Irving." and keeps its second sentence, which is
 * still what to do next. Every door that saves to the map (map search, Find,
 * the week's map) words it here, so they match.
 *
 * "First" is read from the journey's own cards at the moment of saving, never
 * from the device: a card with a place that has a pin counts, saved or on a day.
 */

/** The line every map-search save ends with: still what to do next. */
export const PIN_TO_DAY = "Tap its pin to put it on a day.";

type Placed = { place?: { lat?: number | null; lng?: number | null } | null };

/** True when any card already has a place with a pin (saved or on a day). */
export function hasPlacedCard(cards: readonly Placed[]): boolean {
  return cards.some((c) => c.place != null && c.place.lat != null && c.place.lng != null);
}

/** The town the journey is named for: the first comma-part of its destination. */
export function townOf(destination: string | null | undefined): string | null {
  const town = (destination ?? "").split(",")[0].trim();
  return town || null;
}

/**
 * The first save's line, or null when this is not the first (or the journey
 * has no destination to name): the door then says what it always said.
 */
export function firstPlaceLine(opts: { hadPlaces: boolean; destination: string | null | undefined; next?: string }): string | null {
  if (opts.hadPlaces) return null;
  const town = townOf(opts.destination);
  if (!town) return null;
  return `Your first place for ${town}. ${opts.next ?? PIN_TO_DAY}`;
}
