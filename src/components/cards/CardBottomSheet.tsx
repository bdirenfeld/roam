"use client";

import { useEffect, useRef, useCallback } from "react";
import type { Card } from "@/types/database";
import LogisticsDetail from "./detail/LogisticsDetail";
import ActivityDetail from "./detail/ActivityDetail";
import FoodDetail from "./detail/FoodDetail";

interface Props {
  card: Card;
  onClose: () => void;
}

const SUB_TYPE_LABEL: Record<string, string> = {
  flight_arrival:   "Flight Arrival",
  flight_departure: "Flight Departure",
  self_directed:    "Self-Directed",
  hosted:           "Guided Experience",
  wellness:         "Wellness",
  restaurant:       "Restaurant",
  coffee_dessert:   "Coffee & Pastry",
  drinks:           "Drinks",
};

const TYPE_ACCENT: Record<string, { dot: string; bg: string; text: string }> = {
  logistics: { dot: "bg-logistics", bg: "bg-slate-50",  text: "text-logistics" },
  activity:  { dot: "bg-activity",  bg: "bg-teal-50",   text: "text-activity"  },
  food:      { dot: "bg-food",      bg: "bg-amber-50",  text: "text-food"      },
};

function formatTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const p = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${p}`;
}

function durationLabel(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// Booking status badge config
function bookingBadge(details: Record<string, unknown>) {
  const status = details.reservation_status as string | undefined;
  const refundable = details.refundable as boolean | undefined;
  if (status === "reserved") return { label: "Reserved", classes: "bg-green-50 text-green-600 border-green-100" };
  if (details.supplier)      return { label: refundable === false ? "Booked · Non-refundable" : "Booked", classes: "bg-teal-50 text-activity border-teal-100" };
  if (status === "walk-in")  return { label: "Walk-in", classes: "bg-gray-50 text-gray-500 border-gray-100" };
  return null;
}

export default function CardBottomSheet({ card, onClose }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragY = useRef(0);
  const isDragging = useRef(false);

  // ── keyboard escape ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── body scroll lock ─────────────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ── drag-to-dismiss ───────────────────────────────────────
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

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging.current || !sheetRef.current) return;
      isDragging.current = false;
      const dy = e.changedTouches[0].clientY - dragY.current;

      if (dy > 120) {
        // Dismiss — animate sheet off screen then call onClose
        sheetRef.current.style.transition = "transform 250ms cubic-bezier(0.32,0.72,0,1)";
        sheetRef.current.style.transform = "translateY(100%)";
        setTimeout(onClose, 240);
      } else {
        // Snap back
        sheetRef.current.style.transition = "transform 300ms cubic-bezier(0.34,1.56,0.64,1)";
        sheetRef.current.style.transform = "translateY(0)";
      }
    },
    [onClose]
  );

  const accent = TYPE_ACCENT[card.type] ?? TYPE_ACCENT.logistics;
  const typeLabel = SUB_TYPE_LABEL[card.sub_type ?? ""] ?? card.type;
  const timeRange = (() => {
    const s = formatTime(card.start_time);
    const e = formatTime(card.end_time);
    if (s && e) return `${s} – ${e}`;
    if (s) return s;
    return null;
  })();
  const duration = durationLabel(card.start_time, card.end_time);
  const badge = bookingBadge(card.details);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
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
        className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet max-h-[90dvh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300"
        style={{ willChange: "transform" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-0 flex-shrink-0 cursor-grab">
          <div className="w-9 h-[3px] rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="px-5 pt-3 pb-4 flex-shrink-0 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${accent.bg}`}>
                <span className={`w-2 h-2 rounded-full ${accent.dot}`} />
                <span className={`text-[11px] font-semibold ${accent.text}`}>{typeLabel}</span>
              </div>
              {badge && (
                <span className={`text-[11px] font-semibold px-2 py-1 rounded-lg border ${badge.classes}`}>
                  {badge.label}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 hover:bg-gray-200 transition-colors"
              aria-label="Close"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <h2 className="text-[19px] font-bold text-gray-900 mt-2.5 leading-snug">{card.title}</h2>

          {/* Time range + duration */}
          {(timeRange || duration) && (
            <div className="flex items-center gap-2 mt-1">
              {timeRange && (
                <span className="text-sm text-gray-400 font-medium">{timeRange}</span>
              )}
              {duration && (
                <>
                  {timeRange && <span className="text-gray-200 text-sm">·</span>}
                  <span className="text-xs font-semibold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
                    {duration}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Scrollable detail content */}
        <div className="overflow-y-auto flex-1 px-5 py-5">
          {card.type === "logistics" && <LogisticsDetail card={card} />}
          {card.type === "activity"  && <ActivityDetail  card={card} />}
          {card.type === "food"      && <FoodDetail      card={card} />}
        </div>
      </div>
    </div>
  );
}
