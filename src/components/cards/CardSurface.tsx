import type { Card, CardType } from "@/types/database";
import { getMaterialIconHTML } from "@/lib/mapPins";
import { getPriceRange } from "@/lib/priceRange";

interface Props {
  card: Card;
  /** Omit (guest read-only) to render the card as a non-interactive surface. */
  onTap?: () => void;
  isHighlighted?: boolean;
  onToggleConfirmed?: () => void;
  /** Numbered pin index that matches this card's marker on the map.
   *  Rendered only at md:+. Mobile is unaffected when omitted. */
  pinIndex?: number;
}

/** Cards eligible to show a confirmation dot */
function isConfirmable(card: Card): boolean {
  const p = card.place;
  if (!p) return false;
  return (
    (p.type === "activity" && p.sub_type === "guided") ||
    p.type === "logistics" ||
    (p.type === "food" && p.sub_type === "restaurant")
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

export default function CardSurface({ card, onTap, isHighlighted, onToggleConfirmed, pinIndex }: Props) {
  const place     = card.place;
  const det        = card.details as Record<string, unknown> | null;
  // Unlinked cards default to activity-style color for the icon block
  const placeType: CardType = place?.type ?? "activity";
  const colors    = TYPE_COLOR[placeType];
  const subLabel  = place?.sub_type ? (SUB_TYPE_SHORT[place.sub_type] ?? null) : null;
  const timeRange = formatTimeRange(card.start_time, card.end_time);
  const noteSnippet = !place ? (det?.notes as string | undefined) : undefined;
  const title     = place?.title ?? (det?.title as string | undefined) ?? noteSnippet?.slice(0, 60) ?? "(untitled note)";

  const isFlight = place?.sub_type === "flight_arrival" || place?.sub_type === "flight_departure";

  // Subtitle: flights get a route string; others prefer address, fall back to sub-type label
  const subtitle = isFlight
    ? flightRoute(det, timeRange)
    : (place?.address ?? subLabel);
  const surfRating = place?.type === "food" ? place.rating : null;
  const priceRange = place?.type === "food"
    ? getPriceRange(place.price_level ?? undefined, det?.currency_code as string | undefined)
    : null;

  // At md:+, the outer button becomes a row containing a numbered-pin column
  // (when pinIndex is set) plus the inner card. At mobile, the inner card
  // carries all the visual styling and the outer is a thin wrapper — keeps
  // mobile pixel-identical.
  // Guest read-only renders a plain div (no press feedback, no chevron) so a
  // dead tap never implies an editable surface. Cast keeps the dynamic tag
  // type-checking against the shared (button-compatible) prop set.
  const interactive = !!onTap;
  const Wrapper = (interactive ? "button" : "div") as "button";

  return (
    <Wrapper
      onClick={onTap}
      className={`w-full text-left transition-all duration-150 mb-2.5 md:mb-2 md:flex md:items-stretch md:gap-3.5 ${
        interactive ? "active:scale-[0.99]" : ""
      }`}
    >
      {/* Desktop-only numbered pin column — matches the map marker badge */}
      <div className="hidden md:flex md:flex-shrink-0 md:w-7 md:flex-col md:items-center md:pt-[18px]">
        {pinIndex != null && (
          <div
            className="w-[22px] h-[22px] rounded-full flex items-center justify-center"
            style={{ background: "#1A1A2E" }}
          >
            <span
              className="text-[11px] font-semibold leading-none"
              style={{ color: "#FAF7F2", fontFeatureSettings: '"tnum"' }}
            >
              {pinIndex}
            </span>
          </div>
        )}
      </div>

      {/* Card body — mobile classes are unchanged; md: overrides apply the editorial card */}
      <div
        className={`flex items-center gap-3 p-3 rounded-xl border border-gray-100 border-l-[3px] shadow-card hover:shadow-card-hover bg-white md:flex-1 md:min-w-0 md:gap-3.5 md:p-[14px] md:px-[18px] md:rounded-[14px] md:border-l md:shadow-[0_1px_2px_rgba(26,26,46,0.04),0_0_0_1px_rgba(26,26,46,0.12)] ${colors.border}${isHighlighted ? " card-highlight" : ""}`}
      >
        {/* Category icon */}
        <div className={`relative w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 md:rounded-full md:bg-[rgba(26,26,46,0.05)] ${colors.bg} ${colors.icon}`}>
          {/* eslint-disable-next-line react/no-danger */}
          <div dangerouslySetInnerHTML={{ __html: getMaterialIconHTML(place?.sub_type ?? null, 18) }} />
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
          {/* Desktop-only kind small-caps caption */}
          {subLabel && (
            <p
              className="hidden md:block text-[9.5px] font-medium uppercase leading-none text-activity/50 mb-[3px]"
              style={{ letterSpacing: "0.18em" }}
            >
              {subLabel}
            </p>
          )}
          <p className="text-[13px] font-bold text-gray-900 truncate leading-snug md:text-[15.5px] md:font-medium md:text-activity md:tracking-[-0.005em]">
            {title}
          </p>
          {(timeRange || subtitle) && (
            <p className="text-[11px] text-gray-600 mt-0.5 truncate leading-snug md:text-[12.5px] md:text-activity/50 md:mt-[2px] md:tracking-[-0.005em]">
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
            <p className="text-[10px] font-semibold text-amber-500 mt-0.5 leading-snug md:text-[11.5px] md:mt-[2px]">
              {surfRating !== null ? `★ ${surfRating.toFixed(1)} · ` : ""}{priceRange}
            </p>
          )}
        </div>

        {/* Chevron — only when the card is tappable */}
        {interactive && (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="2.5" strokeLinecap="round" className="flex-shrink-0 md:hidden">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(26,26,46,0.30)" strokeWidth="1.3" strokeLinecap="round" className="hidden md:block md:flex-shrink-0">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </>
        )}
      </div>
    </Wrapper>
  );
}
