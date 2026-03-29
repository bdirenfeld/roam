"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Card, CardType } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { PIN_COLORS } from "@/lib/mapPins";

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  website?: string;
  mapsUrl?: string;
  coverPhotoUrl?: string;
  rating?: number;
  userRatingsTotal?: number;
  phone?: string;
  openNow?: boolean;
  todayHours?: string;
}

interface Props {
  place: PlaceResult;
  tripId: string;
  dayId: string;
  onClose: () => void;
  onCardCreated: (card: Card) => void;
}

const TYPE_OPTIONS: { type: CardType; label: string }[] = [
  { type: "activity",  label: "Activity" },
  { type: "food",      label: "Food"     },
  { type: "logistics", label: "Stay"     },
];

const SUB_TYPE_OPTIONS: Record<CardType, { label: string; value: string }[]> = {
  activity: [
    { label: "Guided",        value: "guided"        },
    { label: "Self-directed", value: "self_directed"  },
    { label: "Wellness",      value: "wellness"       },
    { label: "Event",         value: "event"          },
    { label: "Challenge",     value: "challenge"      },
  ],
  food: [
    { label: "Restaurant",    value: "restaurant"    },
    { label: "Café & Dessert", value: "coffee"       },
    { label: "Bar",           value: "cocktail_bar"  },
  ],
  logistics: [
    { label: "Hotel",  value: "hotel"         },
    { label: "Flight", value: "flight_arrival" },
  ],
};

const DEFAULT_SUB_TYPE: Record<CardType, string> = {
  activity:  "guided",
  food:      "restaurant",
  logistics: "hotel",
};

const KEYWORD_RULES: { pattern: RegExp; subType: string; forTypes: CardType[] }[] = [
  { pattern: /airport|aeroporto|fco|cia|terminal/i,         subType: "flight_arrival",  forTypes: ["logistics"] },
  { pattern: /hotel|b&b|hostel|inn|suites/i,                subType: "hotel",           forTypes: ["logistics"] },
  { pattern: /station|termini|train|bus/i,                  subType: "hotel",           forTypes: ["logistics"] },
  { pattern: /massage|spa|wellness|reflexology/i,           subType: "wellness",        forTypes: ["activity"]  },
  { pattern: /cooking class|corso/i,                        subType: "guided",          forTypes: ["activity"]  },
  { pattern: /caff[eè]|caffe|coffee|gelato|espresso/i,      subType: "coffee",          forTypes: ["food"]      },
  { pattern: /\bbar\b|cocktail|aperitivo/i,                 subType: "cocktail_bar",    forTypes: ["food"]      },
];

function suggestSubType(name: string, type: CardType): string {
  for (const rule of KEYWORD_RULES) {
    if (rule.forTypes.includes(type) && rule.pattern.test(name)) return rule.subType;
  }
  return DEFAULT_SUB_TYPE[type];
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="12" height="12" viewBox="0 0 24 24" fill={rating >= i - 0.25 ? "#F59E0B" : "none"} stroke="#F59E0B" strokeWidth="1.5">
          <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
        </svg>
      ))}
    </span>
  );
}

export default function AddToTripSheet({ place, tripId, dayId, onClose, onCardCreated }: Props) {
  const supabase = createClient();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragY    = useRef(0);
  const dragging = useRef(false);

  const [type,    setType]    = useState<CardType | null>(null);
  const [subType, setSubType] = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);

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

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragY.current = e.touches[0].clientY;
    dragging.current = true;
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

  function selectType(t: CardType) {
    const suggested = suggestSubType(place.name, t);
    setType(t);
    setSubType(suggested);
  }

  const handleSave = useCallback(async () => {
    if (!type || saving) return;
    setSaving(true);

    const details: Record<string, unknown> = {};
    if (place.website) details.website = place.website;
    if (place.phone)   details.phone   = place.phone;
    if (place.rating)  details.rating  = place.rating;

    const finalSubType = subType ?? DEFAULT_SUB_TYPE[type];

    const newCard: Card = {
      id:              crypto.randomUUID(),
      day_id:          dayId,
      trip_id:         tripId,
      type,
      sub_type:        finalSubType,
      title:           place.name,
      start_time:      null,
      end_time:        null,
      position:        0,
      status:          "interested",
      source_url:      place.mapsUrl ?? null,
      cover_image_url: place.coverPhotoUrl ?? null,
      lat:             place.lat,
      lng:             place.lng,
      address:         place.address,
      details,
      ai_generated:    false,
      created_at:      new Date().toISOString(),
    };

    const { error } = await supabase.from("cards").insert({
      id:              newCard.id,
      day_id:          dayId,
      trip_id:         tripId,
      type,
      sub_type:        finalSubType,
      title:           place.name,
      start_time:      null,
      end_time:        null,
      position:        0,
      status:          "interested",
      source_url:      place.mapsUrl ?? null,
      cover_image_url: place.coverPhotoUrl ?? null,
      lat:             place.lat,
      lng:             place.lng,
      address:         place.address,
      details,
    });

    setSaving(false);
    if (!error) onCardCreated(newCard);
  }, [type, subType, saving, place, dayId, tripId, supabase, onCardCreated]);

  const typeColor = type ? PIN_COLORS[type] : null;

  return (
    <div
      className="fixed inset-0 z-60 flex items-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/30 animate-in fade-in duration-200" />

      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet max-h-[90dvh] flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ willChange: "transform" }}
      >
        {/* Cover photo */}
        {place.coverPhotoUrl ? (
          <div className="flex-shrink-0 rounded-t-2xl overflow-hidden" style={{ height: 180 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={place.coverPhotoUrl} alt={place.name} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="flex-shrink-0 rounded-t-2xl bg-gray-100" style={{ height: 60 }} />
        )}

        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 flex-shrink-0 cursor-grab">
          <div className="w-9 h-[3px] rounded-full bg-gray-200" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/30 flex items-center justify-center hover:bg-black/40 transition-colors"
          aria-label="Close"
          style={{ zIndex: 1 }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pt-3 pb-6">

          {/* Place name */}
          <h2 className="text-[20px] font-bold text-gray-900 leading-tight mb-1">{place.name}</h2>

          {/* Rating */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {place.rating !== undefined && (
              <span className="flex items-center gap-1 text-[13px] text-gray-600">
                <StarRating rating={place.rating} />
                <span className="font-semibold">{place.rating.toFixed(1)}</span>
                {place.userRatingsTotal !== undefined && (
                  <span className="text-gray-400">· {place.userRatingsTotal.toLocaleString()} reviews</span>
                )}
              </span>
            )}
          </div>

          {/* Address */}
          {place.address && (
            <p className="text-[13px] text-gray-500 mb-2 leading-snug">{place.address}</p>
          )}

          {/* Hours */}
          {(place.openNow !== undefined || place.todayHours) && (
            <p className="text-[12px] mb-2">
              {place.openNow !== undefined && (
                <span className={`font-bold mr-1.5 ${place.openNow ? "text-green-600" : "text-red-500"}`}>
                  {place.openNow ? "Open now" : "Closed"}
                </span>
              )}
              {place.todayHours && <span className="text-gray-500">{place.todayHours}</span>}
            </p>
          )}

          {/* Phone + website */}
          {(place.phone || place.website) && (
            <div className="flex items-center gap-4 mb-4">
              {place.phone && (
                <a href={`tel:${place.phone}`} className="text-[12px] text-blue-600 hover:underline">
                  {place.phone}
                </a>
              )}
              {place.website && (
                <a href={place.website} target="_blank" rel="noopener noreferrer" className="text-[12px] text-blue-600 hover:underline truncate max-w-[180px]">
                  {place.website.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              )}
            </div>
          )}

          {/* ── Type pills ── */}
          <div className="flex gap-2 mb-2">
            {TYPE_OPTIONS.map(({ type: t, label }) => {
              const selected = type === t;
              const color    = PIN_COLORS[t];
              return (
                <button
                  key={t}
                  onClick={() => selectType(t)}
                  className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                  style={
                    selected
                      ? { background: color, color: "white", border: `1px solid ${color}` }
                      : { background: "transparent", color: "#6B7280", border: "1px solid #E5E7EB" }
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* ── Sub-type pills — appears instantly when type selected ── */}
          {type && (
            <div className="flex gap-2 flex-wrap mb-4">
              {SUB_TYPE_OPTIONS[type].map(({ label, value }) => {
                const selected = subType === value;
                return (
                  <button
                    key={value}
                    onClick={() => setSubType(value)}
                    className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                    style={
                      selected
                        ? { background: typeColor!, color: "white", border: `1px solid ${typeColor}` }
                        : { background: "transparent", color: "#6B7280", border: "1px solid #E5E7EB" }
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={!type || saving}
            className={`w-full py-3.5 rounded-xl text-[15px] font-bold transition-all ${
              type && !saving
                ? "text-white active:scale-[0.98] shadow-sm"
                : "bg-gray-100 text-gray-300 cursor-not-allowed"
            }`}
            style={type && !saving ? { background: typeColor! } : undefined}
          >
            {saving ? "Saving…" : "Save to Map"}
          </button>
        </div>
      </div>
    </div>
  );
}
