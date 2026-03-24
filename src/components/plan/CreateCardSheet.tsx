"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Card, CardType } from "@/types/database";
import { createClient } from "@/lib/supabase/client";

// ── Sub-type options per card type ─────────────────────────────
const SUB_TYPES: Record<CardType, { value: string; label: string }[]> = {
  activity: [
    { value: "self_directed", label: "Self-directed" },
    { value: "guided",        label: "Guided" },
    { value: "wellness",      label: "Wellness" },
  ],
  food: [
    { value: "restaurant",  label: "Restaurant" },
    { value: "coffee",      label: "Coffee" },
    { value: "cocktail_bar", label: "Cocktail Bar" },
    { value: "fine_dining", label: "Fine Dining" },
  ],
  logistics: [
    { value: "flight_arrival",   label: "Flight Arrival" },
    { value: "flight_departure", label: "Flight Departure" },
    { value: "hotel",            label: "Hotel" },
    { value: "transit",          label: "Transit" },
  ],
};

// ── Type tile config ───────────────────────────────────────────
interface TypeConfig {
  label: string;
  bg: string;
  selectedBg: string;
  border: string;
  selectedBorder: string;
  text: string;
  icon: React.ReactNode;
}

const TYPE_CONFIG: Record<CardType, TypeConfig> = {
  activity: {
    label: "Activity",
    bg: "bg-teal-50",
    selectedBg: "bg-teal-100",
    border: "border-teal-100",
    selectedBorder: "border-activity",
    text: "text-activity",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="2" />
        <path d="M12 10v5" />
        <path d="M9 14l3 3 3-3" />
        <path d="M7 20l2-3" />
        <path d="M17 20l-2-3" />
      </svg>
    ),
  },
  food: {
    label: "Food",
    bg: "bg-amber-50",
    selectedBg: "bg-amber-100",
    border: "border-amber-100",
    selectedBorder: "border-food",
    text: "text-food",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
        <path d="M7 2v20" />
        <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" />
      </svg>
    ),
  },
  logistics: {
    label: "Logistics",
    bg: "bg-slate-50",
    selectedBg: "bg-slate-100",
    border: "border-slate-100",
    selectedBorder: "border-logistics",
    text: "text-logistics",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21 4 19 4c-1 0-2 .5-2.8 1.3L13 9 4.8 7.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.1z" />
      </svg>
    ),
  },
};

// ── Props ──────────────────────────────────────────────────────
interface Props {
  dayId: string;
  tripId: string;
  endPosition: number; // position = end of day + 1
  onClose: () => void;
  onCardCreated: (card: Card) => void;
}

export default function CreateCardSheet({
  dayId,
  tripId,
  endPosition,
  onClose,
  onCardCreated,
}: Props) {
  const supabase = createClient();
  const sheetRef  = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const dragY     = useRef(0);
  const isDragging = useRef(false);

  const [title,   setTitle]   = useState("");
  const [type,    setType]    = useState<CardType | null>(null);
  const [subType, setSubType] = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);

  // Auto-focus title on mount
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Keyboard escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Reset sub_type when type changes
  const handleTypeSelect = (t: CardType) => {
    setType(t);
    setSubType(null);
  };

  // ── Drag-to-dismiss ─────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragY.current = e.touches[0].clientY;
    isDragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !sheetRef.current) return;
    const dy = Math.max(0, e.touches[0].clientY - dragY.current);
    sheetRef.current.style.transform = `translateY(${dy}px)`;
    sheetRef.current.style.transition = "none";
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !sheetRef.current) return;
    isDragging.current = false;
    const dy = e.changedTouches[0].clientY - dragY.current;
    if (dy > 120) {
      sheetRef.current.style.transition = "transform 250ms cubic-bezier(0.32,0.72,0,1)";
      sheetRef.current.style.transform = "translateY(100%)";
      setTimeout(onClose, 240);
    } else {
      sheetRef.current.style.transition = "transform 300ms cubic-bezier(0.34,1.56,0.64,1)";
      sheetRef.current.style.transform = "translateY(0)";
    }
  }, [onClose]);

  // ── Create ──────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!title.trim() || !type || saving) return;
    setSaving(true);

    const newCard: Card = {
      id: crypto.randomUUID(),
      day_id: dayId,
      trip_id: tripId,
      type,
      sub_type: subType,
      title: title.trim(),
      start_time: null,
      end_time: null,
      position: endPosition,
      status: "in_itinerary",
      source_url: null,
      cover_image_url: null,
      lat: null,
      lng: null,
      address: null,
      details: {},
      ai_generated: false,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("cards").insert({
      id: newCard.id,
      day_id: dayId,
      trip_id: tripId,
      type,
      sub_type: subType,
      title: newCard.title,
      position: endPosition,
      status: "in_itinerary",
      details: {},
    });

    setSaving(false);

    if (!error) {
      onCardCreated(newCard);
    }
  }, [title, type, subType, saving, dayId, tripId, endPosition, supabase, onCardCreated]);

  const canCreate = title.trim().length > 0 && type !== null;
  const cfg = type ? TYPE_CONFIG[type] : null;

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
        className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet min-h-[40dvh] max-h-[90dvh] flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ willChange: "transform" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-0 flex-shrink-0 cursor-grab">
          <div className="w-9 h-[3px] rounded-full bg-gray-200" />
        </div>

        {/* Header row */}
        <div className="flex items-center justify-between px-5 pt-3 pb-4 flex-shrink-0">
          <h2 className="text-[17px] font-bold text-gray-900">New card</h2>
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

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 pb-safe">

          {/* Title input */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Title
            </label>
            <input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canCreate) handleCreate(); }}
              placeholder="Card title…"
              className="w-full text-[15px] text-gray-900 bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-activity placeholder:text-gray-300 transition-colors"
            />
          </div>

          {/* Type selector */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(TYPE_CONFIG) as CardType[]).map((t) => {
                const c = TYPE_CONFIG[t];
                const selected = type === t;
                return (
                  <button
                    key={t}
                    onClick={() => handleTypeSelect(t)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 transition-all ${
                      selected
                        ? `${c.selectedBg} ${c.selectedBorder} ${c.text}`
                        : `${c.bg} ${c.border} text-gray-400`
                    }`}
                  >
                    {c.icon}
                    <span className="text-[11px] font-bold">{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sub-type selector — shown after type is picked */}
          {type && (
            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                Sub-type
              </label>
              <div className="flex flex-wrap gap-2">
                {SUB_TYPES[type].map(({ value, label }) => {
                  const selected = subType === value;
                  return (
                    <button
                      key={value}
                      onClick={() => setSubType(selected ? null : value)}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all ${
                        selected
                          ? `${cfg!.selectedBg} ${cfg!.selectedBorder} ${cfg!.text}`
                          : "bg-gray-50 border-gray-200 text-gray-500"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Create button */}
          <div className="pb-6">
            <button
              onClick={handleCreate}
              disabled={!canCreate || saving}
              className={`w-full py-3.5 rounded-xl text-[15px] font-bold transition-all ${
                canCreate && !saving
                  ? "bg-activity text-white active:scale-[0.98]"
                  : "bg-gray-100 text-gray-300 cursor-not-allowed"
              }`}
            >
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
