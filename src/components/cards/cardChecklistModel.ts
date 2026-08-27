// ── Card checklist — the model ────────────────────────────────────────────
// One checklist per card, the Trello shape: "AirBnB Checklist 0/11" is a card
// holding its own list, not a line in a trip-wide notes file.
//
// STORAGE — the card's existing `details` jsonb, under `checklist`:
//   details.checklist = [{ id, text, done }, ...]
// No table, no migration, no column. Array order IS display order, so a
// reorder is a write of the same array in a different sequence.
//
// Everything a caller reads goes through readChecklist, because `details` is
// free-form jsonb: rows written by an importer, an older build, or by hand can
// hold anything at all. A malformed entry is dropped rather than rendered —
// a checklist that throws is worse than a checklist that is one item shorter.

import type { CardDetails, ChecklistItem } from "@/types/database";

// Ids for items created in this session. Kept out of the item text so a
// rename never has to touch identity, and short enough to stay readable in the
// jsonb when someone inspects a row.
let seq = 0;
export function newChecklistItemId(): string {
  seq += 1;
  return `ck-${Date.now().toString(36)}-${seq}`;
}

export function makeChecklistItem(text: string): ChecklistItem {
  return { id: newChecklistItemId(), text, done: false };
}

/**
 * The checklist on a card, or null when the card has never had one.
 *
 * null and [] are different answers and the UI treats them differently: null
 * offers "Add a checklist", [] shows the empty list the writer just made. So a
 * missing key stays null, while a present-but-unusable value reads as [] —
 * something was there, we just can't show any of it.
 */
export function readChecklist(details: CardDetails | null | undefined): ChecklistItem[] | null {
  const raw = (details as Record<string, unknown> | null | undefined)?.checklist;
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) return [];

  const out: ChecklistItem[] = [];
  raw.forEach((entry, i) => {
    if (typeof entry !== "object" || entry === null) return;
    const row = entry as Record<string, unknown>;
    if (typeof row.text !== "string") return; // nothing to show
    out.push({
      // An id written by something other than this file may be missing or the
      // wrong type. Fall back to the position, which is unique within the list.
      id: typeof row.id === "string" && row.id !== "" ? row.id : `ck-legacy-${i}`,
      text: row.text,
      done: row.done === true,
    });
  });
  return out;
}

/** x of y, for the badge. Returns null when there is nothing to count. */
export function checklistProgress(
  details: CardDetails | null | undefined,
): { done: number; total: number } | null {
  const items = readChecklist(details);
  if (!items || items.length === 0) return null;
  return { done: items.filter((i) => i.done).length, total: items.length };
}

// ── Mutations ─────────────────────────────────────────────────────────────
// All pure: take the list, return a new one. The panel holds the result and
// hands it to the card's save plumbing.

export function toggleChecklistItem(items: ChecklistItem[], id: string): ChecklistItem[] {
  return items.map((item) => (item.id === id ? { ...item, done: !item.done } : item));
}

export function renameChecklistItem(
  items: ChecklistItem[],
  id: string,
  text: string,
): ChecklistItem[] {
  return items.map((item) => (item.id === id ? { ...item, text } : item));
}

export function removeChecklistItem(items: ChecklistItem[], id: string): ChecklistItem[] {
  return items.filter((item) => item.id !== id);
}

/** `anchorId === null` appends; otherwise the new item lands just below it. */
export function insertChecklistItem(
  items: ChecklistItem[],
  anchorId: string | null,
  item: ChecklistItem,
): ChecklistItem[] {
  if (anchorId === null) return [...items, item];
  const at = items.findIndex((i) => i.id === anchorId);
  if (at < 0) return [...items, item];
  return [...items.slice(0, at + 1), item, ...items.slice(at + 1)];
}
