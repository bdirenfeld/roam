"use client";

// ── Journey notes ─────────────────────────────────────────────────────────
// The journey facts that belong to no single day: the villa gate code, what to
// pack, who's driving, whose passport still needs renewing.
//
// This is a checklist you touch directly — a Trello checklist, not a text file.
// Tap a box to tick it, tap the words to fix them, "+ Add an item" to write the
// next one. There is no edit mode, no markdown, no syntax to remember: the
// formatting characters exist in the column and nowhere the writer can see.
//
// STORAGE — still ONE string in `trips.notes`. The panel holds a parsed list,
// mutates it, and serializes the whole thing back on every change. See
// ./journeyNotesModel for the format and, more importantly, for how a line the
// parser doesn't recognise is carried through untouched.
//
// SAVING — text edits settle after a beat; a tick, an add, a delete and a
// reorder go immediately, because those are the ones a writer would be
// startled to lose. A pending save survives the panel closing.
//
// Notes travel with the journey: any guest it's shared with reads them
// (readOnly renders the same checklist with every affordance removed). They
// arrive with the page payload — the server pages already `select("*")` from
// trips — so they are there offline like the rest of the day view.

import { useCallback, useEffect, useRef, useState } from "react";
import { useSheetDrag as useSharedSheetDrag } from "@/hooks/useSheetDrag";
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
import { createClient } from "@/lib/supabase/client";
import {
  insertItem,
  makeItem,
  parseNotes,
  removeItem,
  renameItem,
  serializeNotes,
  toggleItem,
  type NoteItem,
  type NoteItemKind,
} from "./journeyNotesModel";

const INK = "#1A1A2E";
const PARCHMENT = "#FAF7F2";
const PARCHMENT_CLEAR = "rgba(250,247,242,0)";
const HAIRLINE = "1px solid rgba(26,26,46,0.09)";
const DONE_INK = "rgba(26,26,46,0.35)";

/** Text edits settle; everything else saves on the spot. */
const SAVE_DEBOUNCE_MS = 600;

/**
 * How tall the list is allowed to get before it starts scrolling inside
 * itself. Forty items should not push the rest of the settings page into
 * next week — but a short list still takes only the room it needs.
 */
const INLINE_LIST_MAX = "min(46vh, 420px)";

/**
 * Where this panel is standing.
 *
 * "inline"  — a section of a page that keeps scrolling past it, so the list
 *             caps itself and scrolls internally.
 * "sheet"   — JourneyNotesSheet, which is already a scroll area of its own;
 *             the panel fills it rather than nesting a second scroller.
 *
 * Either way the add row sits OUTSIDE the scrolling part, pinned under it, so
 * the fortieth item never puts "+ Add an item" out of reach.
 */
export type JourneyNotesHost = "inline" | "sheet";

interface Props {
  tripId: string;
  /** Server-fetched with the trip, so notes work offline like the day view. */
  initialNotes: string | null;
  /** Guest view — a plain checklist, no editing. */
  readOnly?: boolean;
  /** Lets a host keep its own copy fresh so a re-opened sheet isn't stale. */
  onNotesChange?: (notes: string) => void;
  className?: string;
  /** Defaults to the page case; the sheet passes its own. */
  host?: JourneyNotesHost;
}

/**
 * Watches the scrolling part of the panel so the edges can say "there's more".
 * Measures the content wrapper too — a list grows without the box around it
 * changing size, and that growth is exactly what we need to notice.
 */
function useListEdges() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ overflowing: false, atTop: true, atBottom: true });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const measure = () => {
      const slack = el.scrollHeight - el.clientHeight;
      setEdges({
        overflowing: slack > 2,
        atTop: el.scrollTop <= 2,
        atBottom: slack <= 2 || el.scrollTop >= slack - 2,
      });
    };

    measure();
    el.addEventListener("scroll", measure, { passive: true });

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
      if (contentRef.current) ro.observe(contentRef.current);
    }

    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, []);

  return { scrollRef, contentRef, ...edges };
}

type SaveState = "idle" | "saving" | "saved" | "error";

/** Where the next new item will land, and what kind it will be. */
type Composer = { anchorId: string | null; kind: NoteItemKind };

export default function JourneyNotes({
  tripId,
  initialNotes,
  readOnly = false,
  onNotesChange,
  className = "",
  host = "inline",
}: Props) {
  const supabase = createClient();
  const inline = host === "inline";
  const edges = useListEdges();

  const [items, setItems] = useState<NoteItem[]>(() => parseNotes(initialNotes ?? ""));
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Which row is open for editing, and the text being typed into it.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // The add row, once it has been tapped open. Mirrored into refs because the
  // add buttons and the composer's own blur can fire in either order: whoever
  // runs second must see what the first one already did, not the render it was
  // created in. Everything below goes through putComposer/putComposerDraft so
  // the ref and the state can never disagree.
  const [composer, setComposer] = useState<Composer | null>(null);
  const [composerDraft, setComposerDraft] = useState("");
  const composerInput = useRef<HTMLInputElement>(null);
  const composerRef = useRef<Composer | null>(null);
  const composerDraftRef = useRef("");

  const putComposer = useCallback((next: Composer | null) => {
    composerRef.current = next;
    setComposer(next);
  }, []);
  const putComposerDraft = useCallback((next: string) => {
    composerDraftRef.current = next;
    setComposerDraft(next);
  }, []);

  // The list as of this instant. Every handler reads this rather than `items`,
  // so two quick taps can't be computed from the same stale snapshot.
  const itemsRef = useRef(items);

  // latest = what the writer has done; saved = what the row already holds.
  // Every save closes the gap between them, so an edit made mid-flight is
  // written by the loop below rather than lost.
  const latest = useRef(initialNotes ?? "");
  const saved = useRef(initialNotes ?? "");
  const inFlight = useRef(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onNotesChange);
  useEffect(() => { onChangeRef.current = onNotesChange; }, [onNotesChange]);

  const flush = useCallback(async () => {
    if (debounce.current) { clearTimeout(debounce.current); debounce.current = null; }
    if (inFlight.current) return;
    if (latest.current === saved.current) return;

    inFlight.current = true;
    setSaveState("saving");
    while (latest.current !== saved.current) {
      const attempt = latest.current;
      const { error } = await supabase
        .from("trips")
        .update({ notes: attempt.trim() === "" ? null : attempt })
        .eq("id", tripId);
      if (error) {
        console.error("[Roam] Saving journey notes failed:", error);
        inFlight.current = false;
        setSaveState("error");
        return;
      }
      saved.current = attempt;
    }
    inFlight.current = false;
    setSaveState("saved");
    onChangeRef.current?.(saved.current);
  }, [supabase, tripId]);

  // "Saved" is a confirmation, not a status — it retires itself.
  useEffect(() => {
    if (saveState !== "saved") return;
    const t = setTimeout(() => setSaveState("idle"), 1800);
    return () => clearTimeout(t);
  }, [saveState]);

  // A pending edit outlives the panel: closing the sheet mid-keystroke still
  // writes. Held through a ref so this runs on unmount only — never on a
  // re-render that happened to hand back a new `flush`.
  const flushRef = useRef(flush);
  useEffect(() => { flushRef.current = flush; });
  useEffect(() => {
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
      if (latest.current !== saved.current) void flushRef.current();
    };
  }, []);

  /** The single door every change goes through: list in, list held, string saved. */
  const applyItems = useCallback((next: NoteItem[], when: "now" | "soon") => {
    itemsRef.current = next;
    setItems(next);
    latest.current = serializeNotes(next);
    if (debounce.current) { clearTimeout(debounce.current); debounce.current = null; }
    if (when === "now") { void flush(); return; }
    debounce.current = setTimeout(() => { void flush(); }, SAVE_DEBOUNCE_MS);
  }, [flush]);

  // ── Rows ────────────────────────────────────────────────────────────────
  const handleToggle = useCallback((id: string) => {
    applyItems(toggleItem(itemsRef.current, id), "now");
  }, [applyItems]);

  const handleDelete = useCallback((id: string) => {
    if (editingId === id) setEditingId(null);
    // The composer was hanging off this row; it has nowhere to be now.
    if (composerRef.current?.anchorId === id) putComposer(null);
    applyItems(removeItem(itemsRef.current, id), "now");
  }, [applyItems, editingId, putComposer]);

  const startEdit = useCallback((item: NoteItem) => {
    putComposer(null);
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
      applyItems(removeItem(itemsRef.current, id), "now");
      return false;
    }
    if (trimmed !== item.text) {
      applyItems(renameItem(itemsRef.current, id, trimmed), "soon");
    }
    return true;
  }, [applyItems]);

  // ── The add row ─────────────────────────────────────────────────────────

  /** Put the caret in the composer and make sure the composer is on screen. */
  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => {
      const el = composerInput.current;
      if (!el) return;
      el.focus();
      el.scrollIntoView({ block: "nearest" });
    });
  }, []);

  const openComposer = useCallback((anchorId: string | null, kind: NoteItemKind) => {
    setEditingId(null);
    putComposerDraft("");
    putComposer({ anchorId, kind });
  }, [putComposer, putComposerDraft]);

  const closeComposer = useCallback(() => {
    putComposer(null);
    putComposerDraft("");
  }, [putComposer, putComposerDraft]);

  /** Adds what's typed and immediately offers the next line, Trello-style. */
  const submitComposer = useCallback(() => {
    const open = composerRef.current;
    if (!open) return;
    const trimmed = composerDraftRef.current.trim();
    if (trimmed === "") { closeComposer(); return; }

    const item = makeItem(open.kind, trimmed);
    const next = insertItem(itemsRef.current, open.anchorId, item);
    applyItems(next, "now");
    putComposerDraft("");
    // Adding at the end keeps the input in the bottom slot, where it hasn't
    // moved; adding mid-list walks it down one row.
    const atEnd = next[next.length - 1]?.id === item.id;
    putComposer({ anchorId: atEnd ? null : item.id, kind: open.kind });
    focusComposer();
  }, [applyItems, closeComposer, focusComposer, putComposer, putComposerDraft]);

  /**
   * Land whatever is half-typed, without offering another line. This is what
   * lets the two add buttons stay live while a composer is open: switching
   * from writing an item to naming a section keeps the item you'd typed. If a
   * blur already banked it, the draft ref is empty and this adds nothing —
   * which is the whole reason it reads refs and not the render's copy.
   */
  const settleComposer = useCallback(() => {
    const open = composerRef.current;
    const trimmed = composerDraftRef.current.trim();
    if (open && trimmed !== "") {
      const item = makeItem(open.kind, trimmed);
      applyItems(insertItem(itemsRef.current, open.anchorId, item), "now");
    }
    putComposer(null);
    putComposerDraft("");
  }, [applyItems, putComposer, putComposerDraft]);

  /**
   * The add row, either button. Both stay reachable whatever else is open —
   * starting a list must never be the thing that hides "Add section".
   */
  const handleAdd = useCallback((kind: NoteItemKind) => {
    settleComposer();
    setEditingId(null);
    putComposerDraft("");
    putComposer({ anchorId: null, kind });
    focusComposer();
  }, [focusComposer, putComposer, putComposerDraft, settleComposer]);

  /** Enter carries on: commit this row, then offer the next one below it. */
  const handleRowEnter = useCallback((item: NoteItem) => {
    if (!commitEdit(item.id, draft)) return; // emptied — the run ends here
    const list = itemsRef.current;
    const atEnd = list[list.length - 1]?.id === item.id;
    openComposer(atEnd ? null : item.id, "task");
  }, [commitEdit, draft, openComposer]);

  // ── Reordering ──────────────────────────────────────────────────────────
  const canReorder = !readOnly && items.length > 1;
  const sensors = useSensors(
    // Touch: hold briefly before dragging, so a tap stays a tap and a swipe
    // across the screen still changes days.
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
  const isEmpty = items.length === 0;

  const statusLabel =
    saveState === "saving" ? "Saving…"
    : saveState === "saved" ? "Saved"
    : saveState === "error" ? "Couldn’t save — still on this device"
    : "";

  // The composer is a place to write, not a row that exists yet: no decorative
  // checkbox to sit behind, and the caret starts flush with the left edge the
  // rows themselves start from.
  const composerNode = composer ? (
    <div key="composer" className="flex items-start gap-1.5 py-[3px]">
      <RowInput
        inputRef={composerInput}
        value={composerDraft}
        section={composer.kind === "section"}
        placeholder={composer.kind === "section" ? "Section name" : "Add an item"}
        onChange={putComposerDraft}
        onEnter={submitComposer}
        onEscape={closeComposer}
        onBlur={() => { submitComposer(); putComposer(null); }}
      />
    </div>
  ) : null;

  const rows: React.ReactNode[] = [];
  items.forEach((item, i) => {
    rows.push(
      <NoteRow
        key={item.id}
        item={item}
        first={i === 0}
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
    if (composer?.anchorId === item.id && composerNode) rows.push(composerNode);
  });
  if (composer?.anchorId === null && composerNode) rows.push(composerNode);

  return (
    <div className={`${className} ${inline ? "" : "flex flex-col min-h-0 flex-1"}`}>
      {/* Status only — there is no edit mode left to enter. Space is reserved
          so the panel below never jumps when "Saving…" comes and goes. */}
      {!readOnly && (
        <div className="flex items-center pb-2 min-h-[22px] flex-shrink-0">
          <span
            className="font-display italic text-[11px] transition-opacity duration-200"
            style={{
              color: saveState === "error" ? "#B45309" : "rgba(26,26,46,0.4)",
              opacity: statusLabel ? 1 : 0,
            }}
            aria-live="polite"
          >
            {statusLabel}
          </span>
        </div>
      )}

      {/* The panel is two parts: a list that scrolls, and an add row that
          doesn't. Forty items scroll past under a fixed door. */}
      <div
        className={`rounded-xl overflow-hidden flex flex-col min-h-0 ${inline ? "" : "flex-1"}`}
        style={{ background: PARCHMENT, border: HAIRLINE }}
      >
        <div className={`relative min-h-0 ${inline ? "" : "flex-1"}`}>
          <div
            ref={edges.scrollRef}
            className={`h-full overflow-y-auto overscroll-contain px-3.5 pt-3 ${readOnly ? "pb-3" : "pb-1"}`}
            style={inline ? { maxHeight: INLINE_LIST_MAX } : undefined}
          >
            <div ref={edges.contentRef}>
              {isEmpty && !composer && (
                <p
                  className="font-display italic text-[15px]"
                  style={{ color: "rgba(26,26,46,0.5)", paddingBottom: readOnly ? 0 : 4 }}
                >
                  Nothing noted yet.
                </p>
              )}

              {/* Every row goes through the same context, guests included:
                  NoteRow calls useSortable unconditionally (hooks don't take
                  sides), and the drag is switched off per row instead. */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={items.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {rows}
                </SortableContext>
              </DndContext>
            </div>
          </div>

          {/* The list fading under its own edge is the whole message: there is
              more this way. Nothing here is clickable. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-5 transition-opacity duration-150"
            style={{
              opacity: edges.atTop ? 0 : 1,
              background: `linear-gradient(to bottom, ${PARCHMENT}, ${PARCHMENT_CLEAR})`,
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-5 transition-opacity duration-150"
            style={{
              opacity: edges.atBottom ? 0 : 1,
              background: `linear-gradient(to top, ${PARCHMENT}, ${PARCHMENT_CLEAR})`,
            }}
          />
        </div>

        {/* The list's open door — always both halves of it, always outside the
            scroller. Writing an item must never be the thing that hides "Add
            section", and the fortieth item must never push either out of
            reach. `onMouseDown` keeps the click alive: without it the open
            composer blurs, the row it occupied collapses, and mouse-up lands
            somewhere else entirely. */}
        {!readOnly && (
          <div
            className="flex-shrink-0 flex items-center gap-3 px-3.5 pt-2 pb-3"
            style={{ borderTop: edges.overflowing ? HAIRLINE : "1px solid transparent" }}
          >
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleAdd("task")}
              className="flex items-center gap-1.5 py-1 text-[13.5px] font-medium transition-colors hover:text-[#1A1A2E]"
              style={{ color: "rgba(26,26,46,0.55)" }}
            >
              <Plus size={13} weight="bold" />
              Add an item
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleAdd("section")}
              className="py-1 text-[12.5px] transition-colors hover:text-[rgba(26,26,46,0.7)]"
              style={{ color: "rgba(26,26,46,0.38)" }}
            >
              Add section
            </button>
          </div>
        )}
      </div>

      <p
        className="mt-2.5 text-[11px] leading-[1.6] flex-shrink-0"
        style={{ color: "rgba(26,26,46,0.4)" }}
      >
        {readOnly
          ? "Notes from the traveller who shared this journey."
          : "Guests can see these."}
      </p>
    </div>
  );
}

// ── One row ───────────────────────────────────────────────────────────────
// A checkbox with a thumb-sized target, the words, and a delete that keeps out
// of the way. The words are their own button — tapping them edits; tapping the
// rest of the row ticks the box, which is the thing a checklist is for.
function NoteRow({
  item,
  first,
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
  item: NoteItem;
  /** A heading gets air above it — but not against the top of the panel. */
  first: boolean;
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

  const isSection = item.kind === "section";
  const isTask = item.kind === "task";

  const textStyle: React.CSSProperties = isSection
    ? {
        color: "rgba(26,26,46,0.4)",
        fontSize: 10.5,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
      }
    : {
        color: isTask && item.done ? DONE_INK : INK,
        fontSize: 14,
        lineHeight: 1.6,
        textDecoration: isTask && item.done ? "line-through" : "none",
      };

  // Faint but present on touch; out of sight on desktop until the row is under
  // the cursor. Nothing here is ever load-bearing enough to shout.
  const quiet =
    "transition-opacity opacity-40 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100";

  // A heading opens a group, so it gets air and a rule above it — otherwise an
  // item and a section that happen to share a word ("TEST" over "TEST") read as
  // one line rendered twice at two sizes, and two headings in a row read as a
  // gap rather than as two groups. Not against the top of the panel, though:
  // the first line in the list has nothing to be divided from.
  const opensGroup = isSection && !first;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        marginTop: opensGroup ? 14 : 0,
        paddingTop: opensGroup ? 9 : undefined,
        borderTop: opensGroup ? HAIRLINE : undefined,
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

      {isTask ? (
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
      ) : item.kind === "text" ? (
        // Keeps a plain line shoulder to shoulder with the ticked ones
        <span className="flex-shrink-0 w-5" aria-hidden />
      ) : null}

      {editing ? (
        <RowInput
          value={draft}
          section={isSection}
          placeholder={isSection ? "Section name" : "Item"}
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
          {isTask ? (
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              onClick={onToggle}
              className="flex-1 self-stretch min-w-[8px] cursor-default"
            />
          ) : (
            <span className="flex-1" aria-hidden />
          )}
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
  section,
  placeholder,
  onChange,
  onEnter,
  onEscape,
  onBlur,
  inputRef,
}: {
  value: string;
  section: boolean;
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
        fontSize: section ? 12 : 14,
        lineHeight: 1.6,
        fontWeight: section ? 600 : 400,
        letterSpacing: section ? "0.06em" : undefined,
      }}
    />
  );
}

// ── Sheet (mobile) / modal (desktop) ──────────────────────────────────────
// The app's standard sheet chrome and swipe-down gesture — same numbers as
// trips/YearView's useSheetDrag and plan/DocumentsSheet. Kept local so the
// notes panel travels as one file.
// Now the shared hook: bound to the whole sheet (below), with the scroll-at-top
// guard so the notes list still scrolls, and touchcancel so an interrupted
// drag springs back instead of freezing the sheet.
function useSheetDrag(onClose: () => void) {
  return useSharedSheetDrag(onClose, undefined, { mobileOnly: true });
}

export function JourneyNotesSheet({
  tripId,
  initialNotes,
  readOnly = false,
  onNotesChange,
  onClose,
}: Props & { onClose: () => void }) {
  const drag = useSheetDrag(onClose);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose} />
      <div
        ref={drag.sheetRef}
        onTouchStart={drag.onTouchStart}
        onTouchMove={drag.onTouchMove}
        onTouchEnd={drag.onTouchEnd}
        onTouchCancel={drag.onTouchCancel}
        role="dialog"
        aria-label="Journey notes"
        className="fixed z-[60] bg-white flex flex-col bottom-0 left-0 right-0 rounded-t-2xl max-w-mobile mx-auto md:bottom-auto md:top-1/2 md:left-1/2 md:right-auto md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:w-[460px] md:max-w-[calc(100vw-48px)] md:mx-0"
        style={{ maxHeight: "88vh", willChange: "transform" }}
      >
        {/* The whole sheet carries the swipe-down gesture (bound on the root
            above; mobile only — the hook no-ops at md+, where this renders as
            a modal). The handle is a hint, not the only grip. */}
        <div className="flex-shrink-0">
          <div className="flex justify-center pt-3 pb-1 md:hidden">
            <div className="w-9 h-1 bg-gray-200 rounded-full" />
          </div>
          <p className="text-center font-display italic text-base text-gray-900 pt-1 pb-3 md:pt-5">
            Journey notes
          </p>
        </div>

        {/* The sheet no longer scrolls as a whole: the notes list inside it
            does, so the add row stays pinned at the bottom of the panel rather
            than sailing off past the fold. One scroller, not two. */}
        <div className="flex-1 min-h-0 flex flex-col px-5 pb-6">
          <JourneyNotes
            tripId={tripId}
            initialNotes={initialNotes}
            readOnly={readOnly}
            onNotesChange={onNotesChange}
            host="sheet"
          />
        </div>
      </div>
    </>
  );
}
