import type { Card, CardType } from "@/types/database";

interface Props {
  card: Card;
  timeLabel: string;
  onTap: () => void;
}

function TypeIcon({ type, subType }: { type: CardType; subType: string | null }) {
  if (type === "logistics") {
    if (subType === "flight_arrival" || subType === "flight_departure") {
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M17.8 19.2L16 11l3.5-3.5A3 3 0 0015.3 3c-.4.1-.7.3-1 .5L11 7H3l-1 5 5-1.5M21 21l-9-9" />
          <path d="M3.5 21.5l7-7" />
        </svg>
      );
    }
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    );
  }

  if (type === "activity") {
    if (subType === "hosted") {
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
        </svg>
      );
    }
    if (subType === "wellness") {
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
        </svg>
      );
    }
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="10" />
        <polygon points="10 8 16 12 10 16 10 8" />
      </svg>
    );
  }

  if (subType === "coffee_dessert") {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M18 8h1a4 4 0 010 8h-1" />
        <path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" />
        <line x1="6" y1="1" x2="6" y2="4" />
        <line x1="10" y1="1" x2="10" y2="4" />
        <line x1="14" y1="1" x2="14" y2="4" />
      </svg>
    );
  }
  if (subType === "drinks") {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M8 22h8M12 11v11M3.27 6h17.46l-1.64 9.39A2 2 0 0117.12 17H6.88a2 2 0 01-1.97-1.61L3.27 6z" />
        <path d="M3 6h18" />
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 11l19-9-9 19-2-8-8-2z" />
    </svg>
  );
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
      {/* Type icon */}
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${colors.bg} ${colors.icon}`}>
        <TypeIcon type={card.type} subType={card.sub_type} />
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
