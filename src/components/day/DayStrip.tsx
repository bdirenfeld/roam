"use client";

import { useRef, useEffect, useState } from "react";
import type { Day } from "@/types/database";

interface Props {
  days: Day[];
  activeDayId: string;
  tripId: string;
  onDaySelect: (day: Day) => void;
}

export default function DayStrip({ days, activeDayId, onDaySelect }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);

  // Client-only today key — null on SSR and first paint so the "Today" chip
  // doesn't render before hydration. Avoids the UTC-vs-local date mismatch
  // that surfaces as React #418/#422.
  const [todayKey, setTodayKey] = useState<string | null>(null);
  useEffect(() => {
    const d = new Date();
    setTodayKey(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    );
  }, []);

  // First positioning is instant: day navigation remounts this strip, so a
  // smooth scroll here replays a start-to-centre sweep on every day change —
  // the "weird refresh" feel. Animate only for in-place active-day changes.
  const hasPositioned = useRef(false);
  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: hasPositioned.current ? "smooth" : "auto",
      block:    "nearest",
      inline:   "center",
    });
    hasPositioned.current = true;
  }, [activeDayId]);

  const activeIndex = days.findIndex((d) => d.id === activeDayId);
  // Progress: current day position / total days (1-based, so Day 4 of 7 = 57%)
  const progressPct = days.length > 0
    ? Math.round(((activeIndex + 1) / days.length) * 100)
    : 0;

  return (
    <div className="border-b border-gray-100 bg-white md:hidden">
      {/* Scrollable tab row — relative wrapper for the right-edge fade */}
      <div className="relative">
        <div className="flex gap-1.5 px-3 py-2.5 overflow-x-auto scrollbar-none">
          {days.map((day) => {
            const isActive = day.id === activeDayId;
            const today    = todayKey !== null && day.date === todayKey;

            // Local-parse (…T00:00:00) → the calendar date survives every
            // timezone, so weekday + date-of-month need no client-only guard.
            // Only the is-it-today check stays behind todayKey.
            const dt      = new Date(day.date + "T00:00:00");
            const dow     = dt.toLocaleDateString("en-GB", { weekday: "short" });
            const dayNum  = dt.getDate();

            return (
              <button
                key={day.id}
                ref={isActive ? activeRef : null}
                onClick={() => onDaySelect(day)}
                className={`
                  flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl
                  transition-all duration-150 min-w-0
                  ${isActive
                    ? "bg-activity shadow-sm"
                    : "bg-gray-50 hover:bg-gray-100 active:scale-95"
                  }
                `}
              >
                <span className="flex flex-col items-start leading-none">
                  <span className={`text-[10.5px] font-semibold whitespace-nowrap ${isActive ? "text-white" : "text-gray-700"}`}>
                    {dow} {dayNum}
                  </span>
                  <span className={`text-[9px] mt-[2px] whitespace-nowrap ${isActive ? "text-white/60" : "text-gray-400"}`}>
                    Day {day.day_number}
                  </span>
                </span>

                {today && (
                  <span className={`text-[8px] font-bold uppercase tracking-wide px-1 py-px rounded ${isActive ? "bg-white/20 text-white" : "bg-activity/10 text-activity"}`}>
                    Today
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {/* Right-edge fade — signals scrollable overflow */}
        <div
          className="absolute right-0 top-0 bottom-0 w-10 pointer-events-none"
          style={{ background: "linear-gradient(to left, white, transparent)" }}
        />
      </div>

      {/* Trip progress bar — fills proportionally based on selected day */}
      <div className="h-[3px] bg-gray-100">
        <div
          className="h-full bg-activity transition-all duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
}
