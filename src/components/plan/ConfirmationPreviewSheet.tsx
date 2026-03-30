"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Card, CardType, DayWithCards } from "@/types/database";
import { createClient } from "@/lib/supabase/client";

export interface ParsedConfirmation {
  type:                "flight" | "hotel" | "restaurant" | "activity";
  title:               string;
  confirmation_number: string | null;
  date:                string | null;
  time:                string | null;
  end_time:            string | null;
  venue_name:          string | null;
  address:             string | null;
  phone:               string | null;
  website:             string | null;
  notes:               string | null;
}

interface Props {
  parsed:   ParsedConfirmation;
  days:     DayWithCards[];
  tripId:   string;
  onClose:  () => void;
  onCardCreated: (card: Card) => void;
}

function mapType(parsed: ParsedConfirmation): { type: CardType; sub_type: string } {
  switch (parsed.type) {
    case "flight": {
      const isDep = /depart|departure|outbound/i.test(parsed.title ?? "");
      return { type: "logistics", sub_type: isDep ? "flight_departure" : "flight_arrival" };
    }
    case "hotel":      return { type: "logistics", sub_type: "hotel" };
    case "restaurant": return { type: "food",      sub_type: "restaurant" };
    case "activity":
    default:           return { type: "activity",  sub_type: "guided" };
  }
}

function findMatchingDay(days: DayWithCards[], date: string | null): string | null {
  if (!date) return null;
  const match = days.find((d) => d.date === date);
  return match?.id ?? null;
}

function fmtDate(dateStr: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

const TYPE_CONF_LABEL: Record<string, string> = {
  flight: "Flight", hotel: "Hotel", restaurant: "Restaurant", activity: "Activity",
};

export default function ConfirmationPreviewSheet({ parsed, days, tripId, onClose, onCardCreated }: Props) {
  const supabase = createClient();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragY    = useRef(0);
  const dragging = useRef(false);

  const [title,   setTitle]   = useState(parsed.title ?? "");
  const [address, setAddress] = useState(parsed.address ?? parsed.venue_name ?? "");
  const [time,    setTime]    = useState(parsed.time ?? "");
  const [endTime, setEndTime] = useState(parsed.end_time ?? "");
  const [notes,   setNotes]   = useState(parsed.notes ?? "");
  const [confNo,  setConfNo]  = useState(parsed.confirmation_number ?? "");
  const [dayId,   setDayId]   = useState<string>(
    () => findMatchingDay(days, parsed.date) ?? (days[0]?.id ?? "")
  );
  const [saving, setSaving] = useState(false);

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

  const handleSave = useCallback(async () => {
    if (!title.trim() || !dayId || saving) return;
    setSaving(true);

    const { type: cardType, sub_type } = mapType(parsed);
    const selectedDay = days.find((d) => d.id === dayId);
    const endPos = selectedDay
      ? selectedDay.cards.reduce((m, c) => Math.max(m, c.position), 0) + 1
      : 1;

    const details: Record<string, unknown> = {};
    if (confNo.trim()) details.confirmation = confNo.trim();
    if (parsed.phone)  details.phone        = parsed.phone;
    if (parsed.website) details.website     = parsed.website;
    if (notes.trim())  details.notes        = notes.trim();

    const newCard: Card = {
      id:              crypto.randomUUID(),
      day_id:          dayId,
      trip_id:         tripId,
      type:            cardType,
      sub_type,
      title:           title.trim(),
      start_time:      time.trim() ? time.trim() + ":00" : null,
      end_time:        endTime.trim() ? endTime.trim() + ":00" : null,
      position:        endPos,
      status:          "in_itinerary",
      source_url:      null,
      cover_image_url: null,
      lat:             null,
      lng:             null,
      address:         address.trim() || null,
      details,
      ai_generated:    false,
      created_at:      new Date().toISOString(),
    };

    const { error } = await supabase.from("cards").insert({
      id:           newCard.id,
      day_id:       newCard.day_id,
      trip_id:      newCard.trip_id,
      type:         newCard.type,
      sub_type:     newCard.sub_type,
      title:        newCard.title,
      start_time:   newCard.start_time,
      end_time:     newCard.end_time,
      position:     newCard.position,
      status:       newCard.status,
      source_url:   null,
      cover_image_url: null,
      lat:          null, lng: null,
      address:      newCard.address,
      details:      newCard.details,
      ai_generated: false,
    });

    setSaving(false);
    if (!error) onCardCreated(newCard);
  }, [title, address, time, endTime, notes, confNo, dayId, days, tripId, parsed, saving, supabase, onCardCreated]);

  const typeLabel = TYPE_CONF_LABEL[parsed.type] ?? "Confirmation";

  return (
    <div className="fixed inset-0 z-60 flex items-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/30 animate-in fade-in duration-200" />

      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet max-h-[90dvh] flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ willChange: "transform" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 flex-shrink-0 cursor-grab">
          <div className="w-9 h-[3px] rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-gray-100 flex-shrink-0">
          <div>
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Confirmation parsed</p>
            <h3 className="text-[16px] font-bold text-gray-900">{typeLabel}</h3>
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

        {/* Fields */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Title */}
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300 focus:bg-white transition-colors"
            />
          </div>

          {/* Day assignment */}
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Assign to day
              {parsed.date && <span className="ml-1 font-normal normal-case text-gray-400">({parsed.date})</span>}
            </label>
            <select
              value={dayId}
              onChange={(e) => setDayId(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300 appearance-none"
            >
              {days.map((d) => (
                <option key={d.id} value={d.id}>
                  Day {d.day_number}{d.date ? ` — ${fmtDate(d.date)}` : ""}
                  {d.day_name ? ` (${d.day_name})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Time */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Start time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300"
              />
            </div>
            <div className="flex-1">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">End time</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Address / Venue</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300 focus:bg-white transition-colors"
            />
          </div>

          {/* Confirmation number */}
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Confirmation #</label>
            <input
              type="text"
              value={confNo}
              onChange={(e) => setConfNo(e.target.value)}
              placeholder="e.g. ABC123"
              className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300 focus:bg-white transition-colors placeholder-gray-300"
            />
          </div>

          {/* Notes */}
          {(parsed.notes || parsed.phone || parsed.website) && (
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full mt-1 px-3 py-2 text-[14px] text-gray-700 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300 focus:bg-white transition-colors resize-none"
              />
            </div>
          )}
        </div>

        {/* Save */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100">
          <button
            onClick={handleSave}
            disabled={!title.trim() || !dayId || saving}
            className={`w-full py-3.5 rounded-xl text-[15px] font-bold transition-all ${
              title.trim() && dayId && !saving
                ? "bg-logistics text-white active:scale-[0.98] shadow-sm"
                : "bg-gray-100 text-gray-300 cursor-not-allowed"
            }`}
          >
            {saving ? "Adding to plan…" : "Add to Plan"}
          </button>
        </div>
      </div>
    </div>
  );
}
