/**
 * A card with its `details` guaranteed to be an object (27 Sep 2026). Cards
 * written by SQL (the Japan test journey, three on Tuscany, three on New York)
 * had `details` null, and the card sheet read `details.reservation_status` —
 * tapping any of them showed "Application error". The column now defaults to
 * {} and the nulls were filled; this keeps an old or offline copy safe too.
 */
export function withDetails<T extends { details?: unknown }>(card: T): T & { details: NonNullable<T["details"]> } {
  return (card.details && typeof card.details === "object" ? card : { ...card, details: {} }) as T & { details: NonNullable<T["details"]> };
}

/**
 * A list-shaped `details` key (`flow`, `what_to_bring`, `tips`) as a string
 * array, whatever was stored (19 Nov 2026). 21 imported cards on Australia,
 * Costa Rica and Rome had `flow` saved as one string; the activity sheet
 * called `.map` on it and tapping Luna Park or Featherdale showed "Something
 * went wrong". A string becomes one step per line; anything else is dropped.
 */
export function toStringList(value: unknown): string[] {
  const items = Array.isArray(value)
    ? value.map((v) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : ""))
    : typeof value === "string" ? value.split(/\r?\n/) : [];
  return items.map((s) => s.trim()).filter(Boolean);
}
