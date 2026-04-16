import type { Card, CardType } from "@/types/database";
import { getMaterialIconHTML } from "@/lib/mapPins";
import { getPriceRange } from "@/lib/priceRange";

interface Props {
  card: Card;
  onTap: () => void;
  isHighlighted?: boolean;
  onToggleConfirmed?: () => void;
}

/** Cards eligible to show a confirmation dot */
function isConfirmable(card: Card): boolean {
  return (
    (card.type === "activity" && card.sub_type === "guided") ||
    card.type === "logistics" ||
    (card.type === "food" && card.sub_type === "restaurant")
  );
}

const TYPE_COLOR: Record<CardType, { border: string; icon: string; bg: string }> = {
  logistics: { border: "border-l-gray-400", icon: "text-gray-500", bg: "bg-gray-100" },
  activity:  { border: "border-l-gray-400", icon: "text-gray-500", bg: "bg-gray-100" },
  food:      { border: "border-l-gray-400", icon: "text-gray-500", bg: "bg-gray-100" },
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

/** Format a single HH:MM time string, optionally including the AM/PM period. */
function fmtTime(t: string, showPeriod: boolean): string {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour   = h % 12 === 0 ? 12 : h % 12;
  const mins   = String(m).padStart(2, "0");
  return showPeriod ? `${hour}:${mins} ${period}` : `${hour}:${mins}`;
}

/**
 * Build a time-range string:
 *   same period  →  "7:00 – 8:30 AM"
 *   diff periods →  "11:30 AM – 1:00 PM"
 *   no end time  →  "7:45 PM"
 */
function formatTimeRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  if (!end)   return fmtTime(start, true);

  const startPeriod = Number(start.split(":")[0]) >= 12 ? "PM" : "AM";
  const endPeriod   = Number(end.split(":")[0])   >= 12 ? "PM" : "AM";

  if (startPeriod === endPeriod) {
    return `${fmtTime(start, false)} – ${fmtTime(end, true)}`;
  }
  return `${fmtTime(start, true)} – ${fmtTime(end, true)}`;
}

function flightRoute(det: Record<string, unknown> | null, timeRange: string | null): string | null {
  const origin   = typeof det?.origin_airport  === "string" ? det.origin_airport  : null;
  const arriving = typeof det?.arriving_at      === "string" ? det.arriving_at      : null;
  if (origin && arriving) {
    const base = `${origin} → ${arriving}`;
    return timeRange ? `${base} · ${timeRange}` : base;
  }
  // Fall back to airline name
  return typeof det?.airline === "string" ? det.airline : null;
}

export default function CardSurface({ card, onTap, isHighlighted, onToggleConfirmed }: Props) {
  const colors    = TYPE_COLOR[card.type];
  const subLabel  = card.sub_type ? (SUB_TYPE_SHORT[card.sub_type] ?? null) : null;
  const timeRange = formatTimeRange(card.start_time, card.end_time);
  const det        = card.details as Record<string, unknown> | null;

  const isFlight = card.sub_type === "flight_arrival" || card.sub_type === "flight_departure";

  // Subtitle: flights get a route string; others prefer address, fall back to sub-type label
  const subtitle = isFlight
    ? flightRoute(det, timeRange)
    : (card.address ?? subLabel);
  const surfRating = card.type === "food" && typeof det?.rating === "number" ? det.rating as number : null;
  const priceRange = card.type === "food"
    ? getPriceRange(det?.price_level as number | undefined, det?.currency_code as string | undefined)
    : null;

  return (
    <button
      onClick={onTap}
      className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border border-gray-100 border-l-[3px] shadow-card hover:shadow-card-hover transition-all duration-150 active:scale-[0.99] mb-2.5 bg-white ${colors.border}${isHighlighted ? " card-highlight" : ""}`}
    >
      {/* Category icon */}
      <div className={`relative w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${colors.bg} ${colors.icon}`}>
        {/* eslint-disable-next-line react/no-danger */}
        <div dangerouslySetInnerHTML={{ __html: getMaterialIconHTML(card.sub_type, 18) }} />
        {isConfirmable(card) && card.confirmed && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleConfirmed?.(); }}
            aria-label="Confirmed — tap to unconfirm"
            style={{
              position: "absolute",
              bottom: -2,
              right: -2,
              width: 12,
              height: 12,
              borderRadius: "50%",
              backgroundColor: "#1A1A2E",
              border: "1.5px solid #FAF7F2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            <svg width="6" height="6" viewBox="0 0 7 7" fill="none">
              <polyline points="1,3.5 2.8,5.5 6,1.5" stroke="#FAF7F2" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Title + subtitle */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-gray-900 truncate leading-snug">
          {card.title}
        </p>
        {(timeRange || subtitle) && (
          <p className="text-[11px] text-gray-600 mt-0.5 truncate leading-snug">
            {isFlight ? subtitle : (
              <>
                {timeRange}
                {timeRange && subtitle && <span className="mx-1">·</span>}
                {subtitle}
              </>
            )}
          </p>
        )}
        {priceRange && (
          <p className="text-[10px] font-semibold text-amber-500 mt-0.5 leading-snug">
            {surfRating !== null ? `★ ${surfRating.toFixed(1)} · ` : ""}{priceRange}
          </p>
        )}
      </div>

      {/* Chevron */}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="2.5" strokeLinecap="round" className="flex-shrink-0">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}
