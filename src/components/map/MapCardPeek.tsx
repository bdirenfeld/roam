"use client";

import Link from "next/link";
import type { Card, Day } from "@/types/database";

interface Props {
  card: Card;
  day: Day | undefined;
  tripId: string;
  onClose: () => void;
}

function formatTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const p = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${p}`;
}

const TYPE_ACCENT: Record<string, { dot: string; bg: string; text: string }> = {
  logistics: { dot: "bg-logistics", bg: "bg-slate-50",  text: "text-logistics" },
  activity:  { dot: "bg-activity",  bg: "bg-teal-50",   text: "text-activity"  },
  food:      { dot: "bg-food",      bg: "bg-amber-50",  text: "text-food"      },
};

const SUB_TYPE_LABEL: Record<string, string> = {
  flight_arrival:   "Flight Arrival",
  flight_departure: "Flight Departure",
  self_directed:    "Self-Directed",
  hosted:           "Guided",
  wellness:         "Wellness",
  restaurant:       "Restaurant",
  coffee_dessert:   "Coffee",
  drinks:           "Drinks",
};

export default function MapCardPeek({ card, day, tripId, onClose }: Props) {
  const accent = TYPE_ACCENT[card.type] ?? TYPE_ACCENT.logistics;
  const timeStr = formatTime(card.start_time);
  const subLabel = card.sub_type ? SUB_TYPE_LABEL[card.sub_type] ?? card.sub_type : card.type;

  const dayLabel = day
    ? `Day ${day.day_number} · ${day.day_name}`
    : null;

  return (
    <div
      className="absolute bottom-24 left-4 right-4 z-20 bg-white rounded-2xl shadow-sheet border border-gray-100 animate-in slide-in-from-bottom duration-200 overflow-hidden"
    >
      {/* Colour bar */}
      <div className={`h-0.5 w-full ${accent.dot}`} />

      <div className="p-4">
        {/* Top row: day label + close */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {dayLabel && (
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                {dayLabel}
              </span>
            )}
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${accent.bg} ${accent.text}`}>
              {subLabel}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 hover:bg-gray-200 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Title + time */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-bold text-gray-900 leading-snug flex-1 min-w-0">
            {card.title}
          </h3>
          {timeStr && (
            <span className="text-xs font-semibold text-gray-400 shrink-0 mt-0.5">{timeStr}</span>
          )}
        </div>

        {/* Address */}
        {card.address && (
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {card.address}
          </p>
        )}

        {/* CTA */}
        {day && (
          <Link
            href={`/trips/${tripId}/days/${day.id}`}
            className="mt-3 w-full flex items-center justify-center gap-1.5 bg-activity text-white text-xs font-semibold py-2.5 rounded-xl hover:opacity-90 active:scale-95 transition-all"
          >
            View Day {day.day_number}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        )}
      </div>
    </div>
  );
}
