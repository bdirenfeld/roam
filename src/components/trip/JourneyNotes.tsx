"use client";

// ── Journey notes ─────────────────────────────────────────────────────────
// The journey facts that belong to no single day: the villa gate code, what
// to pack, who's driving, whose passport still needs renewing. Approved mock:
// a paper panel of free text lines, some with checkboxes, grouped under quiet
// small-caps section labels.
//
// STORAGE — one nullable `trips.notes` text column, plain markdown-ish text,
// ONE string. No schema for items, so a note is always human-readable and can
// be edited as a whole:
//   "- [ ] "  / "- [x] "  → a checkbox line (tapping the line toggles it)
//   "## "                 → a small-caps section label
//   anything else         → a plain line
// Toggling a checkbox rewrites only that one line of the string, so the
// surrounding prose (and anything the format doesn't understand yet) survives
// untouched.
//
// `trips.notes` isn't in the generated Database types yet, so the two calls
// that touch it cast the client — same deliberate containment as
// travel_windows in trips/YearView.tsx.
//
// Notes travel with the journey: any guest the journey is shared with reads
// them (readOnly hides every edit affordance). They arrive with the page
// payload — the server pages already `select("*")` from trips — so they are
// there offline like the rest of the day view. Nothing here fetches on mount.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const INK = "#1A1A2E";
const PARCHMENT = "#FAF7F2";
const HAIRLINE = "1px solid rgba(26,26,46,0.09)";

// ── Format ────────────────────────────────────────────────────────────────
const TASK_RE = /^\s*-\s\[([ xX])\]\s?(.*)$/;
const SECTION_RE = /^\s*##\s+(.*)$/;

export type NoteLine =
  | { kind: "section"; index: number; text: string }
  | { kind: "task"; index: number; text: string; done: boolean }
  | { kind: "text"; index: number; text: string }
  | { kind: "blank"; index: number };

export function parseNotes(raw: string): NoteLine[] {
  const lines = raw.split("\n").map<NoteLine>((line, index) => {
    const section = SECTION_RE.exec(line);
    if (section) return { kind: "section", index, text: section[1].trim() };
    const task = TASK_RE.exec(line);
    if (task) {
      return {
        kind: "task",
        index,
        text: task[2].trim(),
        done: task[1].toLowerCase() === "x",
      };
    }
    if (line.trim() === "") return { kind: "blank", index };
    return { kind: "text", index, text: line.trim() };
  });

  // Blank lines are spacing, not content: drop the leading and trailing ones
  // and collapse runs, so a stray extra newline never opens a hole in the
  // panel. The raw string keeps whatever the writer typed.
  const out: NoteLine[] = [];
  for (const line of lines) {
    if (line.kind === "blank") {
      if (out.length === 0) continue;
      if (out[out.length - 1].kind === "blank") continue;
    }
    out.push(line);
  }
  while (out.length > 0 && out[out.length - 1].kind === "blank") out.pop();
  return out;
}

/** Flip "- [ ] " ↔ "- [x] " on one line, leaving the rest of the string alone. */
export function toggleTaskLine(raw: string, index: number): string {
  const lines = raw.split("\n");
  const line = lines[index];
  if (line === undefined) return raw;
  const match = TASK_RE.exec(line);
  if (!match) return raw;
  const next = match[1].toLowerCase() === "x" ? "[ ]" : "[x]";
  lines[index] = line.replace(/\[[ xX]\]/, next);
  return lines.join("\n");
}

const PLACEHOLDER = [
  "## To sort",
  "- [ ] Renew Bodhi's passport",
  "- [ ] Book airport parking",
  "",
  "## Good to know",
  "Villa gate code 4417 · caretaker Marco",
].join("\n");

// The empty state's worked example — rendered, not raw, so the invitation
// shows what a note looks like rather than describing one.
const EXAMPLE: NoteLine[] = [
  { kind: "section", index: 0, text: "To sort" },
  { kind: "task", index: 1, text: "Book airport parking", done: false },
  { kind: "section", index: 2, text: "Good to know" },
  { kind: "text", index: 3, text: "Villa gate code 4417 · caretaker Marco" },
];

// ── Panel ─────────────────────────────────────────────────────────────────
interface Props {
  tripId: string;
  /** Server-fetched with the trip, so notes work offline like the day view. */
  initialNotes: string | null;
  /** Guest view — rendered read-only, no Edit affordance. */
  readOnly?: boolean;
  /** Lets a host keep its own copy fresh so a re-opened sheet isn't stale. */
  onNotesChange?: (notes: string) => void;
  className?: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

const SAVE_DEBOUNCE_MS = 700;

export default function JourneyNotes({
  tripId,
  initialNotes,
  readOnly = false,
  onNotesChange,
  className = "",
}: Props) {
  const supabase = createClient();

  const [text, setText] = useState(initialNotes ?? "");
  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // latest = what the writer has typed; saved = what the row already holds.
  // Every save closes the gap between them, so an edit made mid-flight is
  // written by the loop below rather than lost.
  const latest = useRef(initialNotes ?? "");
  const saved = useRef(initialNotes ?? "");
  const inFlight = useRef(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onNotesChange);
  useEffect(() => { onChangeRef.current = onNotesChange; }, [onNotesChange]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const flush = useCallback(async () => {
    if (debounce.current) { clearTimeout(debounce.current); debounce.current = null; }
    if (inFlight.current) return;
    if (latest.current === saved.current) return;

    inFlight.current = true;
    setSaveState("saving");
    while (latest.current !== saved.current) {
      const attempt = latest.current;
      // Cast: trips.notes isn't in the generated Database types yet
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
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

  // Grow the textarea to its content — no inner scrollbar to fight with.
  useEffect(() => {
    const el = textareaRef.current;
    if (!editing || !el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [editing, text]);

  const handleType = useCallback((value: string) => {
    setText(value);
    latest.current = value;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { void flush(); }, SAVE_DEBOUNCE_MS);
  }, [flush]);

  const handleToggle = useCallback((index: number) => {
    const next = toggleTaskLine(latest.current, index);
    if (next === latest.current) return;
    setText(next);
    latest.current = next;
    void flush();
  }, [flush]);

  const startEditing = useCallback(() => {
    setEditing(true);
    // Land the caret at the end of what's already written
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, []);

  const finishEditing = useCallback(() => {
    setEditing(false);
    void flush();
  }, [flush]);

  const lines = useMemo(() => parseNotes(text), [text]);
  const isEmpty = lines.length === 0;

  const statusLabel =
    saveState === "saving" ? "Saving…"
    : saveState === "saved" ? "Saved"
    : saveState === "error" ? "Couldn’t save — still on this device"
    : "";

  return (
    <div className={className}>
      {/* Control row — status on the left, the one affordance on the right.
          Suppressed on an untouched empty note: the invitation below IS the
          affordance, and an empty row above it is just a gap. */}
      {!readOnly && (editing || !isEmpty) && (
        <div className="flex items-center gap-3 pb-2 min-h-[22px]">
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
          <button
            type="button"
            onClick={editing ? finishEditing : startEditing}
            className="ml-auto text-[13px] font-medium text-[rgba(26,26,46,0.6)] hover:text-[#1A1A2E] transition-colors"
          >
            {editing ? "Done" : "Edit"}
          </button>
        </div>
      )}

      {editing ? (
        /* ── Editing — the raw text, exactly as stored ── */
        <>
          <div className="rounded-xl px-3.5 py-3" style={{ background: PARCHMENT, border: "1px solid rgba(26,26,46,0.16)" }}>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => handleType(e.target.value)}
              onBlur={() => { void flush(); }}
              placeholder={PLACEHOLDER}
              spellCheck
              // autoFocus opens the keyboard on tap-to-edit; the rAF in
              // startEditing then drops the caret at the end of the text.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className="w-full resize-none bg-transparent outline-none text-[14px] leading-[1.7] placeholder:text-[rgba(26,26,46,0.28)]"
              style={{ color: INK, minHeight: 190 }}
            />
          </div>
          <p className="mt-2 text-[11px] leading-[1.7]" style={{ color: "rgba(26,26,46,0.42)" }}>
            <code className="font-mono text-[10.5px] whitespace-pre">- [ ] task</code> makes a checkbox
            {" · "}
            <code className="font-mono text-[10.5px] whitespace-pre">## Section</code> makes a label
            {" · "}
            everything else stays a plain line.
          </p>
        </>
      ) : isEmpty ? (
        /* ── Empty ── */
        readOnly ? (
          <div className="rounded-xl px-3.5 py-4" style={{ background: PARCHMENT, border: HAIRLINE }}>
            <p className="font-display italic text-[15px]" style={{ color: "rgba(26,26,46,0.5)" }}>
              Nothing noted yet.
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="w-full text-left rounded-xl px-3.5 py-4 transition-colors hover:brightness-[0.985]"
            style={{ background: PARCHMENT, border: HAIRLINE }}
          >
            <p className="font-display italic text-[15px]" style={{ color: "rgba(26,26,46,0.55)" }}>
              Nothing noted yet.
            </p>
            <p className="mt-1.5 text-[13px] leading-[1.6]" style={{ color: "rgba(26,26,46,0.5)" }}>
              Notes hold what belongs to no single day — a gate code, what to pack,
              who&rsquo;s driving, whose passport still needs renewing.
            </p>
            <div
              className="mt-3.5 pt-3 pointer-events-none"
              style={{ borderTop: "1px solid rgba(26,26,46,0.08)", opacity: 0.45 }}
              aria-hidden
            >
              <NoteLines lines={EXAMPLE} readOnly onToggle={() => {}} />
            </div>
            <span className="mt-3 block text-[13px] font-medium" style={{ color: INK }}>
              Start a note
            </span>
          </button>
        )
      ) : (
        /* ── Rendered ── */
        <div className="rounded-xl px-3.5 py-3" style={{ background: PARCHMENT, border: HAIRLINE }}>
          <NoteLines lines={lines} readOnly={readOnly} onToggle={handleToggle} />
        </div>
      )}

      {!editing && (
        <p className="mt-2.5 text-[11px] leading-[1.6]" style={{ color: "rgba(26,26,46,0.4)" }}>
          {readOnly
            ? "Notes from the traveller who shared this journey."
            : "Free text with checkboxes. Shared with anyone you share this journey with."}
        </p>
      )}
    </div>
  );
}

// ── Line rendering ────────────────────────────────────────────────────────
function NoteLines({
  lines,
  readOnly,
  onToggle,
}: {
  lines: NoteLine[];
  readOnly: boolean;
  onToggle: (index: number) => void;
}) {
  return (
    <>
      {lines.map((line, i) => {
        switch (line.kind) {
          case "section":
            return (
              <div
                key={`s-${line.index}`}
                className="text-[10.5px] font-bold uppercase tracking-[0.12em] mb-1"
                style={{ color: "rgba(26,26,46,0.4)", marginTop: i === 0 ? 0 : 15 }}
              >
                {line.text}
              </div>
            );

          case "task": {
            const box = (
              <span
                className="mt-[4px] w-[13px] h-[13px] rounded-[3.5px] flex-shrink-0 transition-colors"
                style={{
                  borderWidth: 1.4,
                  borderStyle: "solid",
                  borderColor: line.done ? INK : "rgba(26,26,46,0.3)",
                  background: line.done ? INK : "transparent",
                }}
              />
            );
            const label = (
              <span
                className="text-[14px] leading-[1.6]"
                style={{
                  color: line.done ? "rgba(26,26,46,0.35)" : INK,
                  textDecoration: line.done ? "line-through" : "none",
                }}
              >
                {line.text}
              </span>
            );
            if (readOnly) {
              return (
                <div key={`t-${line.index}`} className="flex items-start gap-2 py-[3px]">
                  {box}
                  {label}
                </div>
              );
            }
            // The whole line is the target — a 13px box is not a thumb.
            return (
              <button
                key={`t-${line.index}`}
                type="button"
                role="checkbox"
                aria-checked={line.done}
                onClick={() => onToggle(line.index)}
                className="w-full flex items-start gap-2 py-[3px] text-left rounded-md active:bg-[rgba(26,26,46,0.04)] transition-colors"
              >
                {box}
                {label}
              </button>
            );
          }

          case "blank":
            // A section already carries its own leading space
            return lines[i + 1]?.kind === "section"
              ? null
              : <div key={`b-${line.index}`} className="h-[9px]" />;

          default:
            return (
              <p
                key={`p-${line.index}`}
                className="text-[14px] leading-[1.6] py-[3px]"
                style={{ color: INK }}
              >
                {line.text}
              </p>
            );
        }
      })}
    </>
  );
}

// ── Sheet (mobile) / modal (desktop) ──────────────────────────────────────
// The app's standard sheet chrome and swipe-down gesture — same numbers as
// trips/YearView's useSheetDrag and plan/DocumentsSheet. Kept local so the
// notes panel travels as one file.
function useSheetDrag(onClose: () => void) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragY = useRef(0);
  const dragging = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    if (typeof window !== "undefined" && window.innerWidth >= 768) return;
    dragY.current = e.touches[0].clientY;
    dragging.current = true;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current || !sheetRef.current) return;
    const dy = Math.max(0, e.touches[0].clientY - dragY.current);
    sheetRef.current.style.transform = `translateY(${dy}px)`;
    sheetRef.current.style.transition = "none";
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!dragging.current || !sheetRef.current) return;
    dragging.current = false;
    const dy = e.changedTouches[0].clientY - dragY.current;
    if (dy > 120) {
      sheetRef.current.style.transition = "transform 250ms cubic-bezier(0.32,0.72,0,1)";
      sheetRef.current.style.transform = "translateY(100%)";
      setTimeout(onClose, 240);
    } else {
      sheetRef.current.style.transition = "transform 300ms cubic-bezier(0.34,1.56,0.64,1)";
      sheetRef.current.style.transform = "translateY(0)";
    }
  };

  return { sheetRef, onTouchStart, onTouchMove, onTouchEnd };
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
        role="dialog"
        aria-label="Journey notes"
        className="fixed z-[60] bg-white flex flex-col bottom-0 left-0 right-0 rounded-t-2xl max-w-mobile mx-auto md:bottom-auto md:top-1/2 md:left-1/2 md:right-auto md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:w-[460px] md:max-w-[calc(100vw-48px)] md:mx-0"
        style={{ maxHeight: "88vh", willChange: "transform" }}
      >
        {/* Handle + title carry the swipe-down gesture (mobile only — the hook
            no-ops at md+, where this renders as a modal) */}
        <div
          className="flex-shrink-0"
          onTouchStart={drag.onTouchStart}
          onTouchMove={drag.onTouchMove}
          onTouchEnd={drag.onTouchEnd}
        >
          <div className="flex justify-center pt-3 pb-1 md:hidden">
            <div className="w-9 h-1 bg-gray-200 rounded-full" />
          </div>
          <p className="text-center font-display italic text-base text-gray-900 pt-1 pb-3 md:pt-5">
            Journey notes
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-8">
          <JourneyNotes
            tripId={tripId}
            initialNotes={initialNotes}
            readOnly={readOnly}
            onNotesChange={onNotesChange}
          />
        </div>
      </div>
    </>
  );
}
