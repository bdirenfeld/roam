"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Card, CardType } from "@/types/database";
import { createClient } from "@/lib/supabase/client";

interface Props {
  tripId:   string;
  /** The card's declared type. `null` (e.g. a fresh Note card) shows every saved place. */
  cardType: CardType | null;
  onLink:   (place: Card) => void;
  onClose:  () => void;
}

// Display order for the type-level groups.
const TYPE_ORDER: CardType[] = ["food", "activity", "logistics"];

const TYPE_LABEL: Record<CardType, string> = {
  food:      "Food",
  activity:  "Activity",
  logistics: "Logistics",
};

const TYPE_COLOR: Record<CardType, string> = {
  food:      "#7C3AED",
  activity:  "#0D9488",
  logistics: "#111827",
};

// Simple sub-type icons (SVG paths) — used for each place's row glyph.
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

  // Fetch this trip's interested cards that have a linked place, then filter by
  // the card's declared type CLIENT-SIDE — at the TYPE level only (never
  // sub_type). A card with no type shows every saved place. Trip card counts
  // are small, so this sidesteps PostgREST embedded-filter syntax entirely.
  useEffect(() => {
    supabase
      .from("cards")
      .select(`
        *,
        place:places (
          id, title, type, sub_type, lat, lng, address, google_place_id, cover_image_url, rating, price_level
        )
      `)
      .eq("trip_id", tripId)
      .eq("status", "interested")
      .not("place_id", "is", null)
      .then(({ data }) => {
        const raw   = ((data ?? []) as Card[]).filter((c) => c.place);
        const typed = cardType ? raw.filter((c) => c.place!.type === cardType) : raw;
        // Dedupe by place_id; prefer the card that already has a cover image.
        const seen = new Map<string, Card>();
        for (const card of typed) {
          const key      = card.place_id!;
          const existing = seen.get(key);
          if (!existing || (card.place!.cover_image_url && !existing.place!.cover_image_url)) {
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

  // Group lightly by type, in display order.
  const grouped = TYPE_ORDER
    .map((type) => ({ type, cards: places.filter((p) => p.place!.type === type) }))
    .filter((g) => g.cards.length > 0);

  const subtitle = cardType
    ? `Showing ${TYPE_LABEL[cardType].toLowerCase()} places`
    : "Showing all saved places";

  const emptyCopy = cardType
    ? `No ${TYPE_LABEL[cardType].toLowerCase()} places saved yet`
    : "No places saved yet — find them on the Map";

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
            <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>
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
              <p className="text-[13px] font-medium text-gray-500">{emptyCopy}</p>
            </div>
          ) : (
            grouped.map(({ type, cards }) => {
              const color = TYPE_COLOR[type];
              return (
                <div key={type}>
                  {/* Type header */}
                  <div className="flex items-center gap-2 px-5 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      {TYPE_LABEL[type]}
                    </span>
                  </div>

                  {cards.map((card) => {
                    const rating = card.place!.rating;
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
                          <SubTypeIcon subType={card.place!.sub_type ?? ""} color={color} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-gray-900 truncate">{card.place!.title}</p>
                          {card.place!.address && (
                            <p className="text-[11px] text-gray-400 mt-0.5 truncate">{card.place!.address}</p>
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
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
