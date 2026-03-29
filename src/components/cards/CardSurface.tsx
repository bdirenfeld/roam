import type { Card, CardType } from "@/types/database";
import { getMaterialIconHTML } from "@/lib/mapPins";

interface Props {
  card: Card;
  timeLabel: string;
  onTap: () => void;
}

const TYPE_COLOR: Record<CardType, { border: string; icon: string; bg: string }> = {
  logistics: { border: "border-l-logistics", icon: "text-logistics", bg: "bg-slate-50"  },
  activity:  { border: "border-l-activity",  icon: "text-activity",  bg: "bg-teal-50"  },
  food:      { border: "border-l-food",       icon: "text-food",      bg: "bg-amber-50" },
};

const SUB_TYPE_SHORT: Record<string, string> = {
  flight_arrival:   "Arrival",
  flight_departure: "Departure",
  self_directed:    "Self-directed",
  hosted:           "Guided",
  wellness:         "Wellness",
  restaurant:       "Restaurant",
  coffee_dessert:   "Coffee",
  drinks:           "Drinks",
};

function duration(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function CardSurface({ card, timeLabel, onTap }: Props) {
  const colors = TYPE_COLOR[card.type];
  const subLabel = card.sub_type ? SUB_TYPE_SHORT[card.sub_type] : null;
  const dur = duration(card.start_time, card.end_time);

  return (
    <button
      onClick={onTap}
      className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border border-gray-100 border-l-[3px] shadow-card hover:shadow-card-hover transition-all duration-150 active:scale-[0.99] mb-2.5 bg-white ${colors.border}`}
    >
      {/* Type icon — Material Symbol, currentColor inherits from text-* class */}
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${colors.bg} ${colors.icon}`}>
        {/* eslint-disable-next-line react/no-danger */}
        <div dangerouslySetInnerHTML={{ __html: getMaterialIconHTML(card.sub_type, 18) }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-gray-900 truncate leading-snug">
          {card.title}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {subLabel && (
            <span className="text-[10px] font-semibold text-gray-400">{subLabel}</span>
          )}
          {subLabel && (card.address || card.lat) && (
            <span className="text-gray-200 text-[10px]">·</span>
          )}
          {(card.address || card.lat) && (
            <span className="text-[10px] text-gray-400 flex items-center gap-0.5 truncate">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {card.address ?? "On map"}
            </span>
          )}
        </div>
      </div>

      {/* Right: time + duration */}
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        {timeLabel && (
          <span className="text-[11px] font-semibold text-gray-500">{timeLabel}</span>
        )}
        {dur && (
          <span className="text-[10px] text-gray-300 font-medium">{dur}</span>
        )}
      </div>

      {/* Chevron */}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="2.5" strokeLinecap="round" className="flex-shrink-0">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}
