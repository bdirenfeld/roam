// ── Attachment count on a card ────────────────────────────────────────────
// Trello shows a paperclip and a number on the card face; to draw it, the card
// queries have to know how many rows `card_attachments` holds for each card.
//
// The server pages embed `card_attachments ( id )` and this collapses the
// embedded rows into a single number, dropping the array. PostgREST also
// speaks an aggregate form — `card_attachments(count)` — but this project runs
// with aggregate functions disabled (any real aggregate answers PGRST123, "Use
// of aggregate functions is not allowed"), so the id embed is the form that is
// actually verified to work here. Attachments per card are few, so the extra
// rows cost nothing worth naming.

import type { Card } from "@/types/database";

/**
 * Turn one raw card row from a `card_attachments ( id )` embed into a Card
 * carrying `attachment_count`. The embedded array is removed rather than
 * carried along — nothing downstream reads it, and it would otherwise ride
 * every card through the client payload.
 *
 * The Supabase clients are untyped, so the row arrives as `unknown`-ish; a
 * missing or malformed embed reads as zero rather than throwing.
 */
export function withAttachmentCount(row: unknown): Card {
  const { card_attachments, ...card } = (row ?? {}) as Record<string, unknown>;
  return {
    ...card,
    attachment_count: Array.isArray(card_attachments) ? card_attachments.length : 0,
  } as Card;
}
