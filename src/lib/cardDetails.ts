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
