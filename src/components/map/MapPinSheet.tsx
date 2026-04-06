"use client";

import { useRef, useState } from "react";
import type { Card, Day } from "@/types/database";
import { PIN_COLORS } from "@/lib/mapPins";

// ── Constants ─────────────────────────────────────────────────
const INITIAL_HEIGHT_VH = 35;
const MIN_HEIGHT_PX     = 140;
const MAX_HEIGHT_VH     = 85;
const CLOSE_THRESHOLD   = 80; // px dragged down to dismiss

const SUB_TYPE_LABEL: Record<string, string> = {
  restaurant:       "Restaurant",
  fine_dining:      "Fine Dining",
  street_food:      "Street Food",
  coffee:           "Café & Dessert",
  cocktail_bar:     "Bar",
  guided:           "Guided",
  self_directed:    "Self-Directed",
  wellness:         "Wellness",
  event:            "Event",
  challenge:        "Challenge",
  hotel:            "Hotel",
  flight_arrival:   "Flight",
  transit:          "Transit",
  note:             "Note",
};

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h < 12 ? "am" : "pm";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${m.toString().padStart(2, "0")}${ampm}`;
}

interface Props {
  card: Card;
  days: Day[];
  onClose: () => void;
  onViewCard: () => void;
}

export default function MapPinSheet({ card, days, onClose, onViewCard }: Props) {
  const sheetRef    = useRef<HTMLDivElement>(null);
  const dragStartY  = useRef<number | null>(null);
  const dragStartH  = useRef<number>(0);
  const [heightPx, setHeightPx]   = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const details      = card.details as Record<string, unknown> | null;
  const rating       = details?.rating as number | undefined;
  const priceRange   = details?.price_range as string | undefined;
  const subTypeLabel = card.sub_type ? (SUB_TYPE_LABEL[card.sub_type] ?? card.sub_type) : null;
  const typeColor    = PIN_COLORS[card.type] ?? "#6B7280";

  // Find the day this card is scheduled on (in_itinerary only)
  const scheduledDay =
    card.status === "in_itinerary" && card.day_id
      ? (days.find((d) => d.id === card.day_id) ?? null)
      : null;

  // ── Drag-to-resize / drag-to-dismiss ─────────────────────────
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const sheet = sheetRef.current;
    if (!sheet) return;
    dragStartY.current = e.clientY;
    dragStartH.current = sheet.getBoundingClientRect().height;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragStartY.current === null || !sheetRef.current) return;
    const dy   = dragStartY.current - e.clientY; // positive = dragging up
    const maxH = window.innerHeight * MAX_HEIGHT_VH / 100;
    const newH = Math.max(MIN_HEIGHT_PX, Math.min(maxH, dragStartH.current + dy));
    // Directly mutate style for smooth 60fps drag — no React re-render per frame
    sheetRef.current.style.height = `${newH}px`;
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (dragStartY.current === null) return;
    const dy     = e.clientY - dragStartY.current; // positive = dragging down
    const finalH = sheetRef.current?.getBoundingClientRect().height ?? 0;
    dragStartY.current = null;
    setIsDragging(false);

    if (dy > CLOSE_THRESHOLD) {
      onClose();
    } else {
      setHeightPx(finalH); // persist the height the user dragged to
    }
  }

  const heightStyle: React.CSSProperties = {
    height:     heightPx !== null ? `${heightPx}px` : `${INITIAL_HEIGHT_VH}vh`,
    boxShadow:  "0 -4px 32px rgba(0,0,0,0.15)",
    transition: isDragging ? "none" : "height 0.2s ease",
  };

  return (
    <div
      ref={sheetRef}
      className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300"
      style={heightStyle}
    >
      {/* Drag handle — full-width touch target, pointer events scoped here */}
      <div
        className="flex-shrink-0 flex justify-center items-center h-8 cursor-grab active:cursor-grabbing touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="w-10 h-1 rounded-full bg-gray-200" />
      </div>

      {/* Cover photo — 100px, object-cover */}
      <div className="flex-shrink-0 h-[100px] overflow-hidden">
        {card.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.cover_image_url}
            alt={card.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: `linear-gradient(135deg, ${typeColor}18 0%, ${typeColor}38 100%)`,
            }}
          />
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-6">
        {/* Category badge */}
        {subTypeLabel && (
          <span
            className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full mb-2"
            style={{ background: typeColor + "1A", color: typeColor }}
          >
            {subTypeLabel}
          </span>
        )}

        {/* Venue name */}
        <h2 className="text-[16px] font-bold text-gray-900 leading-snug">{card.title}</h2>

        {/* Rating + price */}
        {(rating !== undefined || priceRange) && (
          <p className="text-[13px] text-amber-500 font-medium mt-1">
            {rating !== undefined ? `★ ${rating.toFixed(1)}` : ""}
            {rating !== undefined && priceRange ? " · " : ""}
            {priceRange ?? ""}
          </p>
        )}

        {/* Scheduled day/time */}
        {scheduledDay && (
          <p className="text-[12px] text-gray-400 mt-1">
            Day {scheduledDay.day_number}
            {card.start_time ? ` · ${formatTime(card.start_time)}` : ""}
            {card.end_time ? ` – ${formatTime(card.end_time)}` : ""}
          </p>
        )}

        {/* CTA buttons */}
        <div className="flex gap-2 mt-4">
          {card.lat != null && card.lng != null && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${card.lat},${card.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-50 border border-blue-100 text-[12px] font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
              Open in Maps
            </a>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onViewCard(); }}
            className="flex-1 flex items-center justify-center py-2.5 rounded-xl text-[12px] font-semibold text-white hover:opacity-90 transition-opacity"
            style={{ background: typeColor }}
          >
            View card
          </button>
        </div>
      </div>
    </div>
  );
}
