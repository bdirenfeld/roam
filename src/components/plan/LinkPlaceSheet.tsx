"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Card, CardType } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { X, CaretRight, ForkKnife, Coffee, Cookie, Wine, Compass, PersonSimpleWalk, Heart, CalendarBlank, Lightning, Buildings, AirplaneTilt, Truck, MapPin } from "@phosphor-icons/react";

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
  food:      ["restaurant", "coffee", "dessert", "cocktail_bar"],
  activity:  ["guided", "self_directed", "wellness", "event", "challenge"],
  logistics: ["hotel", "flight_arrival", "flight_departure", "transit"],
};

const SUB_LABEL: Record<string, string> = {
  restaurant:       "Restaurant",
  coffee:           "Coffee",
  coffee_dessert:   "Coffee",
  dessert:          "Dessert",
  cocktail_bar:     "Cocktail Bar",
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

// Simple sub-type icons using Phosphor Light
function SubTypeIcon({ subType, color }: { subType: string; color: string }) {
  const props = { size: 14, weight: "light" as const, color };
  switch (subType) {
    case "restaurant":                          return <ForkKnife {...props} />;
    case "coffee": case "coffee_dessert":       return <Coffee {...props} />;
    case "dessert":                             return <Cookie {...props} />;
    case "cocktail_bar": case "drinks": case "bar": return <Wine {...props} />;
    case "guided": case "hosted":              return <Compass {...props} />;
    case "self_directed":                       return <PersonSimpleWalk {...props} />;
    case "wellness":                            return <Heart {...props} />;
    case "event":                               return <CalendarBlank {...props} />;
    case "challenge":                           return <Lightning {...props} />;
    case "hotel":                               return <Buildings {...props} />;
    case "flight_arrival": case "flight_departure": return <AirplaneTilt {...props} />;
    case "transit":                             return <Truck {...props} />;
    default:                                    return <MapPin {...props} />;
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
        if (sub === "cocktail_bar") return st === "cocktail_bar" || st === "drinks" || st === "bar";
        if (sub === "guided")      return st === "guided" || st === "hosted";
        return st === sub;
      }),
    }))
    .filter((g) => g.cards.length > 0);

  // Bucket any sub_type not captured by the grouped display into "Other"
  // knownSubs covers all sub-types in TYPE_SUB_TYPES for this card type
  const knownSubs = new Set(validSubTypes);
  // Also mark coffee_dessert / drinks / bar as known so they don't appear in Other
  // (they're folded into their alias groups above)
  ["coffee_dessert", "drinks", "bar", "hosted"].forEach((s) => knownSubs.add(s));
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
            <X size={13} weight="light" color="#6B7280" />
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
                        <CaretRight size={14} weight="light" color="#D1D5DB" />
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
                        <CaretRight size={14} weight="light" color="#D1D5DB" />
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
