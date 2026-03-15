"use client";

import { useRef, useEffect } from "react";
import type { Day } from "@/types/database";

interface Props {
  days: Day[];
  activeDayId: string;
  tripId: string;
  onDaySelect: (day: Day) => void;
}

// Short weekday + month/day, e.g. "Wed · Apr 22"
function formatStripDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  const month = d.toLocaleDateString("en-US", { month: "short" });
  return `${weekday} · ${month} ${d.getDate()}`;
}

// Whether a date is today
function isToday(dateStr: string): boolean {
  const today = new Date();
  const d = new Date(dateStr + "T00:00:00");
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

// Minimal position badge per narrative
const NARRATIVE_DOT: Record<string, string> = {
  intro:       "bg-blue-300",
  rising:      "bg-activity",
  climax:      "bg-food",
  denouement:  "bg-purple-300",
  departure:   "bg-gray-300",
};

export default function DayStrip({ days, activeDayId, onDaySelect }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeDayId]);

  return (
    <div className="flex gap-1.5 px-3 py-2.5 overflow-x-auto scrollbar-none border-b border-gray-100 bg-white">
      {days.map((day) => {
        const isActive = day.id === activeDayId;
        const today = isToday(day.date);
        const dotClass = day.narrative_position
          ? NARRATIVE_DOT[day.narrative_position]
          : "bg-gray-200";

        return (
          <button
            key={day.id}
            ref={isActive ? activeRef : null}
            onClick={() => onDaySelect(day)}
            className={`
              flex-shrink-0 flex flex-col items-start px-3 py-2 rounded-xl
              transition-all duration-150 min-w-0
              ${isActive
                ? "bg-activity shadow-sm"
                : "bg-gray-50 hover:bg-gray-100 active:scale-95"
              }
            `}
          >
            {/* Day number + today indicator */}
            <div className="flex items-center gap-1.5">
              <span className={`text-[9px] font-bold uppercase tracking-wider ${isActive ? "text-white/60" : "text-gray-400"}`}>
                Day {day.day_number}
              </span>
              {today && (
                <span className={`text-[8px] font-bold uppercase tracking-wide px-1 py-px rounded ${isActive ? "bg-white/20 text-white" : "bg-activity/10 text-activity"}`}>
                  Today
                </span>
              )}
            </div>

            {/* Date */}
            <span className={`text-[11px] font-semibold mt-0.5 whitespace-nowrap ${isActive ? "text-white" : "text-gray-700"}`}>
              {formatStripDate(day.date)}
            </span>

            {/* Narrative dot */}
            {day.narrative_position && (
              <div className={`mt-1.5 w-1.5 h-1.5 rounded-full ${isActive ? "bg-white/50" : dotClass}`} />
            )}
          </button>
        );
      })}
    </div>
  );
}
