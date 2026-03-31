"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Card, DayWithCards } from "@/types/database";
import { createClient } from "@/lib/supabase/client";

interface Props {
  tripId: string;
  days:   DayWithCards[];
}

// ── Group definitions (order = display order) ─────────────────
const GROUPS: { key: string; label: string; test: (c: Card) => boolean }[] = [
  {
    key:   "activity",
    label: "Activity",
    test:  (c) => c.type === "activity" && c.sub_type !== "note",
  },
  {
    key:   "restaurant",
    label: "Food — Restaurants",
    test:  (c) => c.type === "food" && c.sub_type === "restaurant",
  },
  {
    key:   "coffee",
    label: "Food — Cafés",
    test:  (c) => c.type === "food" && ["coffee", "coffee_dessert"].includes(c.sub_type ?? ""),
  },
  {
    key:   "bar",
    label: "Food — Bars",
    test:  (c) => c.type === "food" && ["cocktail_bar", "drinks", "bar"].includes(c.sub_type ?? ""),
  },
  {
    key:   "food_other",
    label: "Food",
    test:  (c) => c.type === "food",
  },
  {
    key:   "hotel",
    label: "Hotels",
    test:  (c) => c.type === "logistics" && c.sub_type === "hotel",
  },
  {
    key:   "logistics",
    label: "Logistics",
    test:  (c) => c.type === "logistics",
  },
];

function fmtDay(d: DayWithCards): string {
  if (!d.date) return `Day ${d.day_number}`;
  const [y, mo, day] = d.date.split("-").map(Number);
  const label = new Date(y, mo - 1, day).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
  return `Day ${d.day_number} — ${label}`;
}

export default function TriageView({ tripId, days }: Props) {
  const supabase     = createClient();
  const totalRef     = useRef(0);
  const [cards,          setCards]          = useState<Card[]>([]);
  const [fading,         setFading]         = useState<Set<string>>(new Set());
  const [loading,        setLoading]        = useState(true);
  const [scheduledCount, setScheduledCount] = useState(0);

  // Fetch all interested cards for this trip
  useEffect(() => {
    supabase
      .from("cards")
      .select("*")
      .eq("trip_id", tripId)
      .eq("status", "interested")
      .order("type")
      .order("title")
      .then(({ data }) => {
        const items = (data ?? []) as Card[];
        totalRef.current = items.length;
        setCards(items);
        setLoading(false);
      });
  }, [tripId, supabase]);

  const fadeOut = useCallback((cardId: string) => {
    setFading((prev) => new Set(Array.from(prev).concat(cardId)));
    setTimeout(() => {
      setCards((prev) => prev.filter((c) => c.id !== cardId));
      setFading((prev) => { const n = new Set(prev); n.delete(cardId); return n; });
    }, 320);
  }, []);

  const scheduleCard = useCallback(async (cardId: string, dayId: string) => {
    fadeOut(cardId);
    setScheduledCount((n) => n + 1);
    await supabase.from("cards")
      .update({ day_id: dayId, status: "in_itinerary" })
      .eq("id", cardId);
  }, [supabase, fadeOut]);

  const cutCard = useCallback(async (cardId: string) => {
    fadeOut(cardId);
    await supabase.from("cards").update({ status: "cut" }).eq("id", cardId);
  }, [supabase, fadeOut]);

  // Build groups (each card appears in at most one group — first match wins)
  const assigned = new Set<string>();
  const grouped = GROUPS.map((g) => {
    const groupCards = cards.filter((c) => !assigned.has(c.id) && g.test(c));
    groupCards.forEach((c) => assigned.add(c.id));
    return { ...g, cards: groupCards };
  }).filter((g) => g.cards.length > 0);

  const remaining = cards.length;

  return (
    <div className="flex-1 overflow-auto">
      {/* Progress bar */}
      <div className="px-4 py-2.5 bg-white border-b border-gray-100 sticky top-0 z-10 flex items-center gap-3">
        <p className="text-[12px] font-semibold text-gray-600 flex-1">
          {loading
            ? "Loading places…"
            : remaining === 0
              ? "All places scheduled"
              : `${remaining} place${remaining !== 1 ? "s" : ""} to schedule`}
        </p>
        {scheduledCount > 0 && (
          <span className="text-[11px] font-semibold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
            {scheduledCount} assigned
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-[13px] text-gray-400">Loading places…</p>
        </div>
      ) : remaining === 0 && scheduledCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <p className="text-[13px] font-medium text-gray-500">No interested places found</p>
          <p className="text-[12px] text-gray-400 mt-1">
            Pin places on the map to add them here.
          </p>
        </div>
      ) : remaining === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <p className="text-[14px] font-semibold text-gray-700">All places scheduled</p>
          <p className="text-[12px] text-gray-400 mt-1">
            Switch to Board to review your itinerary.
          </p>
        </div>
      ) : (
        grouped.map(({ key, label, cards: groupCards }) => (
          <div key={key}>
            {/* Group header */}
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 sticky top-[41px] z-[9]">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                {label} ({groupCards.length})
              </span>
            </div>

            {groupCards.map((card) => {
              const details = card.details as Record<string, unknown> | null;
              const rating  = typeof details?.rating === "number" ? (details.rating as number) : null;
              const isFading = fading.has(card.id);

              return (
                <div
                  key={card.id}
                  className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 transition-all duration-300 ease-in-out"
                  style={{
                    opacity:   isFading ? 0   : 1,
                    transform: isFading ? "translateX(12px)" : "none",
                  }}
                >
                  {/* Thumbnail */}
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                    {card.cover_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={card.cover_image_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round">
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                          <circle cx="12" cy="9" r="2.5" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Name + rating */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900 truncate">{card.title}</p>
                    {rating !== null && (
                      <p className="text-[11px] text-amber-500 font-medium leading-tight">
                        ★ {rating.toFixed(1)}
                      </p>
                    )}
                  </div>

                  {/* Day picker */}
                  <div className="relative flex-shrink-0">
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) scheduleCard(card.id, e.target.value);
                      }}
                      className="text-[12px] font-semibold text-gray-600 bg-gray-100 rounded-lg pl-2.5 pr-6 py-1.5 appearance-none outline-none cursor-pointer hover:bg-gray-200 transition-colors"
                    >
                      <option value="" disabled>Unassigned</option>
                      {days.map((d) => (
                        <option key={d.id} value={d.id}>{fmtDay(d)}</option>
                      ))}
                    </select>
                    <svg
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      width="10" height="10" viewBox="0 0 24 24" fill="none"
                      stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>

                  {/* Cut button */}
                  <button
                    onClick={() => cutCard(card.id)}
                    className="w-6 h-6 flex items-center justify-center rounded-full text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0"
                    aria-label="Mark as cut"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
