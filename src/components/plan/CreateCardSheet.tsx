"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Card, CardType } from "@/types/database";
import { createClient } from "@/lib/supabase/client";

type UiType = CardType | "note";

const TYPE_OPTIONS: { value: UiType; label: string }[] = [
  { value: "activity",  label: "Activity"  },
  { value: "food",      label: "Food"      },
  { value: "logistics", label: "Logistics" },
  { value: "note",      label: "Note"      },
];

const SUB_TYPES: Record<CardType, { value: string; label: string }[]> = {
  activity: [
    { value: "challenge",     label: "Challenge"     },
    { value: "guided",        label: "Guided"        },
    { value: "self_directed", label: "Self-Directed" },
    { value: "wellness",      label: "Wellness"      },
  ],
  food: [
    { value: "restaurant", label: "Restaurant" },
    { value: "coffee",     label: "Coffee"     },
    { value: "dessert",    label: "Dessert"    },
    { value: "bar",        label: "Bar"        },
  ],
  logistics: [
    { value: "flight_arrival",   label: "Flight Arrival"   },
    { value: "flight_departure", label: "Flight Departure" },
    { value: "hotel",            label: "Hotel"            },
  ],
};

interface Props {
  dayId: string;
  tripId: string;
  endPosition: number;
  onClose: () => void;
  onCardCreated: (card: Card) => void;
  initialLat?: number;
  initialLng?: number;
  initialStatus?: Card["status"];
  initialStartTime?: string;
}

export default function CreateCardSheet({
  dayId, tripId, endPosition, onClose, onCardCreated,
  initialLat, initialLng, initialStatus, initialStartTime,
}: Props) {
  const supabase  = createClient();
  const sheetRef  = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const dragY     = useRef(0);
  const dragging  = useRef(false);

  const [title,       setTitle]       = useState("");
  const [type,        setType]        = useState<UiType | null>(null);
  const [subType,     setSubType]     = useState<string | null>(null);
  const [startTime,   setStartTime]   = useState(initialStartTime ?? "");
  const [endTime,     setEndTime]     = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [saving,      setSaving]      = useState(false);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

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

  const handleCreate = useCallback(async () => {
    if (!title.trim() || saving) return;
    setSaving(true);

    const cardStatus  = initialStatus ?? "in_itinerary";
    const isNote      = type === "note";
    const cardType: CardType = isNote ? "activity" : ((type ?? "activity") as CardType);
    const cardSubType = isNote ? "note" : subType;
    const startTimeFmt = startTime ? `${startTime}:00` : null;
    const endTimeFmt   = endTime   ? `${endTime}:00`   : null;

    const newCard: Card = {
      id:              crypto.randomUUID(),
      day_id:          dayId,
      trip_id:         tripId,
      type:            cardType,
      sub_type:        cardSubType,
      title:           title.trim(),
      start_time:      startTimeFmt,
      end_time:        endTimeFmt,
      position:        endPosition,
      status:          cardStatus,
      source_url:      null,
      cover_image_url: null,
      lat:             initialLat ?? null,
      lng:             initialLng ?? null,
      address:         null,
      details:         {},
      ai_generated:    false,
      confirmed:       false,
      created_at:      new Date().toISOString(),
    };

    const { error } = await supabase.from("cards").insert({
      id: newCard.id, day_id: dayId, trip_id: tripId,
      type: cardType, sub_type: cardSubType, title: newCard.title,
      start_time: startTimeFmt, end_time: endTimeFmt,
      position: endPosition, status: cardStatus,
      lat: initialLat ?? null, lng: initialLng ?? null,
      address: null, details: {}, ai_generated: false,
    });

    setSaving(false);
    if (!error) onCardCreated(newCard);
  }, [
    title, type, subType, startTime, endTime, saving,
    dayId, tripId, endPosition, initialLat, initialLng, initialStatus, supabase, onCardCreated,
  ]);

  const canCreate  = title.trim().length > 0;
  const activeType = type === "note" ? null : (type as CardType | null);

  const pillStyle = (selected: boolean): React.CSSProperties => selected
    ? { background: "#1A1A2E", color: "white", border: "1px solid #1A1A2E" }
    : { background: "transparent", color: "#6B7280", border: "1px solid #E5E7EB" };

  const INPUT_CLS =
    "w-full text-[15px] text-gray-900 bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-gray-300 focus:bg-white transition-colors";

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
        className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet max-h-[80dvh] flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ willChange: "transform" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 flex-shrink-0 cursor-grab">
          <div className="w-9 h-[3px] rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-3 flex-shrink-0">
          <h2 className="text-[17px] font-bold text-gray-900">Add to this day</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-safe">
          {/* Title */}
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canCreate) handleCreate(); }}
            placeholder="Name this stop..."
            className="w-full text-[18px] font-bold text-gray-900 placeholder-gray-300 bg-transparent outline-none mb-3"
          />

          {/* Add details toggle */}
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-400 hover:text-gray-600 transition-colors mb-4"
          >
            <svg
              width="11" height="11" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              style={{ transform: showDetails ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 200ms" }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            {showDetails ? "Hide details" : "Add details"}
          </button>

          {showDetails && (
            <div>
              {/* Type chips */}
              <div className="mb-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Type</p>
                <div className="flex flex-wrap gap-2">
                  {TYPE_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => { setType(type === value ? null : value); setSubType(null); }}
                      className="px-3 py-1 rounded-full text-xs font-semibold transition-all border"
                      style={pillStyle(type === value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sub-type chips */}
              {activeType && (
                <div className="mb-3">
                  <div className="flex flex-wrap gap-2">
                    {SUB_TYPES[activeType].map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => setSubType(subType === value ? null : value)}
                        className="px-3 py-1 rounded-full text-xs font-semibold transition-all border"
                        style={pillStyle(subType === value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Time */}
              <div className="flex gap-3 mb-4">
                <div className="flex-1">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Start time</p>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className={INPUT_CLS}
                  />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">End time</p>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className={INPUT_CLS}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Add button */}
          <div className="pb-8 pt-1">
            <button
              onClick={handleCreate}
              disabled={!canCreate || saving}
              className="w-full py-3.5 rounded-xl text-[15px] font-bold transition-all active:scale-[0.98]"
              style={canCreate && !saving
                ? { background: "#1A1A2E", color: "white" }
                : { background: "#F3F4F6", color: "#D1D5DB", cursor: "not-allowed" }}
            >
              {saving ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
