"use client";

// ── Card checklist ────────────────────────────────────────────────────────
// The Trello card checklist, in the card's own detail sheet: "AirBnB Checklist
// 0/11", "DO NOT FORGET! 20/37", "Packing List". One list per card, in the
// context the list is about.
//
// The interaction is the one already approved on the journey notes panel
// (components/trip/JourneyNotes), deliberately, so there is one way to work a
// checklist in this app rather than two: tap the box or the row to tick, tap
// the words to fix them, Enter carries on to the next line, "+ Add an item"
// keeps offering the next input, drag the grip to reorder.
//
// STORAGE — the card's `details` jsonb under `checklist`. See
// ./cardChecklistModel for the shape and for how a malformed row is dropped
// rather than rendered.
//
// SAVING — this panel owns the list and hands the WHOLE array back through the
// sheet's ordinary details save. Ticks, adds, deletes and reorders go
// immediately; text edits settle after a beat, and a pending one is flushed on
// unmount so closing the sheet mid-keystroke still writes.

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, DotsSixVertical, Plus, X } from "@phosphor-icons/react";
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ChecklistItem } from "@/types/database";
import {
  insertChecklistItem,
  makeChecklistItem,
  removeChecklistItem,
  renameChecklistItem,
  toggleChecklistItem,
} from "./cardChecklistModel";
import { SectionLabel } from "./detail/FieldRow";

const INK = "#1A1A2E";
const DONE_INK = "rgba(26,26,46,0.35)";
const PARCHMENT = "#FAF7F2";
const HAIRLINE = "1px solid rgba(26,26,46,0.09)";

/** Text edits settle; everything else saves on the spot. Matches JourneyNotes. */
const SAVE_DEBOUNCE_MS = 600;

interface Props {
  /** null when the card has never had a checklist — see the model. */
  items: ChecklistItem[] | null;
  /** Writes the whole array to `details.checklist`. Absent = guest view. */
  onSave?: (items: ChecklistItem[]) => void;
}

export default function CardChecklist({ items: incoming, onSave }: Props) {
  const readOnly = !onSave;

  // The panel owns the list while it is open. `incoming` seeds it and, because
  // the sheet reverts `details` when a write is refused, re-seeds it if a save
  // is rolled back — but only when the two have actually diverged, so a
  // round-tripped save never yanks the row being typed into.
  const [items, setItems] = useState<ChecklistItem[]>(incoming ?? []);
  const [started, setStarted] = useState(incoming !== null);

  const itemsRef = useRef(items);
  const latest = useRef<ChecklistItem[] | null>(null); // set only when unsaved
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; });

  // Which row is open for editing, and the text being typed into it.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // The add row, once it has been tapped open. Mirrored into refs because the
  // add button and the composer's own blur can fire in either order: whoever
  // runs second must see what the first one already did.
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerDraft, setComposerDraft] = useState("");
  const [composerAnchor, setComposerAnchor] = useState<string | null>(null);
  const composerInput = useRef<HTMLInputElement>(null);
  const composerOpenRef = useRef(false);
  const composerDraftRef = useRef("");
  const composerAnchorRef = useRef<string | null>(null);

  const putComposer = useCallback((open: boolean, anchorId: string | null) => {
    composerOpenRef.current = open;
    composerAnchorRef.current = anchorId;
    setComposerOpen(open);
    setComposerAnchor(anchorId);
  }, []);
  const putComposerDraft = useCallback((next: string) => {
    composerDraftRef.current = next;
    setComposerDraft(next);
  }, []);

  const flush = useCallback(() => {
    if (debounce.current) { clearTimeout(debounce.current); debounce.current = null; }
    const pending = latest.current;
    if (pending === null) return;
    latest.current = null;
    onSaveRef.current?.(pending);
  }, []);

  /** The single door every change goes through: list held, array saved. */
  const applyItems = useCallback((next: ChecklistItem[], when: "now" | "soon") => {
    itemsRef.current = next;
    setItems(next);
    setStarted(true);
    latest.current = next;
    if (debounce.current) { clearTimeout(debounce.current); debounce.current = null; }
    if (when === "now") { flush(); return; }
    debounce.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }, [flush]);

  // A half-typed edit outlives the panel: closing the sheet mid-keystroke still
  // writes. Held through a ref so this runs on unmount only.
  const flushRef = useRef(flush);
  useEffect(() => { flushRef.current = flush; });
  useEffect(() => {
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
      flushRef.current();
    };
  }, []);

  // Re-seed from the card when the card's own copy disagrees with ours AND we
  // have nothing in flight — i.e. an optimistic write was rolled back, or the
  // sheet was handed a different card.
  useEffect(() => {
    if (latest.current !== null) return;
    const mine = itemsRef.current;
    const theirs = incoming ?? [];
    const same =
      mine.length === theirs.length &&
      mine.every((m, i) =>
        m.id === theirs[i].id && m.text === theirs[i].text && m.done === theirs[i].done,
      );
    if (same) return;
    itemsRef.current = theirs;
    setItems(theirs);
    setStarted(incoming !== null);
  }, [incoming]);

  // ── Rows ────────────────────────────────────────────────────────────────
  const handleToggle = useCallback((id: string) => {
    applyItems(toggleChecklistItem(itemsRef.current, id), "now");
  }, [applyItems]);

  const handleDelete = useCallback((id: string) => {
    if (editingId === id) setEditingId(null);
    // The composer was hanging off this row; it has nowhere to be now.
    if (composerAnchorRef.current === id) putComposer(false, null);
    applyItems(removeChecklistItem(itemsRef.current, id), "now");
  }, [applyItems, editingId, putComposer]);

  const startEdit = useCallback((item: ChecklistItem) => {
    putComposer(false, null);
    setDraft(item.text);
    setEditingId(item.id);
  }, [putComposer]);

  /**
   * Settle the row being edited. Emptied text removes the row — an item with
   * nothing in it is not an item. Returns whether the row survived, which is
   * what tells Enter whether there is anything to carry on from.
   */
  const commitEdit = useCallback((id: string, value: string): boolean => {
    setEditingId(null);
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item) return false;

    const trimmed = value.trim();
    if (trimmed === "") {
      applyItems(removeChecklistItem(itemsRef.current, id), "now");
      return false;
    }
    if (trimmed !== item.text) {
      applyItems(renameChecklistItem(itemsRef.current, id, trimmed), "soon");
    }
    return true;
  }, [applyItems]);

  // ── The add row ─────────────────────────────────────────────────────────
  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => {
      const el = composerInput.current;
      if (!el) return;
      el.focus();
      el.scrollIntoView({ block: "nearest" });
    });
  }, []);

  const openComposer = useCallback((anchorId: string | null) => {
    setEditingId(null);
    putComposerDraft("");
    putComposer(true, anchorId);
    focusComposer();
  }, [focusComposer, putComposer, putComposerDraft]);

  const closeComposer = useCallback(() => {
    putComposer(false, null);
    putComposerDraft("");
  }, [putComposer, putComposerDraft]);

  /** Adds what's typed and immediately offers the next line, Trello-style. */
  const submitComposer = useCallback(() => {
    if (!composerOpenRef.current) return;
    const trimmed = composerDraftRef.current.trim();
    if (trimmed === "") { closeComposer(); return; }

    const item = makeChecklistItem(trimmed);
    const next = insertChecklistItem(itemsRef.current, composerAnchorRef.current, item);
    applyItems(next, "now");
    putComposerDraft("");
    // Adding at the end keeps the input in the bottom slot, where it hasn't
    // moved; adding mid-list walks it down one row.
    const atEnd = next[next.length - 1]?.id === item.id;
    putComposer(true, atEnd ? null : item.id);
    focusComposer();
  }, [applyItems, closeComposer, focusComposer, putComposer, putComposerDraft]);

  /** Enter carries on: commit this row, then offer the next one below it. */
  const handleRowEnter = useCallback((item: ChecklistItem) => {
    if (!commitEdit(item.id, draft)) return; // emptied — the run ends here
    const list = itemsRef.current;
    const atEnd = list[list.length - 1]?.id === item.id;
    openComposer(atEnd ? null : item.id);
  }, [commitEdit, draft, openComposer]);

  // ── Reordering ──────────────────────────────────────────────────────────
  const canReorder = !readOnly && items.length > 1;
  const sensors = useSensors(
    // Touch: hold briefly before dragging, so a tap stays a tap and a swipe
    // across the sheet still belongs to the sheet.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const list = itemsRef.current;
    const from = list.findIndex((i) => i.id === active.id);
    const to = list.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    applyItems(arrayMove(list, from, to), "now");
  }, [applyItems]);

  // ── Render ──────────────────────────────────────────────────────────────

  // A card with no checklist says so once, quietly. An empty panel with an
  // "Add an item" row would claim every card is a checklist card; most aren't.
  if (!started) {
    if (readOnly) return null;
    // Labelled like every other section in the sheet. Without the label this
    // read as a stray grey link at the bottom of a long scroll — present in
    // the DOM, invisible in practice.
    return (
      <div className="mb-5 pb-4 border-b border-gray-100">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em] mb-2">
          Checklist
        </p>
        <button
          type="button"
          onClick={() => { setStarted(true); openComposer(null); }}
          className="flex items-center gap-2 text-[13px] text-gray-600 hover:text-gray-900 transition-colors"
        >
          <span className="w-[18px] h-[18px] rounded-[5px] border border-gray-300 flex items-center justify-center flex-shrink-0">
            <Check size={10} weight="bold" className="text-gray-400" />
          </span>
          Add a checklist
        </button>
      </div>
    );
  }

  // A guest with an empty list has nothing to read; say nothing at all.
  if (readOnly && items.length === 0) return null;

  const done = items.filter((i) => i.done).length;
  const complete = items.length > 0 && done === items.length;

  const composerNode = composerOpen ? (
    <div key="composer" className="flex items-start gap-1.5 py-[3px]">
      <RowInput
        inputRef={composerInput}
        value={composerDraft}
        placeholder="Add an item"
        onChange={putComposerDraft}
        onEnter={submitComposer}
        onEscape={closeComposer}
        onBlur={() => { submitComposer(); putComposer(false, null); }}
      />
    </div>
  ) : null;

  const rows: React.ReactNode[] = [];
  items.forEach((item) => {
    rows.push(
      <ChecklistRow
        key={item.id}
        item={item}
        readOnly={readOnly}
        canReorder={canReorder}
        editing={editingId === item.id}
        draft={draft}
        onDraftChange={setDraft}
        onStartEdit={() => startEdit(item)}
        onToggle={() => handleToggle(item.id)}
        onDelete={() => handleDelete(item.id)}
        onEnter={() => handleRowEnter(item)}
        onEscape={() => setEditingId(null)}
        onBlur={() => commitEdit(item.id, draft)}
      />,
    );
    if (composerAnchor === item.id && composerNode) rows.push(composerNode);
  });
  if (composerAnchor === null && composerNode) rows.push(composerNode);

  return (
    <div className="mb-5 pb-4 border-b border-gray-100">
      {/* Heading and the count, on one line — the same x/y the card face shows,
          so the badge outside and the panel inside are visibly one fact. */}
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <SectionLabel>Checklist</SectionLabel>
        {items.length > 0 && (
          <span
            className="text-[10px] font-bold tracking-[0.08em] -mt-3"
            style={{ color: complete ? "#3F5D33" : "rgba(26,26,46,0.4)", fontFeatureSettings: '"tnum"' }}
          >
            {done}/{items.length}
          </span>
        )}
      </div>

      <div className="rounded-xl px-3.5 pt-3 pb-1" style={{ background: PARCHMENT, border: HAIRLINE }}>
        {/* Every row goes through the same context, guests included:
            ChecklistRow calls useSortable unconditionally (hooks don't take
            sides), and the drag is switched off per row instead. */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {rows}
          </SortableContext>
        </DndContext>

        {/* The list's open door. `onMouseDown` keeps the click alive: without
            it the open composer blurs, the row it occupied collapses, and
            mouse-up lands somewhere else entirely. */}
        {!readOnly && (
          <div className="pt-1 pb-2">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => openComposer(null)}
              className="flex items-center gap-1.5 py-1 text-[13.5px] font-medium transition-colors hover:text-[#1A1A2E]"
              style={{ color: "rgba(26,26,46,0.55)" }}
            >
              <Plus size={13} weight="bold" />
              Add an item
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── One row ───────────────────────────────────────────────────────────────
// A checkbox with a thumb-sized target, the words, and a delete that keeps out
// of the way. The words are their own button — tapping them edits; tapping the
// rest of the row ticks the box, which is the thing a checklist is for.
function ChecklistRow({
  item,
  readOnly,
  canReorder,
  editing,
  draft,
  onDraftChange,
  onStartEdit,
  onToggle,
  onDelete,
  onEnter,
  onEscape,
  onBlur,
}: {
  item: ChecklistItem;
  readOnly: boolean;
  canReorder: boolean;
  editing: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onStartEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onEnter: () => void;
  onEscape: () => void;
  onBlur: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: !canReorder || editing });

  // Ticked text stays exactly where it was and loses its ink — the list keeps
  // its shape as it empties, so "what's left" is read by contrast, not by
  // hunting for what moved.
  const textStyle: React.CSSProperties = {
    color: item.done ? DONE_INK : INK,
    fontSize: 14,
    lineHeight: 1.6,
    textDecoration: item.done ? "line-through" : "none",
  };

  // Faint but present on touch; out of sight on desktop until the row is under
  // the cursor. Nothing here is ever load-bearing enough to shout.
  const quiet =
    "transition-opacity opacity-40 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100";

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
      }}
      className="group flex items-start gap-1.5 py-[3px] rounded-md"
    >
      {canReorder && (
        <button
          {...attributes}
          {...listeners}
          type="button"
          aria-label={`Reorder ${item.text || "item"}`}
          className={`flex-shrink-0 w-[17px] h-6 -ml-1 flex items-center justify-center touch-none cursor-grab active:cursor-grabbing ${quiet}`}
          style={{ color: "rgba(26,26,46,0.3)" }}
        >
          <DotsSixVertical size={13} weight="bold" />
        </button>
      )}

      <button
        type="button"
        role="checkbox"
        aria-checked={item.done}
        aria-label={item.text}
        disabled={readOnly}
        onClick={onToggle}
        className="flex-shrink-0 w-6 h-6 -ml-1 flex items-center justify-center rounded-md active:bg-[rgba(26,26,46,0.06)] transition-colors"
      >
        <span
          className="w-[15px] h-[15px] rounded-[4px] flex items-center justify-center transition-colors"
          style={{
            borderWidth: 1.4,
            borderStyle: "solid",
            borderColor: item.done ? INK : "rgba(26,26,46,0.3)",
            background: item.done ? INK : "transparent",
          }}
        >
          {item.done && <Check size={10} weight="bold" color={PARCHMENT} />}
        </span>
      </button>

      {editing ? (
        <RowInput
          value={draft}
          placeholder="Item"
          onChange={onDraftChange}
          onEnter={onEnter}
          onEscape={onEscape}
          onBlur={onBlur}
        />
      ) : readOnly ? (
        <span className="pt-[1px]" style={textStyle}>{item.text}</span>
      ) : (
        <>
          <button
            type="button"
            onClick={onStartEdit}
            className="text-left pt-[1px] rounded-sm hover:bg-[rgba(26,26,46,0.035)] transition-colors"
            style={textStyle}
          >
            {item.text}
          </button>
          {/* The rest of the row belongs to the checkbox. Keyboard users have
              the real one two elements to the left, so this stays out of the
              tab order rather than duplicating it. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={onToggle}
            className="flex-1 self-stretch min-w-[8px] cursor-default"
          />
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${item.text || "item"}`}
            className={`flex-shrink-0 w-6 h-6 -mr-1 flex items-center justify-center rounded-md ${quiet}`}
            style={{ color: "rgba(26,26,46,0.4)" }}
          >
            <X size={12} weight="bold" />
          </button>
        </>
      )}
    </div>
  );
}

// ── The one input, wherever a line is being written ───────────────────────
function RowInput({
  value,
  placeholder,
  onChange,
  onEnter,
  onEscape,
  onBlur,
  inputRef,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  onEscape: () => void;
  onBlur: () => void;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  const own = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? own;

  // Has the text now in the box already been dealt with? Enter and Escape say
  // yes, so the blur that follows doesn't commit the same line twice; typing
  // says no again. Kept here rather than in the panel because it is a fact
  // about THIS box — a shared flag would let one input swallow another's blur.
  const handled = useRef(false);

  // Open with the caret after what's already written, so editing appends
  // rather than threatening to replace.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    // Mount only: re-running would drag the caret back on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <input
      ref={ref}
      type="text"
      value={value}
      spellCheck
      enterKeyHint="enter"
      aria-label={placeholder}
      placeholder={placeholder}
      onChange={(e) => { handled.current = false; onChange(e.target.value); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); handled.current = true; onEnter(); }
        else if (e.key === "Escape") { e.preventDefault(); handled.current = true; onEscape(); }
      }}
      onBlur={() => { if (handled.current) return; onBlur(); }}
      className="flex-1 min-w-0 bg-transparent outline-none border-b py-[1px] placeholder:text-[rgba(26,26,46,0.3)]"
      style={{
        color: INK,
        borderColor: "rgba(26,26,46,0.22)",
        fontSize: 14,
        lineHeight: 1.6,
      }}
    />
  );
}
