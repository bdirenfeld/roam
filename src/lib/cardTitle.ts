/**
 * A card's name, the one the row, the sheet and the delete toast all use
 * (6 Oct 2026, delight audit). The place's title, else the card's own title,
 * else the start of its note, else "A note" (was "(untitled note)", which read
 * like a database row).
 */
type TitledCard = {
  place?: { title?: string | null } | null;
  details?: unknown;
};

export const UNTITLED_NOTE = "A note";

export function cardTitle(card: TitledCard | null | undefined): string {
  const det = (card?.details ?? null) as Record<string, unknown> | null;
  const place = card?.place ?? null;
  const own = typeof det?.title === "string" && det.title.trim() ? det.title : null;
  const note = !place && typeof det?.notes === "string" && det.notes.trim() ? det.notes.slice(0, 60) : null;
  return (place?.title && place.title.trim() ? place.title : null) ?? own ?? note ?? UNTITLED_NOTE;
}

/**
 * The delete toast: "Deleted Uffizi Gallery" rather than "Card deleted"
 * (6 Oct 2026, delight audit). Long names are cut so the pill stays one line
 * beside its Undo.
 */
export function deletedToast(card: TitledCard | null | undefined): string {
  // Mid-sentence an untitled note is "a note", as the week board says it.
  const own = cardTitle(card);
  const t = own === UNTITLED_NOTE ? "a note" : own;
  return `Deleted ${t.length > 40 ? t.slice(0, 39).trimEnd() + "…" : t}`;
}
