"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Card, CardType } from "@/types/database";
import { createClient } from "@/lib/supabase/client";

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

// ── Type config (same palette as CreateCardSheet) ─────────────
const TYPE_CONFIG: Record<CardType, { label: string; color: string; bg: string; selectedBg: string; border: string; selectedBorder: string }> = {
  activity: {
    label: "Activity",
    color: "#0D9488",
    bg: "bg-teal-50", selectedBg: "bg-teal-100",
    border: "border-teal-100", selectedBorder: "border-activity",
  },
  food: {
    label: "Food",
    color: "#F59E0B",
    bg: "bg-amber-50", selectedBg: "bg-amber-100",
    border: "border-amber-100", selectedBorder: "border-food",
  },
  logistics: {
    label: "Logistics",
    color: "#64748B",
    bg: "bg-slate-50", selectedBg: "bg-slate-100",
    border: "border-slate-100", selectedBorder: "border-logistics",
  },
};

const SUB_TYPES: Record<CardType, { value: string; label: string }[]> = {
  activity: [
    { value: "self_directed", label: "Self-directed" },
    { value: "guided",        label: "Guided"        },
    { value: "wellness",      label: "Wellness"      },
    { value: "event",         label: "Event"         },
    { value: "challenge",     label: "Challenge"     },
  ],
  food: [
    { value: "restaurant",   label: "Restaurant"   },
    { value: "coffee",       label: "Coffee"       },
    { value: "cocktail_bar", label: "Cocktail Bar" },
    { value: "fine_dining",  label: "Fine Dining"  },
  ],
  logistics: [
    { value: "hotel",            label: "Hotel"            },
    { value: "flight_arrival",   label: "Flight Arrival"   },
    { value: "flight_departure", label: "Flight Departure" },
    { value: "transit",          label: "Transit"          },
  ],
};

const LABEL_CLS = "block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide";
const INPUT_CLS = "w-full text-[15px] text-gray-900 bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-activity placeholder:text-gray-300 transition-colors";

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = rating >= i - 0.25;
        return (
          <svg key={i} width="12" height="12" viewBox="0 0 24 24" fill={filled ? "#F59E0B" : "none"} stroke="#F59E0B" strokeWidth="1.5">
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
          </svg>
        );
      })}
    </div>
  );
}

export default function AddToTripSheet({ place, tripId, dayId, onClose, onCardCreated }: Props) {
  const supabase = createClient();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragY    = useRef(0);
  const dragging = useRef(false);

  const [title,     setTitle]     = useState(place.name);
  const [type,      setType]      = useState<CardType | null>(null);
  const [subType,   setSubType]   = useState<string | null>(null);
  const [startTime, setStartTime] = useState("");
  const [endTime,   setEndTime]   = useState("");
  const [notes,     setNotes]     = useState("");
  const [saving,    setSaving]    = useState(false);

  // Reset sub-type when type changes
  useEffect(() => { setSubType(null); }, [type]);

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── Drag to dismiss ────────────────────────────────────────
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

  // ── Save ───────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!type || saving) return;
    setSaving(true);

    const startTimeFmt = startTime ? `${startTime}:00` : null;
    const endTimeFmt   = endTime   ? `${endTime}:00`   : null;
    const details: Record<string, unknown> = {};
    if (notes.trim())    details.notes   = notes.trim();
    if (place.website)   details.website = place.website;
    if (place.phone)     details.phone   = place.phone;
    if (place.rating)    details.rating  = place.rating;

    const newCard: Card = {
      id:              crypto.randomUUID(),
      day_id:          dayId,
      trip_id:         tripId,
      type,
      sub_type:        subType,
      title:           title.trim() || place.name,
      start_time:      startTimeFmt,
      end_time:        endTimeFmt,
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
      sub_type:        subType,
      title:           newCard.title,
      start_time:      startTimeFmt,
      end_time:        endTimeFmt,
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
  }, [type, subType, title, startTime, endTime, notes, saving, place, dayId, tripId, supabase, onCardCreated]);

  const cfg = type ? TYPE_CONFIG[type] : null;
  const hasPreviewInfo = place.rating !== undefined || place.phone || place.openNow !== undefined || place.todayHours;

  return (
    <div
      className="fixed inset-0 z-60 flex items-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 animate-in fade-in duration-200" />

      {/* Sheet */}
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet max-h-[92dvh] flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ willChange: "transform" }}
      >
        {/* Cover photo */}
        {place.coverPhotoUrl && (
          <div className="flex-shrink-0 overflow-hidden rounded-t-2xl" style={{ height: 160 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={place.coverPhotoUrl} alt={place.name} className="w-full h-full object-cover" />
          </div>
        )}

        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 flex-shrink-0 cursor-grab">
          <div className="w-9 h-[3px] rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-3 flex-shrink-0">
          <h2 className="text-[17px] font-bold text-gray-900">Add to Trip</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 pb-8">

          {/* Place name (editable) */}
          <div className="mb-4">
            <label className={LABEL_CLS}>Place name</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={place.name}
              className={INPUT_CLS}
            />
          </div>

          {/* Address */}
          <div className="mb-3 flex items-start gap-2 px-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <p className="text-[13px] text-gray-500 leading-snug">{place.address}</p>
          </div>

          {/* Rich preview: rating, hours, phone */}
          {hasPreviewInfo && (
            <div className="mb-4 bg-gray-50 rounded-xl p-3 space-y-2">
              {place.rating !== undefined && (
                <div className="flex items-center gap-2">
                  <StarRating rating={place.rating} />
                  <span className="text-[13px] font-semibold text-gray-700">{place.rating.toFixed(1)}</span>
                  {place.userRatingsTotal !== undefined && (
                    <span className="text-[12px] text-gray-400">({place.userRatingsTotal.toLocaleString()})</span>
                  )}
                </div>
              )}
              {(place.openNow !== undefined || place.todayHours) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {place.openNow !== undefined && (
                    <span className={`text-[11px] font-bold ${place.openNow ? "text-green-600" : "text-red-500"}`}>
                      {place.openNow ? "Open now" : "Closed"}
                    </span>
                  )}
                  {place.todayHours && (
                    <span className="text-[12px] text-gray-500">{place.todayHours}</span>
                  )}
                </div>
              )}
              {place.phone && (
                <div className="flex items-center gap-2">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.5 1.18 2 2 0 012.5 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.18 6.18l.88-.88a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                  </svg>
                  <span className="text-[12px] text-gray-600">{place.phone}</span>
                </div>
              )}
            </div>
          )}

          {/* Type selector */}
          <div className="mb-4">
            <label className={LABEL_CLS}>Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(TYPE_CONFIG) as CardType[]).map((t) => {
                const c        = TYPE_CONFIG[t];
                const selected = type === t;
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-2.5 transition-all text-[11px] font-bold ${
                      selected
                        ? `${c.selectedBg} ${c.selectedBorder}`
                        : `${c.bg} ${c.border} text-gray-400`
                    }`}
                    style={selected ? { color: c.color } : undefined}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sub-type */}
          {type && (
            <div className="mb-4">
              <label className={LABEL_CLS}>Sub-type</label>
              <div className="flex flex-wrap gap-2">
                {SUB_TYPES[type].map(({ value, label }) => {
                  const selected = subType === value;
                  return (
                    <button
                      key={value}
                      onClick={() => setSubType(selected ? null : value)}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all ${
                        selected
                          ? `border-2 text-white`
                          : "bg-gray-50 border-gray-200 text-gray-500"
                      }`}
                      style={selected ? { background: cfg!.color, borderColor: cfg!.color } : undefined}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Time */}
          {type && (
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className={LABEL_CLS}>Start time</label>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={INPUT_CLS} />
              </div>
              <div className="flex-1">
                <label className={LABEL_CLS}>End time</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={INPUT_CLS} />
              </div>
            </div>
          )}

          {/* Notes */}
          {type && (
            <div className="mb-4">
              <label className={LABEL_CLS}>Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes…"
                rows={3}
                className={`${INPUT_CLS} resize-none`}
              />
            </div>
          )}

          {/* Save button */}
          <div className="pt-2">
            <button
              onClick={handleSave}
              disabled={!type || saving}
              className={`w-full py-3.5 rounded-xl text-[15px] font-bold transition-all ${
                type && !saving
                  ? "bg-activity text-white active:scale-[0.98]"
                  : "bg-gray-100 text-gray-300 cursor-not-allowed"
              }`}
            >
              {saving ? "Saving…" : "Save to Map"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
