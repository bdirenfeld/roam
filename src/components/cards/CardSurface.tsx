import type { Card } from "@/types/database";
import { getPriceRange } from "@/lib/priceRange";
import { formatTimeRange } from "@/lib/formatTime";
import { getOpeningHoursConflict, openingHoursCaption, openingHoursTone } from "@/lib/openingHours";
import { readRecommendedBy, recommendedByLine } from "@/lib/recommendedBy";
import LovedHeart from "@/components/ui/LovedHeart";
import CardBadges from "./CardBadges";

interface Props {
  card: Card;
  /** The card's day calendar date ("YYYY-MM-DD"), for the opening-hours signal. */
  dayDate?: string | null;
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

const SUB_TYPE_SHORT: Record<string, string> = {
  flight_arrival:   "Arrival",
  flight_departure: "Departure",
  self_directed:    "Self-directed",
  hosted:           "Guided",
  wellness:         "Wellness",
  beach:            "Beach",
  restaurant:       "Restaurant",
  coffee_dessert:   "Coffee",
  drinks:           "Drinks",
};

function flightRoute(det: Record<string, unknown> | null, timeRange: string | null): string | null {
  const origin   = typeof det?.origin_airport  === "string" ? det.origin_airport  : null;
  const arriving = typeof det?.arriving_at      === "string" ? det.arriving_at      : null;
  if (origin && arriving) {
    const base = `${origin} → ${arriving}`;
    return timeRange ? `${base} · ${timeRange}` : base;
  }
  return typeof det?.airline === "string" ? det.airline : null;
}

/** "6:00 pm" for the rail. The range still shows in the line beneath. */
function railTime(start: string | null): string | null {
  if (!start) return null;
  const [h, m] = start.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  const suffix = h < 12 ? "am" : "pm";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m ?? 0).padStart(2, "0")} ${suffix}`;
}

/**
 * The first thing the notes actually SAY about the place.
 *
 * Not simply the first line: notes are written with headings — `**Intent**`,
 * `KNOW BEFORE YOU GO`, `BRING`, `COST` — and taking line one literally put
 * "**Intent**" on the face of the card. Walk past the headings and the
 * bullet marks to the first real sentence.
 */
function noteLead(det: Record<string, unknown> | null): string | null {
  const notes = typeof det?.notes === "string" ? det.notes : null;
  if (!notes) return null;

  for (const raw of notes.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    // A whole line wrapped in ** ** is a heading, not a sentence.
    if (/^\*{1,2}.+\*{1,2}$/.test(line)) continue;
    // Markdown headings and horizontal rules.
    if (/^(#{1,6}\s|[-=_]{3,}$)/.test(line)) continue;

    const clean = line
      .replace(/^[•·\-*>\s]+/, "")
      .replace(/\*\*/g, "")
      .trim();
    if (!clean) continue;
    // Caps-only labels: COST, BRING, THE LIST, BE REALISTIC.
    if (clean.length < 44 && clean === clean.toUpperCase() && /[A-Z]/.test(clean)) continue;

    return clean.length > 150 ? clean.slice(0, 148).trimEnd() + "…" : clean;
  }
  return null;
}

/**
 * One entry in a day.
 *
 * This was a bordered, shadowed card with a grey pin icon on every row and a
 * chevron on the end — five SaaS defaults stacked up. It is a page now: the
 * time hangs in a left rail, the name is set in the display face, hairlines
 * separate rather than boxes contain, and where the place has a photograph the
 * photograph is used. The app already had those pictures and the agenda was
 * throwing them away for an identical grey placeholder.
 */
export default function CardSurface({ card, dayDate, onTap, isHighlighted, onToggleConfirmed, pinIndex }: Props) {
  const place     = card.place;
  const det       = card.details as Record<string, unknown> | null;
  const subLabel  = place?.sub_type ? (SUB_TYPE_SHORT[place.sub_type] ?? null) : null;
  const timeRange = formatTimeRange(card.start_time, card.end_time);
  const hoursSignal = place ? getOpeningHoursConflict(place.hours, dayDate ?? null, card.start_time) : null;
  const noteSnippet = !place ? (det?.notes as string | undefined) : undefined;
  const title     = place?.title ?? (det?.title as string | undefined) ?? noteSnippet?.slice(0, 60) ?? "(untitled note)";

  const isFlight = place?.sub_type === "flight_arrival" || place?.sub_type === "flight_departure";

  // What the entry says about itself, in priority: the flight route, then the
  // note you actually wrote, then the address.
  const detail = isFlight
    ? flightRoute(det, timeRange)
    : (noteLead(det) ?? place?.address ?? subLabel);

  const surfRating = place?.type === "food" ? place.rating : null;
  const isLoved    = place?.loved === true;
  const recommender = readRecommendedBy(det);
  const priceRange = place?.type === "food"
    ? getPriceRange(place.price_level ?? undefined, det?.currency_code as string | undefined)
    : null;

  const rail = railTime(card.start_time);
  const confirmed = isConfirmable(card) && card.confirmed;

  const interactive = !!onTap;
  const Wrapper = (interactive ? "button" : "div") as "button";

  return (
    <Wrapper
      onClick={onTap}
      className={`w-full text-left flex gap-3 md:gap-5 py-3.5 md:py-[18px] transition-colors ${
        isHighlighted ? "card-highlight" : ""
      }`}
      style={{ borderBottom: "1px solid rgba(26,26,46,0.10)" }}
    >
      {/* The rail. Untimed entries keep the column so every title starts on
          the same line — an empty rail reads as "anytime", not as a gap. */}
      <div
        className="w-[52px] md:w-[74px] shrink-0 pt-[5px] text-[10px] md:text-[10.5px] uppercase"
        style={{ letterSpacing: "0.1em", color: "rgba(26,26,46,0.35)" }}
      >
        {rail}
      </div>

      <div className="flex-1 min-w-0">
        {(subLabel || pinIndex != null) && (
          <p
            className="hidden md:flex md:items-center md:gap-2 text-[9.5px] font-medium uppercase leading-none mb-[5px]"
            style={{ letterSpacing: "0.18em", color: "rgba(26,26,46,0.4)" }}
          >
            {pinIndex != null && (
              <span
                className="inline-flex items-center justify-center w-[17px] h-[17px] rounded-full"
                style={{ background: "#1A1A2E", color: "#FAF7F2", fontSize: 9.5, letterSpacing: 0 }}
              >
                {pinIndex}
              </span>
            )}
            {subLabel}
          </p>
        )}

        <div className="flex items-center gap-1.5 min-w-0">
          <p
            className="min-w-0 font-display text-[17px] md:text-[20px] leading-[1.24] truncate"
            style={{ color: "#1A1A2E" }}
          >
            {title}
          </p>
          {isLoved && <LovedHeart size={11} />}
          {confirmed && onToggleConfirmed && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleConfirmed(); }}
              aria-label="Confirmed — tap to unconfirm"
              className="shrink-0 inline-flex items-center justify-center"
              style={{ width: 13, height: 13, borderRadius: "50%", background: "#1A1A2E" }}
            >
              <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
                <polyline points="1,3.5 2.8,5.5 6,1.5" stroke="#FAF7F2" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>

        {hoursSignal && (
          <p className={`text-[11.5px] md:text-[12.5px] mt-[3px] truncate leading-snug ${openingHoursTone(hoursSignal)}`}>
            {openingHoursCaption(hoursSignal)}
          </p>
        )}

        {detail && (
          <p
            className="text-[12.5px] md:text-[13px] mt-[3px] leading-[1.45] line-clamp-2"
            style={{ color: "rgba(26,26,46,0.55)" }}
          >
            {detail}
          </p>
        )}

        {priceRange && (
          <p className="text-[11px] md:text-[11.5px] font-medium mt-[3px] leading-snug" style={{ color: "#C4622D" }}>
            {surfRating !== null ? `★ ${surfRating.toFixed(1)} · ` : ""}{priceRange}
          </p>
        )}

        {recommender && (
          <p className="text-[11px] md:text-[11.5px] mt-[3px] truncate leading-snug" style={{ color: "rgba(26,26,46,0.4)" }}>
            {recommendedByLine(recommender)}
          </p>
        )}

        <CardBadges card={card} className="mt-1.5" />
      </div>

      {/* The photograph, where there is one. Note cards and unlinked entries
          get nothing rather than a placeholder — the asymmetry is honest. */}
      {place?.id && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/places/photo?place_id=${place.id}&index=0`}
          alt=""
          loading="lazy"
          className="w-[52px] h-[52px] md:w-[76px] md:h-[76px] rounded-lg object-cover shrink-0 bg-[rgba(26,26,46,0.04)]"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      )}
    </Wrapper>
  );
}
