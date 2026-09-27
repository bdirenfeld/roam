"use client";

import { useState, useEffect, useRef } from "react";
import { CaretDown } from "@phosphor-icons/react";
import type { Day } from "@/types/database";
import { monthGrids } from "@/lib/week/tripCalendar";

interface Props {
  days: Day[];
  onSelect: (day: Day) => void;
  /** "active" — trigger reads "Day N of M", the current row is marked and scrolled
   *  into view on open (requires activeDayId). "jump" — trigger reads "Jump to day",
   *  no active row, opens at the top. */
  mode: "active" | "jump";
  /** Required for mode="active". Ignored in mode="jump". */
  activeDayId?: string;
  /** Popover side. "center" anchors the popover to the trigger's centre. */
  align?: "left" | "center";
  /** Desktop Plan board only. Days inside a collapsed week are still listed —
   *  the picker is what guarantees such a day stays reachable — and marked
   *  COLLAPSED so the jump's extra step is not a surprise. */
  foldedDayIds?: Set<string>;
}

// Shared day-picker chip + popover. Extracted from DayViewClient so the Plan
// board (desktop masthead + mobile day-nav header) and Day view all drive one
// implementation. Two behaviours added during extraction: the popover is bounded
// (max-height + internal scroll) so a long trip can't run off the viewport, and
// in mode="active" the current row scrolls into view when the popover opens.
export default function DayPicker({ days, onSelect, mode, activeDayId, align = "left", foldedDayIds }: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const activeRowRef = useRef<HTMLButtonElement>(null);

  // Escape closes the popover and returns focus to the trigger.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // On open in active mode, bring the current day into view (e.g. Day 12 of 14
  // shouldn't land at the top of the list).
  useEffect(() => {
    if (open && mode === "active") {
      activeRowRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [open, mode]);

  // Single-day trips: no picker at all — matches the mobile dot-row guard.
  if (days.length <= 1) return null;

  const activeIndex = activeDayId ? days.findIndex((d) => d.id === activeDayId) : -1;
  const label = mode === "active" ? `Day ${activeIndex + 1} of ${days.length}` : "Jump to day";

  // Local calendar date (not toISOString, which flips near midnight in UTC).
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const todayDay = days.find((d) => d.date === todayStr) ?? null;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full border border-[rgba(26,26,46,0.14)] bg-white px-3 py-1.5 text-[12px] font-medium text-activity hover:bg-[rgba(26,26,46,0.03)] transition-colors"
        style={{ letterSpacing: "-0.005em" }}
      >
        <span>{label}</span>
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 120ms",
            color: "rgba(26,26,46,0.62)",
          }}
        >
          <CaretDown size={11} weight="light" />
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className={`absolute top-[calc(100%+10px)] z-50 rounded-xl border border-[rgba(26,26,46,0.12)] bg-white p-3 ${
              align === "center" ? "left-1/2 -translate-x-1/2" : "left-0"
            }`}
            style={{
              width: 280,
              // Clamp to the viewport with a small margin — never wider than the
              // screen, never past an edge. Uses the CSS min() function directly,
              // no calc wrapper.
              maxWidth: "min(280px, 100vw - 24px)",
              maxHeight: 380,
              overflowY: "auto",
              boxShadow: "0 8px 28px rgba(26,26,46,0.08), 0 0 0 1px rgba(26,26,46,0.03)",
            }}
          >
            {todayDay && todayDay.id !== activeDayId && (
              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSelect(todayDay);
                }}
                className="w-full mb-1 px-2.5 py-2 rounded-md text-left text-[12px] font-semibold text-white"
                style={{ background: "#1A1A2E" }}
              >
                Jump to today · Day {todayDay.day_number}
              </button>
            )}
            {/* A calendar, not a list (27 Sep 2026): on a two-month summer the
                list was 62 rows, and the phone was otherwise swipe after swipe.
                One tap on the chip, one on a date. */}
            {monthGrids(days).map((m) => (
              <div key={m.key} className="mt-2 first:mt-1">
                <p className="text-[12px] font-semibold text-activity mb-1.5 px-0.5">{m.label}</p>
                <div className="grid grid-cols-7 gap-0.5 text-[10px] mb-0.5" style={{ color: "rgba(26,26,46,0.45)" }}>
                  {["M", "T", "W", "T", "F", "S", "S"].map((l, i) => <span key={i} className="text-center">{l}</span>)}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {m.weeks.flat().map((c, i) => {
                    if (!c) return <span key={i} />;
                    const n = +c.date.slice(8, 10);
                    const d = c.dayId ? days.find((x) => x.id === c.dayId) : undefined;
                    if (!d) return <span key={i} className="h-9 flex items-center justify-center text-[12px]" style={{ color: "rgba(26,26,46,0.25)" }}>{n}</span>;
                    const on = mode === "active" && d.id === activeDayId;
                    const today = d.date === todayStr;
                    return (
                      <button
                        key={i}
                        ref={on ? activeRowRef : null}
                        role="menuitem"
                        aria-label={`Day ${d.day_number}, ${new Date(d.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}`}
                        title={foldedDayIds?.has(d.id) ? "In a collapsed week" : undefined}
                        onClick={() => { setOpen(false); onSelect(d); }}
                        className="h-9 rounded-lg text-[13px] font-medium transition-colors"
                        style={{
                          background: on ? "#1A1A2E" : "#F3EFE4",
                          color: on ? "#fff" : "#1A1A2E",
                          boxShadow: today && !on ? "inset 0 0 0 1.5px #D18A2E" : "none",
                        }}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
