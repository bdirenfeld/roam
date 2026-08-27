"use client";

import type { Day } from "@/types/database";

/**
 * The day list the bottom sheet slides over itself. One overlay serves every
 * day-choosing action (assign, move, copy) — they differ only in the heading
 * and what happens on tap, so a third near-identical copy of this markup would
 * be pure duplication.
 *
 * `currentDayId` is the day the card already sits on: it renders disabled and
 * marked "current" so a move/copy can't be a no-op. Omit it (assign, where the
 * card has no day yet) and every day stays tappable.
 */
export default function DayPickerOverlay({
  title,
  days,
  currentDayId = null,
  onSelect,
  onClose,
}: {
  title: string;
  days: Day[];
  currentDayId?: string | null;
  onSelect: (day: Day) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 bg-white rounded-t-2xl flex flex-col">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
        <h3 className="text-[16px] font-bold text-gray-900">{title}</h3>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="overflow-y-auto flex-1">
        {days.map((day) => {
          const isCurrent = currentDayId != null && day.id === currentDayId;
          return (
            <button
              key={day.id}
              onClick={() => onSelect(day)}
              disabled={isCurrent}
              className={`w-full flex items-center gap-3 px-5 py-4 border-b border-gray-50 transition-colors text-left ${isCurrent ? "opacity-40 cursor-default" : "hover:bg-gray-50 active:bg-gray-100"}`}
            >
              <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center flex-shrink-0">
                <span className="text-[12px] font-bold text-activity">{day.day_number}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-gray-900">
                  Day {day.day_number}{day.day_name ? ` — ${day.day_name}` : ""}
                  {isCurrent && <span className="ml-2 text-[11px] text-gray-400 font-normal">current</span>}
                </p>
                {day.date && (
                  <p className="text-[12px] text-gray-400">
                    {new Date(day.date + "T00:00:00").toLocaleDateString("en-US", {
                      weekday: "short", month: "short", day: "numeric",
                    })}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
