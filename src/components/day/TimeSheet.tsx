"use client";

// ── The quick time sheet ───────────────────────────────────────────────────
// Tap the time chip on an agenda card and this opens: a start, an end, how
// long, or Clear time. Done saves; the day
// re-sorts itself. Morning / Lunch / Afternoon / Evening came off on 6 Oct 2026:
// 3 of 306 timed cards had ever used them (taps audit; Brennan: "do we even need
// them?").
// It exists because moving a card by dragging carried its
// old time with it and put it back where it was (Brennan, Sep 2026: "it's
// going to carry the old time and screw things up"). Times are typed here,
// the way Outlook does it, and the order follows.
//
// Typed, not picked: the phone's clock dial was a spin per time. The fields
// take "230p", "2:30pm", "14:30", "9", "noon" and say what they understood
// underneath. A card with no time opens with a suggested start — the end of
// the card above — so the common case is chip, Done.

import { useEffect, useRef, useState } from "react";
import { useSheetDrag } from "@/hooks/useSheetDrag";
import { formatTimeValue } from "@/lib/formatTime";
import type { Card } from "@/types/database";

const INK = "#1A1A2E";
const STEP = 15;

/** "HH:MM:SS" or "HH:MM" from Postgres → "HH:MM"; null → "". */
function hhmm(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}
function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}
function fromMin(n: number): string {
  const c = Math.max(0, Math.min(23 * 60 + 45, n));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
}
function lengthLabel(mins: number): string {
  if (mins <= 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * What a person types → "HH:MM", or null when it isn't a time.
 * A bare hour with no am/pm reads the way a day reads: 1–6 is afternoon,
 * 7–11 is morning, 12 is noon, 13–23 is the 24-hour clock.
 */
export function parseTypedTime(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  if (s === "noon" || s === "midday") return "12:00";
  if (s === "midnight") return "00:00";
  const m = s.match(/^(\d{1,2})(?:[:.h]?(\d{2}))?(a|am|p|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const suffix = m[3]?.[0];
  if (min > 59) return null;
  if (suffix) {
    if (h < 1 || h > 12) return null;
    if (suffix === "a") h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
  } else {
    if (h > 23) return null;
    if (h >= 1 && h <= 6) h += 12;
  }
  return fromMin(h * 60 + min);
}

export default function TimeSheet({
  card,
  suggestedStart,
  onClose,
  onSave,
}: {
  card: Card;
  /** For a card with no time: where it would naturally go ("HH:MM"). */
  suggestedStart?: string | null;
  onClose: () => void;
  onSave: (start: string | null, end: string | null) => void | Promise<void>;
}) {
  const initialStart = hhmm(card.start_time) || hhmm(suggestedStart);
  const initialEnd = hhmm(card.end_time) || (!card.start_time && initialStart ? fromMin(toMin(initialStart) + 60) : "");
  const [startText, setStartText] = useState(initialStart ? formatTimeValue(initialStart) : "");
  const [endText, setEndText] = useState(initialEnd ? formatTimeValue(initialEnd) : "");
  const drag = useSheetDrag(onClose);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const title = card.place?.title ?? (card.details as { title?: string } | null)?.title ?? "This card";
  const start = parseTypedTime(startText);
  const endParsed = parseTypedTime(endText);
  const end = start && endParsed && toMin(endParsed) > toMin(start) ? endParsed : null;
  const length = start && end ? toMin(end) - toMin(start) : 0;
  const suggested = !card.start_time && !!suggestedStart && start === hhmm(suggestedStart);


  // The length the person last set (or the card had), kept while the start is
  // retyped. Measured from the live fields it shrank as the start moved:
  // lunch 12:30–1:45 moved to 1:00 became 1:00–1:45 (4 Oct 2026).
  const keptLen = useRef<number>(initialStart && initialEnd && toMin(hhmm(initialEnd)) > toMin(hhmm(initialStart)) ? toMin(hhmm(initialEnd)) - toMin(hhmm(initialStart)) : 0);
  const onStartChange = (v: string) => {
    setStartText(v);
    const s = parseTypedTime(v);
    if (s && keptLen.current > 0) setEndText(formatTimeValue(fromMin(Math.min(toMin(s) + keptLen.current, 23 * 60 + 59))));
    else if (s && endParsed && toMin(endParsed) <= toMin(s)) setEndText(formatTimeValue(fromMin(toMin(s) + 60)));
  };
  const onEndChange = (v: string) => {
    setEndText(v);
    const e = parseTypedTime(v);
    if (start && e && toMin(e) > toMin(start)) keptLen.current = toMin(e) - toMin(start);
  };
  const tidy = (v: string, set: (t: string) => void) => { const p = parseTypedTime(v); if (p) set(formatTimeValue(p)); };

  const setLength = (mins: number) => {
    if (!start) return;
    keptLen.current = Math.max(STEP, mins);
    setEndText(formatTimeValue(fromMin(toMin(start) + Math.max(STEP, mins))));
  };

  const done = async () => {
    await onSave(start, end);
    onClose();
  };
  const clear = async () => {
    await onSave(null, null);
    onClose();
  };

  // What the field understood, under it — or that it didn't. Only when it adds
  // something: "230p" → "2:30 PM" helps; "9:45 AM" under "9:45 AM" is the
  // same thing twice (6 Oct 2026, designer review).
  const readback = (text: string, parsed: string | null) => {
    if (!text.trim()) return "";
    if (!parsed) return "Try 2:30pm";
    const read = formatTimeValue(parsed);
    return text.trim().toUpperCase() === read.toUpperCase() ? "" : read;
  };

  return (
    <div
      className="fixed inset-0 z-60 flex items-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/30 animate-in fade-in duration-200" />

      <div
        ref={drag.sheetRef}
        onTouchStart={drag.onTouchStart}
        onTouchMove={drag.onTouchMove}
        onTouchEnd={drag.onTouchEnd}
        onTouchCancel={drag.onTouchCancel}
        className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ willChange: "transform", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        <div className="flex justify-center pt-2.5 flex-shrink-0">
          <div className="w-9 h-[3px] rounded-full" style={{ background: "rgba(26,26,46,0.20)" }} />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-1">
          <h2 className="font-display italic truncate" style={{ fontSize: "23px", fontWeight: 500, color: INK, letterSpacing: "-0.01em" }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 -mr-2 rounded-full flex items-center justify-center flex-shrink-0 hover:bg-[rgba(26,26,46,0.06)]"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Start · End · Length: three cells on one line, the way a calendar
            shows them. Typed, with the reading underneath. */}
        <div className="grid grid-cols-3 gap-2 px-5 pt-3">
          {[
            { label: "Start", value: startText, parsed: start, set: onStartChange, blur: () => tidy(startText, setStartText), disabled: false },
            { label: "End", value: endText, parsed: end, set: onEndChange, blur: () => tidy(endText, setEndText), disabled: !start },
          ].map((f) => (
            <label key={f.label} className="flex flex-col gap-1">
              <span className="text-[10px] uppercase" style={{ letterSpacing: "0.12em", color: "rgba(26,26,46,0.45)" }}>{f.label}</span>
              <input
                type="text"
                inputMode="text"
                autoComplete="off"
                enterKeyHint="done"
                placeholder={f.label === "Start" ? "2:30pm" : "—"}
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                onBlur={f.blur}
                onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
                disabled={f.disabled}
                aria-label={f.label}
                className="h-11 w-full rounded-xl bg-white px-2.5 text-[15px] tabular-nums disabled:opacity-40"
                style={{ color: INK, boxShadow: `inset 0 0 0 1px ${f.value.trim() && !f.parsed && !f.disabled ? "#B0541F" : "rgba(26,26,46,0.14)"}` }}
              />
              <span className="text-[10.5px] h-[14px] truncate" style={{ color: f.value.trim() && !f.parsed ? "#B0541F" : "rgba(26,26,46,0.45)" }}>
                {f.label === "Start" && suggested ? "after the card above" : f.disabled ? "" : readback(f.value, f.parsed)}
              </span>
            </label>
          ))}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase" style={{ letterSpacing: "0.12em", color: "rgba(26,26,46,0.45)" }}>Length</span>
            <div
              className="h-11 rounded-xl bg-white flex items-center justify-between px-1"
              style={{ boxShadow: "inset 0 0 0 1px rgba(26,26,46,0.14)", opacity: start ? 1 : 0.4 }}
            >
              <button type="button" aria-label="Shorter" disabled={!start || length <= STEP} onClick={() => setLength(length - STEP)} className="w-7 h-9 flex-shrink-0 rounded-full text-[18px] leading-none disabled:opacity-30" style={{ color: INK }}>−</button>
              <span className="text-[14px] tabular-nums whitespace-nowrap" style={{ color: INK }}>{lengthLabel(length)}</span>
              <button type="button" aria-label="Longer" disabled={!start} onClick={() => setLength(length + STEP)} className="w-7 h-9 flex-shrink-0 rounded-full text-[18px] leading-none disabled:opacity-30" style={{ color: INK }}>+</button>
            </div>
            <span className="h-[14px]" />
          </div>
        </div>

        <div className="px-5 pt-5 flex items-center gap-5">
          {/* Taking the time off is rare: a quiet link, away from Done, only when
              there is a time to take off. One tap clears and saves. */}
          {card.start_time && (
            <button type="button" onClick={() => void clear()} className="text-[13px] underline underline-offset-[3px] whitespace-nowrap" style={{ color: "rgba(26,26,46,0.6)" }}>
              Clear time
            </button>
          )}
          <button
            type="button"
            onClick={() => void done()}
            disabled={!!startText.trim() && !start}
            className="flex-1 h-12 rounded-full text-[15px] font-semibold active:opacity-80 disabled:opacity-40"
            style={{ background: INK, color: "#fff" }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
