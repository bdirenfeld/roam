// ── Journey notes — the model ─────────────────────────────────────────────
// The UI is a checklist; the column is still one string. This module is the
// only place that knows both, so the panel above it never has to think about
// markdown and the database never has to learn a schema.
//
// STORAGE (unchanged, `trips.notes`, one nullable text column):
//   "- [ ] "  / "- [x] "  → a checklist item
//   "## "                 → a section heading
//   anything else         → a plain line
//
// The round trip is deliberately conservative. A line this parser recognises
// is re-emitted in canonical form (so "-  [X]  Pack" tidies itself up). A line
// it does NOT recognise is carried on the item as `raw` and written back byte
// for byte — a legacy note someone typed as prose is never rewritten by a UI
// that didn't understand it. Editing such a line is the one thing that clears
// `raw`, because at that point the new text IS the line.
//
// Blank lines are spacing, not content: they are dropped on the way in and one
// is re-inserted before each heading on the way out. Nothing a reader would
// call content can be lost that way.

export type NoteItemKind = "task" | "section" | "text";

export interface NoteItem {
  /** Stable for the life of the panel — React keys and dnd-kit ids. */
  id: string;
  kind: NoteItemKind;
  /** What the row shows and what an edit replaces. */
  text: string;
  /** Meaningful on "task" only. */
  done: boolean;
  /**
   * Only ever set on "text" items: the source line exactly as it was read.
   * Serialized verbatim until the item is edited.
   */
  raw?: string;
}

const TASK_RE = /^\s*-\s\[([ xX])\]\s?(.*)$/;
const SECTION_RE = /^\s*##\s+(.*)$/;

// Ids for items the writer creates in this session. Parsed items take their id
// from their line number instead, so the first render is identical on the
// server and on the client and hydration has nothing to argue about.
let seq = 0;
export function newItemId(): string {
  seq += 1;
  return `new-${seq}`;
}

export function parseNotes(raw: string): NoteItem[] {
  const out: NoteItem[] = [];
  raw.split("\n").forEach((line, index) => {
    if (line.trim() === "") return; // spacing, not content
    const id = `line-${index}`;

    const section = SECTION_RE.exec(line);
    if (section) {
      out.push({ id, kind: "section", text: section[1].trim(), done: false });
      return;
    }

    const task = TASK_RE.exec(line);
    if (task) {
      out.push({
        id,
        kind: "task",
        text: task[2].trim(),
        done: task[1].toLowerCase() === "x",
      });
      return;
    }

    // Not a shape this parser knows. Keep the line itself, not our reading of it.
    out.push({ id, kind: "text", text: line.trim(), done: false, raw: line });
  });
  return out;
}

export function serializeNotes(items: NoteItem[]): string {
  const lines: string[] = [];
  items.forEach((item, i) => {
    switch (item.kind) {
      case "section":
        if (i > 0) lines.push(""); // one breath before a heading
        lines.push(`## ${item.text}`);
        break;
      case "task":
        lines.push(`- [${item.done ? "x" : " "}] ${item.text}`);
        break;
      default:
        lines.push(item.raw ?? item.text);
    }
  });
  return lines.join("\n");
}

// ── Mutations ─────────────────────────────────────────────────────────────
// All pure: take the list, return a new one. The panel holds the result.

export function toggleItem(items: NoteItem[], id: string): NoteItem[] {
  return items.map((item) =>
    item.id === id && item.kind === "task" ? { ...item, done: !item.done } : item,
  );
}

/** Renaming settles the line: whatever `raw` was preserving is now superseded. */
export function renameItem(items: NoteItem[], id: string, text: string): NoteItem[] {
  return items.map((item) =>
    item.id === id ? { ...item, text, raw: undefined } : item,
  );
}

export function removeItem(items: NoteItem[], id: string): NoteItem[] {
  return items.filter((item) => item.id !== id);
}

/** `anchorId === null` appends; otherwise the new item lands just below it. */
export function insertItem(
  items: NoteItem[],
  anchorId: string | null,
  item: NoteItem,
): NoteItem[] {
  if (anchorId === null) return [...items, item];
  const at = items.findIndex((i) => i.id === anchorId);
  if (at < 0) return [...items, item];
  return [...items.slice(0, at + 1), item, ...items.slice(at + 1)];
}

export function makeItem(kind: NoteItemKind, text: string): NoteItem {
  return { id: newItemId(), kind, text, done: false };
}
