"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Card, CardType } from "@/types/database";
import { createClient } from "@/lib/supabase/client";

interface Props {
  tripId:   string;
  cardType: CardType;
  onLink:   (place: Card) => void;
  onClose:  () => void;
}

// ── Sub-types belonging to each card type ──────────────────────
const TYPE_SUB_TYPES: Record<CardType, string[]> = {
  food:      ["restaurant", "coffee", "coffee_dessert", "dessert", "cocktail_bar", "drinks", "bar"],
  activity:  ["guided", "hosted", "self_directed", "wellness", "event", "challenge"],
  logistics: ["hotel", "flight_arrival", "flight_departure", "transit"],
};

// Display order — one row per visible group.
// "hosted" is intentionally omitted: hosted cards are folded into the "guided" bucket.
// All other activity sub-types (self_directed, wellness, event, challenge) are explicit
// so they always show when matching pins exist.
const SUB_ORDER: Record<CardType, string[]> = {
  food:      ["restaurant", "coffee", "dessert", "bar"],
  activity:  ["guided", "self_directed", "wellness", "event", "challenge"],
  logistics: ["hotel", "flight_arrival", "flight_departure", "transit"],
};

const SUB_LABEL: Record<string, string> = {
  restaurant:       "Restaurant",
  coffee:           "Coffee",
  coffee_dessert:   "Coffee",
  dessert:          "Dessert",
  cocktail_bar:     "Bar",
  drinks:           "Bar",
  bar:              "Bar",
  guided:           "Guided",
  hosted:           "Guided",
  self_directed:    "Self-Directed",
  wellness:         "Wellness",
  event:            "Event",
  challenge:        "Challenge",
  hotel:            "Hotel",
  flight_arrival:   "Flight Arrival",
  flight_departure: "Flight Departure",
  transit:          "Transit",
};

const TYPE_COLOR: Record<CardType, string> = {
  food:      "#7C3AED",
  activity:  "#0D9488",
  logistics: "#111827",
};

// Simple sub-type icons (SVG paths)
function SubTypeIcon({ subType, color }: { subType: string; color: string }) {
  const s = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  switch (subType) {
    case "restaurant":
      return (
        <svg {...s}>
          <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
          <path d="M7 2v20" /><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
        </svg>
      );
    case "coffee":
    case "coffee_dessert":
      return (
        <svg {...s}>
          <path d="M17 8h1a4 4 0 0 1 0 8h-1" />
          <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
          <line x1="6" y1="2" x2="6" y2="4" /><line x1="10" y1="2" x2="10" y2="4" /><line x1="14" y1="2" x2="14" y2="4" />
        </svg>
      );
    case "dessert":
      return (
        <svg {...s}>
          <circle cx="12" cy="10" r="4" />
          <path d="M10 14-1 7h6l-1-7" />
        </svg>
      );
    case "cocktail_bar":
    case "drinks":
    case "bar":
      return (
        <svg {...s}>
          <path d="M8 22h8" /><path d="M12 11v11" />
          <path d="m19 3-7 8-7-8Z" />
        </svg>
      );
    case "guided":
    case "hosted":
      return (
        <svg {...s}>
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" />
        </svg>
      );
    case "self_directed":
      return (
        <svg {...s}>
          <circle cx="12" cy="5" r="1" fill={color} stroke="none" />
          <path d="m9 20 3-6 3 6" /><path d="m6 8 6 2 6-2" /><path d="M12 10v4" />
        </svg>
      );
    case "wellness":
      return (
        <svg {...s}>
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      );
    case "event":
      return (
        <svg {...s}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case "challenge":
      return (
        <svg {...s}>
          <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
        </svg>
      );
    case "hotel":
      return (
        <svg {...s}>
          <path d="M2 20V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12" />
          <path d="M2 20h20" /><path d="M7 20v-5h10v5" />
          <path d="M9 9h1" /><path d="M14 9h1" />
        </svg>
      );
    case "flight_arrival":
      return (
        <svg {...s}>
          <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21 4 19 4c-.7 0-1.5.3-2 .8L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
        </svg>
      );
    case "flight_departure":
      return (
        <svg {...s}>
          <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21 4 19 4c-.7 0-1.5.3-2 .8L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
        </svg>
      );
    case "transit":
      return (
        <svg {...s}>
          <rect x="1" y="3" width="15" height="13" rx="2" />
          <path d="M16 8h4l3 3v5h-7V8z" />
          <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      );
    default:
      return (
        <svg {...s}>
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
          <circle cx="12" cy="9" r="2.5" />
        </svg>
      );
  }
}

export default function LinkPlaceSheet({ tripId, cardType, onLink, onClose }: Props) {
  const supabase = createClient();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragY    = useRef(0);
  const dragging = useRef(false);

  const [places,  setPlaces]  = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  const validSubTypes = TYPE_SUB_TYPES[cardType] ?? [];
  const color         = TYPE_COLOR[cardType];

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Fetch interested cards filtered to this card's type, deduplicated by place_id then title
  useEffect(() => {
    supabase
      .from("cards")
      .select("*")
      .eq("trip_id", tripId)
      .eq("status", "interested")
      .eq("type", cardType)
      .not("lat", "is", null)
      .order("sub_type")
      .order("title")
      .then(({ data }) => {
        const raw = (data ?? []) as Card[];
        // Dedup: prefer the card with a cover image; key by place_id, then fall back to title
        const seen = new Map<string, Card>();
        for (const card of raw) {
          const details = card.details as Record<string, unknown> | null;
          const key = (typeof details?.place_id === "string" ? details.place_id : null)
                        ?? card.title.toLowerCase().trim();
          const existing = seen.get(key);
          if (!existing || (card.cover_image_url && !existing.cover_image_url)) {
            seen.set(key, card);
          }
        }
        setPlaces(Array.from(seen.values()));
        setLoading(false);
      });
  }, [tripId, cardType, supabase]);

  // Drag-to-dismiss
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragY.current = e.touches[0].clientY; dragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current || !sheetRef.current) return;
    const dy = Math.max(0, e.touches[0].clientY - dragY.current);
    sheetRef.current.style.transform  = `translateY(${dy}px)`;
    sheetRef.current.style.transition = "none";
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!dragging.current || !sheetRef.current) return;
    dragging.current = false;
    const dy = e.changedTouches[0].clientY - dragY.current;
    if (dy > 120) {
      sheetRef.current.style.transition = "transform 250ms cubic-bezier(0.32,0.72,0,1)";
      sheetRef.current.style.transform  = "translateY(100%)";
      setTimeout(onClose, 240);
    } else {
      sheetRef.current.style.transition = "transform 300ms cubic-bezier(0.34,1.56,0.64,1)";
      sheetRef.current.style.transform  = "translateY(0)";
    }
  }, [onClose]);

  // Group by sub_type in display order
  const subOrder = SUB_ORDER[cardType] ?? [];
  const grouped  = subOrder
    .map((sub) => ({
      sub,
      label: SUB_LABEL[sub] ?? sub,
      cards: places.filter((p) => {
        const st = p.sub_type ?? "";
        // Collapse aliased sub-types into one bucket
        if (sub === "coffee")      return st === "coffee" || st === "coffee_dessert";
        if (sub === "bar")         return st === "bar" || st === "cocktail_bar" || st === "drinks";
        if (sub === "guided")      return st === "guided" || st === "hosted";
        return st === sub;
      }),
    }))
    .filter((g) => g.cards.length > 0);

  // Bucket any sub_type not captured by the grouped display into "Other"
  // knownSubs covers all sub-types in TYPE_SUB_TYPES for this card type
  const knownSubs = new Set(validSubTypes);
  // Also mark alias sub-types as known so they don't appear in Other
  ["coffee_dessert", "cocktail_bar", "drinks", "hosted"].forEach((s) => knownSubs.add(s));
  const otherCards = places.filter((p) => !knownSubs.has(p.sub_type ?? ""));

  const typeLabel = { food: "Food", activity: "Activity", logistics: "Logistics" }[cardType];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-200" />

      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet max-h-[75dvh] flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ willChange: "transform" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 flex-shrink-0">
          <div className="w-9 h-[3px] rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="text-[15px] font-bold text-gray-900">Link place from map</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Showing {typeLabel.toLowerCase()} pins
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            aria-label="Close"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-[13px] text-gray-400">Loading…</p>
            </div>
          ) : places.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <p className="text-[13px] font-medium text-gray-500">No {typeLabel.toLowerCase()} pins saved</p>
              <p className="text-[12px] text-gray-400 mt-1">
                Pin {typeLabel.toLowerCase()} places on the map first, then link them here.
              </p>
            </div>
          ) : (
            <>
              {grouped.map(({ sub, label, cards }) => (
                <div key={sub}>
                  {/* Sub-type header */}
                  <div className="flex items-center gap-2 px-5 py-2 bg-gray-50 border-b border-gray-100">
                    <SubTypeIcon subType={sub} color={color} />
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      {label}
                    </span>
                  </div>

                  {cards.map((card) => {
                    const details = card.details as Record<string, unknown> | null;
                    const rating  = typeof details?.rating === "number" ? details.rating as number : null;

                    return (
                      <button
                        key={card.id}
                        onClick={() => onLink(card)}
                        className="w-full flex items-center gap-3 px-5 py-3.5 border-b border-gray-50 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                      >
                        {/* Colored icon dot */}
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: `${color}15` }}
                        >
                          <SubTypeIcon subType={card.sub_type ?? sub} color={color} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-gray-900 truncate">{card.title}</p>
                          {card.address && (
                            <p className="text-[11px] text-gray-400 mt-0.5 truncate">{card.address}</p>
                          )}
                          {rating !== null && (
                            <p className="text-[11px] text-amber-500 font-medium mt-0.5">★ {rating.toFixed(1)}</p>
                          )}
                        </div>

                        {/* Chevron */}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                    );
                  })}
                </div>
              ))}

              {/* Any uncategorised cards */}
              {otherCards.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 px-5 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Other</span>
                  </div>
                  {otherCards.map((card) => {
                    const details = card.details as Record<string, unknown> | null;
                    const rating  = typeof details?.rating === "number" ? details.rating as number : null;
                    return (
                      <button
                        key={card.id}
                        onClick={() => onLink(card)}
                        className="w-full flex items-center gap-3 px-5 py-3.5 border-b border-gray-50 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
                          <SubTypeIcon subType={card.sub_type ?? ""} color={color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-gray-900 truncate">{card.title}</p>
                          {card.address && (
                            <p className="text-[11px] text-gray-400 mt-0.5 truncate">{card.address}</p>
                          )}
                          {rating !== null && (
                            <p className="text-[11px] text-amber-500 font-medium mt-0.5">★ {rating.toFixed(1)}</p>
                          )}
                        </div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
