"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Card, CardType } from "@/types/database";
import { createClient } from "@/lib/supabase/client";

interface Props {
  tripId: string;
  onLink: (place: Card) => void;
  onClose: () => void;
}

const TYPE_ORDER: CardType[] = ["activity", "food", "logistics"];
const TYPE_LABEL: Record<CardType, string> = {
  activity:  "Activity",
  food:      "Food",
  logistics: "Stay & Logistics",
};
const TYPE_DOT: Record<CardType, string> = {
  activity:  "bg-activity",
  food:      "bg-food",
  logistics: "bg-logistics",
};

const SUB_LABEL: Record<string, string> = {
  restaurant:       "Restaurant",
  coffee:           "Café",
  cocktail_bar:     "Bar",
  guided:           "Guided",
  self_directed:    "Activity",
  wellness:         "Wellness",
  event:            "Event",
  challenge:        "Challenge",
  hotel:            "Hotel",
  flight_arrival:   "Arrival",
  flight_departure: "Departure",
};

export default function LinkPlaceSheet({ tripId, onLink, onClose }: Props) {
  const supabase    = createClient();
  const sheetRef    = useRef<HTMLDivElement>(null);
  const dragY       = useRef(0);
  const dragging    = useRef(false);

  const [places,  setPlaces]  = useState<Card[]>([]);
  const [query,   setQuery]   = useState("");
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

  // Fetch interested cards (map pins not yet in itinerary)
  useEffect(() => {
    supabase
      .from("cards")
      .select("*")
      .eq("trip_id", tripId)
      .eq("status", "interested")
      .not("lat", "is", null)
      .order("type")
      .order("title")
      .then(({ data }) => {
        setPlaces((data ?? []) as Card[]);
        setLoading(false);
      });
  }, [tripId, supabase]);

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

  const filtered = query.trim()
    ? places.filter((p) => p.title.toLowerCase().includes(query.toLowerCase()))
    : places;

  const grouped = TYPE_ORDER.map((type) => ({
    type,
    cards: filtered.filter((p) => p.type === type),
  })).filter((g) => g.cards.length > 0);

  return (
    <div className="fixed inset-0 z-[70] flex items-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-200" />

      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet max-h-[80dvh] flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ willChange: "transform" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 flex-shrink-0">
          <div className="w-9 h-[3px] rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-[15px] font-bold text-gray-900">Link place from map</h3>
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

        {/* Search */}
        <div className="px-5 py-3 flex-shrink-0">
          <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search places…"
              className="flex-1 text-[13px] text-gray-700 placeholder-gray-400 bg-transparent outline-none"
              autoFocus
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-gray-300 hover:text-gray-500">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-[13px] text-gray-400">Loading places…</p>
            </div>
          ) : grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <p className="text-[13px] font-medium text-gray-500">No saved places found</p>
              <p className="text-[12px] text-gray-400 mt-1">
                {places.length === 0
                  ? "Pin places on the map first, then link them here."
                  : "No results match your search."}
              </p>
            </div>
          ) : (
            grouped.map(({ type, cards }) => (
              <div key={type}>
                {/* Group header */}
                <div className="flex items-center gap-2 px-5 py-2 bg-gray-50 border-b border-gray-100">
                  <span className={`w-2 h-2 rounded-full ${TYPE_DOT[type]}`} />
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    {TYPE_LABEL[type]}
                  </span>
                </div>

                {cards.map((card) => {
                  const details    = card.details as Record<string, unknown> | null;
                  const rating     = details?.rating as number | undefined;
                  const subLabel   = card.sub_type ? (SUB_LABEL[card.sub_type] ?? card.sub_type) : null;
                  const hasPhoto   = !!card.cover_image_url;

                  return (
                    <button
                      key={card.id}
                      onClick={() => onLink(card)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 border-b border-gray-50 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                    >
                      {/* Thumbnail or placeholder */}
                      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 flex items-center justify-center">
                        {hasPhoto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={card.cover_image_url!} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                            <circle cx="12" cy="9" r="2.5" />
                          </svg>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-900 truncate">{card.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {subLabel && (
                            <span className="text-[11px] text-gray-400">{subLabel}</span>
                          )}
                          {rating !== undefined && (
                            <>
                              {subLabel && <span className="text-gray-200">·</span>}
                              <span className="text-[11px] text-amber-500 font-medium">★ {rating.toFixed(1)}</span>
                            </>
                          )}
                        </div>
                        {card.address && (
                          <p className="text-[11px] text-gray-400 mt-0.5 truncate">{card.address}</p>
                        )}
                      </div>

                      {/* Link arrow */}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
