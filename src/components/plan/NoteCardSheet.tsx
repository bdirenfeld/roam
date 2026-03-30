"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Card } from "@/types/database";
import { createClient } from "@/lib/supabase/client";

interface Props {
  dayId: string;
  tripId: string;
  endPosition: number;
  onClose: () => void;
  onCardCreated: (card: Card) => void;
}

export default function NoteCardSheet({ dayId, tripId, endPosition, onClose, onCardCreated }: Props) {
  const supabase  = createClient();
  const sheetRef  = useRef<HTMLDivElement>(null);
  const dragY     = useRef(0);
  const dragging  = useRef(false);
  const titleRef  = useRef<HTMLInputElement>(null);

  const [title,  setTitle]  = useState("");
  const [notes,  setNotes]  = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setTimeout(() => titleRef.current?.focus(), 80);
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

  const handleSave = useCallback(async () => {
    if (!title.trim() || saving) return;
    setSaving(true);

    const now = new Date().toISOString();
    const newCard: Card = {
      id:              crypto.randomUUID(),
      day_id:          dayId,
      trip_id:         tripId,
      type:            "activity",
      sub_type:        "note",
      title:           title.trim(),
      start_time:      null,
      end_time:        null,
      position:        endPosition,
      status:          "in_itinerary",
      source_url:      null,
      cover_image_url: null,
      lat:             null,
      lng:             null,
      address:         null,
      details:         notes.trim() ? { notes: notes.trim() } : {},
      ai_generated:    false,
      created_at:      now,
    };

    const { error } = await supabase.from("cards").insert({
      id:           newCard.id,
      day_id:       newCard.day_id,
      trip_id:      newCard.trip_id,
      type:         newCard.type,
      sub_type:     newCard.sub_type,
      title:        newCard.title,
      start_time:   null,
      end_time:     null,
      position:     newCard.position,
      status:       newCard.status,
      source_url:   null,
      cover_image_url: null,
      lat:          null,
      lng:          null,
      address:      null,
      details:      newCard.details,
      ai_generated: false,
    });

    setSaving(false);
    if (!error) onCardCreated(newCard);
  }, [title, notes, saving, dayId, tripId, endPosition, supabase, onCardCreated]);

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
        <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span className="text-[12px] font-semibold text-gray-400">Note</span>
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-6">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title…"
            className="w-full text-[18px] font-bold text-gray-900 placeholder-gray-300 bg-transparent outline-none mb-3"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); } }}
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Start writing…"
            rows={6}
            className="w-full text-[14px] text-gray-700 placeholder-gray-300 bg-transparent resize-none outline-none leading-relaxed"
          />
        </div>

        {/* Save button */}
        <div className="flex-shrink-0 px-5 pb-6 pt-3 border-t border-gray-100">
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className={`w-full py-3.5 rounded-xl text-[15px] font-bold transition-all ${
              title.trim() && !saving
                ? "bg-gray-800 text-white active:scale-[0.98] shadow-sm"
                : "bg-gray-100 text-gray-300 cursor-not-allowed"
            }`}
          >
            {saving ? "Saving…" : "Add Note"}
          </button>
        </div>
      </div>
    </div>
  );
}
