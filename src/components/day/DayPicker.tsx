"use client";

import { useState, useEffect, useRef } from "react";
import { CaretDown } from "@phosphor-icons/react";
import type { Day } from "@/types/database";

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

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full border border-[rgba(26,26,46,0.12)] bg-[rgba(26,26,46,0.025)] px-3 py-1.5 text-[12px] font-medium text-activity hover:bg-[rgba(26,26,46,0.05)] transition-colors"
        style={{ letterSpacing: "-0.005em" }}
      >
        <span>{label}</span>
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 120ms",
            color: "rgba(26,26,46,0.55)",
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
            className={`absolute top-[calc(100%+10px)] z-50 rounded-xl border border-[rgba(26,26,46,0.12)] bg-[#FAF7F2] p-3 ${
              align === "center" ? "left-1/2 -translate-x-1/2" : "left-0"
            }`}
            style={{
              width: 280,
              // Clamp to the viewport with a small margin — never wider than the
              // screen, never past an edge. Uses the CSS min() function directly,
              // no calc wrapper.
              maxWidth: "min(280px, 100vw - 24px)",
              maxHeight: 296,
              overflowY: "auto",
              boxShadow: "0 8px 28px rgba(26,26,46,0.08), 0 0 0 1px rgba(26,26,46,0.03)",
            }}
          >
            <div className="mt-1 flex flex-col gap-0.5">
              {days.map((d) => {
                const dt = new Date(d.date + "T00:00:00");
                const dow = dt.toLocaleDateString("en-GB", { weekday: "short" });
                const dayNum = dt.getDate();
                // en-US, matching DayHeaderCell and the week bars. en-GB
                // abbreviates September as "Sept", which put "4 Sept" in this
                // popover directly above a bar reading "4–5 Sep".
                const monthName = dt.toLocaleDateString("en-US", { month: "short" });
                const on = mode === "active" && d.id === activeDayId;
                return (
                  <button
                    key={d.id}
                    ref={on ? activeRowRef : null}
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      onSelect(d);
                    }}
                    className="flex items-center gap-3.5 w-full px-2.5 py-2 rounded-md text-left"
                    style={{
                      background: on ? "#fff" : "transparent",
                      boxShadow: on ? "0 0 0 1px rgba(26,26,46,0.12)" : "none",
                    }}
                  >
                    <span
                      className="font-display italic text-[22px] w-8 text-center"
                      style={{
                        color: on ? "#1A1A2E" : "rgba(26,26,46,0.55)",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {dayNum}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[13px] font-medium text-activity"
                        style={{ letterSpacing: "-0.005em" }}
                      >
                        {dow}, {dayNum} {monthName}
                      </div>
                      <div className="text-[11px] mt-px" style={{ color: "rgba(26,26,46,0.55)" }}>
                        Day {d.day_number}
                      </div>
                    </div>
                    {foldedDayIds?.has(d.id) && (
                      <span
                        style={{
                          fontSize: "8.5px",
                          fontWeight: 600,
                          letterSpacing: "0.09em",
                          textTransform: "uppercase",
                          color: "#C4622D",
                        }}
                      >
                        Collapsed
                      </span>
                    )}
                    {on && <div className="w-1 h-1 rounded-full bg-activity" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
