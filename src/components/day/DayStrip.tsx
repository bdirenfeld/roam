"use client";

import { useRef, useEffect } from "react";
import type { Day } from "@/types/database";

interface Props {
  days: Day[];
  activeDayId: string;
  tripId: string;
  onDaySelect: (day: Day) => void;
}

// Whether a date is today
function isToday(dateStr: string): boolean {
  const today = new Date();
  const d = new Date(dateStr + "T00:00:00");
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth()    === today.getMonth()    &&
    d.getDate()     === today.getDate()
  );
}

export default function DayStrip({ days, activeDayId, onDaySelect }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: "smooth",
      block:    "nearest",
      inline:   "center",
    });
  }, [activeDayId]);

  const activeIndex = days.findIndex((d) => d.id === activeDayId);
  // Progress: current day position / total days (1-based, so Day 4 of 7 = 57%)
  const progressPct = days.length > 0
    ? Math.round(((activeIndex + 1) / days.length) * 100)
    : 0;

  return (
    <div className="border-b border-gray-100 bg-white">
      {/* Scrollable tab row — relative wrapper for the right-edge fade */}
      <div className="relative">
        <div className="flex gap-1.5 px-3 py-2.5 overflow-x-auto scrollbar-none">
          {days.map((day) => {
            const isActive = day.id === activeDayId;
            const today    = isToday(day.date);

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
                <span className={`text-[11px] font-semibold whitespace-nowrap ${isActive ? "text-white" : "text-gray-700"}`}>
                  Day {day.day_number}
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
