/**
 * Turning a note into a real card (10 Nov 2026, prototype approved by Brennan).
 *
 * The word "Note" on a note card is a dropdown. Pick a kind, pick any place
 * from the Google search, and the note becomes that card: same time, same
 * notes, now with a place (pin, photo, hours). Drive and Train also become a
 * travel leg from last night's stay, so the car/train icon and the dashed line
 * follow without a separate step.
 *
 * Pure rules only; the sheet does the network calls.
 */

import type { LegFrom, LegMode } from "@/lib/travel/leg";

export type NoteKindKey = "note" | "activity" | "food" | "hotel" | "drive" | "train" | "flight";

export interface NoteKind {
  key: NoteKindKey;
  label: string;
  /** Material Symbols glyph for the menu row (all already in the font subset). */
  glyph: string;
  /** What the place search asks. Null for Note (no place). */
  prompt: string | null;
  /**
   * The type bulk-import files a NEW place under. Null lets the import infer it
   * from Google (Activity, Food, Drive, Train: a drive can end at a restaurant
   * or a farm, and the place should stay what it is). An existing place is
   * never re-filed: the import reuses the row as it is.
   */
  defaults: { type: "activity" | "food" | "logistics"; sub_type: string } | null;
  /** Drive and Train make the card a travel leg. */
  mode: LegMode | null;
}

export const NOTE_KINDS: NoteKind[] = [
  { key: "note",     label: "Note",     glyph: "edit_note",        prompt: null,             defaults: null, mode: null },
  { key: "activity", label: "Activity", glyph: "directions_walk",  prompt: "Which place?",   defaults: null, mode: null },
  { key: "food",     label: "Food",     glyph: "restaurant",       prompt: "Which place?",   defaults: null, mode: null },
  { key: "hotel",    label: "Hotel",    glyph: "hotel",            prompt: "Which hotel?",   defaults: { type: "logistics", sub_type: "hotel" }, mode: null },
  { key: "drive",    label: "Drive",    glyph: "directions_car",   prompt: "Where to?",      defaults: null, mode: "drive" },
  { key: "train",    label: "Train",    glyph: "train",            prompt: "Which station?", defaults: null, mode: "train" },
  { key: "flight",   label: "Flight",   glyph: "flight_land",      prompt: "Which airport?", defaults: { type: "logistics", sub_type: "flight_arrival" }, mode: null },
];

export function noteKind(key: NoteKindKey): NoteKind {
  return NOTE_KINDS.find((k) => k.key === key) ?? NOTE_KINDS[0];
}

/**
 * The card's new details once the note has a place. Notes, checklist and
 * everything else are kept. The note's own title goes: the place names the
 * card now (a leg reads "Villa Zambaldi → My Tuscan Kitchen"). Drive/Train
 * get mode + from (from only when last night's stay is known); any other kind
 * drops a stale mode/from so it is not mistaken for a leg.
 */
export function convertedDetails(
  details: Record<string, unknown> | null | undefined,
  kind: NoteKind,
  from: LegFrom | null,
): Record<string, unknown> {
  const d: Record<string, unknown> = { ...(details ?? {}) };
  delete d.title;
  delete d.named;
  if (kind.mode) {
    d.mode = kind.mode;
    if (from) d.from = from;
  } else {
    delete d.mode;
    delete d.from;
    delete d.mode_label;
  }
  return d;
}
