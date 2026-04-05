"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DayStrip from "@/components/day/DayStrip";
import DayMap from "@/components/day/DayMap";
import CardTimeline from "@/components/day/CardTimeline";
import CardBottomSheet from "@/components/cards/CardBottomSheet";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import type { Trip, Day, DayWithCards, Card } from "@/types/database";

interface Props {
  trip: Trip;
  days: Day[];
  dayWithCards: DayWithCards;
  hotelCards: Card[];
}

export default function DayViewClient({ trip, days, dayWithCards, hotelCards }: Props) {
  const router = useRouter();
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  // Keep a local copy of cards so edits made in the sheet reflect in the list
  const [localCards, setLocalCards] = useState<Card[]>(dayWithCards.cards);

  const handleCardUpdate = useCallback(
    (updated: Card) => {
      setLocalCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setSelectedCard((prev) => (prev?.id === updated.id ? updated : prev));
    },
    []
  );

  const handleCardDelete = useCallback((cardId: string) => {
    setLocalCards((prev) => prev.filter((c) => c.id !== cardId));
    setSelectedCard((prev) => (prev?.id === cardId ? null : prev));
    setIsCardOpen(false);
  }, []);

  const [isCardOpen, setIsCardOpen] = useState(false);
  const [swipeDir, setSwipeDir] = useState<'left' | 'right' | null>(null);

  // ── Pin ↔ card linking state ───────────────────────────────────
  // Highlighted card (flash ring): set when a map pin is tapped
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);

  // Reset swipe animation class after it has played
  useEffect(() => {
    if (!swipeDir) return;
    const t = setTimeout(() => setSwipeDir(null), 200);
    return () => clearTimeout(t);
  }, [swipeDir]);

  const currentIndex = days.findIndex((d) => d.id === dayWithCards.id);
  const prevDay = currentIndex > 0 ? days[currentIndex - 1] : null;
  const nextDay = currentIndex < days.length - 1 ? days[currentIndex + 1] : null;

  const handleDaySelect = useCallback(
    (day: Day) => {
      router.push(`/trips/${trip.id}/days/${day.id}`);
    },
    [router, trip.id]
  );

  const goToPrevDay = useCallback(() => {
    if (!prevDay) return;
    setSwipeDir('right');
    router.push(`/trips/${trip.id}/days/${prevDay.id}`);
  }, [prevDay, router, trip.id]);

  const goToNextDay = useCallback(() => {
    if (!nextDay) return;
    setSwipeDir('left');
    router.push(`/trips/${trip.id}/days/${nextDay.id}`);
  }, [nextDay, router, trip.id]);

  const swipeHandlers = useSwipeNavigation({
    onSwipeLeft: goToNextDay,
    onSwipeRight: goToPrevDay,
    disabled: isCardOpen,
  });

  // Build an up-to-date dayWithCards from local card state
  const localDayWithCards = useMemo(
    () => ({ ...dayWithCards, cards: localCards }),
    [dayWithCards, localCards]
  );

  // Find the hotel card covering the current night.
  // Hotel cards are keyed by the day they were added (check-in day). We sort them
  // by that day's day_number and pick the last one whose check-in day ≤ current day.
  const accommodationCard = useMemo(() => {
    if (!hotelCards.length) return null;
    const currentDayNumber = dayWithCards.day_number;

    // Build a lookup from day_id → day_number
    const dayNumberById = new Map(days.map((d) => [d.id, d.day_number]));

    // Only include hotel cards that have coordinates
    const mappableHotels = hotelCards.filter((c) => {
      if (c.lat != null && c.lng != null) return true;
      const d = c.details as Record<string, unknown>;
      return typeof d?.lat === "number" && typeof d?.lng === "number";
    });

    // Sort by check-in day ascending
    const sorted = [...mappableHotels].sort(
      (a, b) => (dayNumberById.get(a.day_id) ?? 0) - (dayNumberById.get(b.day_id) ?? 0),
    );

    // The active hotel is the last one whose check-in day ≤ current day
    let active: Card | null = null;
    for (const hotel of sorted) {
      const checkInDay = dayNumberById.get(hotel.day_id) ?? Infinity;
      if (checkInDay <= currentDayNumber) active = hotel;
    }
    return active;
  }, [hotelCards, dayWithCards.day_number, days]);

  const mappableCards = useMemo(
    () =>
      localCards.filter((c) => {
        // Exclude the accommodation card from regular pins so it only appears as the star
        if (accommodationCard && c.id === accommodationCard.id) return false;
        if (c.lat != null && c.lng != null) return true;
        const d = c.details as Record<string, unknown>;
        return typeof d?.lat === "number" && typeof d?.lng === "number";
      }),
    [localCards, accommodationCard],
  );

  // ── Pin tapped → scroll + highlight card ──────────────────────
  const handlePinTap = useCallback((cardId: string) => {
    const el = document.querySelector(`[data-card-id="${cardId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setHighlightedCardId(cardId);
    setTimeout(() => setHighlightedCardId(null), 1200);
  }, []);

  // ── Card tapped → open sheet immediately (single tap) ────────
  const handleCardTap = useCallback((card: Card) => {
    setSelectedCard(card);
    setIsCardOpen(true);
  }, []);

  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      {/* Day strip — sits at the very top, does not scroll */}
      <DayStrip
        days={days}
        activeDayId={dayWithCards.id}
        tripId={trip.id}
        onDaySelect={handleDaySelect}
      />

      {/* Map — fixed height, does not scroll away */}
      <DayMap
        cards={mappableCards}
        accommodationCard={accommodationCard ?? undefined}
        centerLat={trip.destination_lat ?? 41.9028}
        centerLng={trip.destination_lng ?? 12.4964}
        onPinTap={handlePinTap}
      />

      {/* Sticky date header — sits between map and cards, stays visible on scroll */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4 py-2.5">
        <p className="text-[15px] font-bold text-gray-900">
          {new Date(dayWithCards.date + "T00:00:00").toLocaleDateString("en-US", {
            weekday: "long",
            month:   "long",
            day:     "numeric",
          })}
        </p>
      </div>

      {/* Scrollable cards area — only this section scrolls.
          min-h-0 is required so flex children can shrink below their content height. */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* Timeline — keyed to day so it re-mounts on day change.
            Swipe handlers live here only — map and day strip have their own
            horizontal gestures and must not be affected. */}
        <div
          key={dayWithCards.id}
          className={`px-4 pt-4 animate-in duration-200 ${
            swipeDir === 'left'  ? 'slide-in-from-right' :
            swipeDir === 'right' ? 'slide-in-from-left'  :
            'fade-in'
          }`}
          {...swipeHandlers}
        >
          <CardTimeline
            dayWithCards={localDayWithCards}
            onCardTap={handleCardTap}
            highlightedCardId={highlightedCardId}
          />
        </div>

        {/* Prev / Next day navigation — sticks to bottom of scroll area, above bottom nav */}
        <div className="sticky bottom-20 mx-4 mb-2 flex gap-2 pointer-events-none">
          {prevDay ? (
            <Link
              href={`/trips/${trip.id}/days/${prevDay.id}`}
              className="pointer-events-auto flex items-center gap-1.5 bg-white/90 backdrop-blur-sm border border-gray-200 text-gray-600 text-xs font-semibold px-3 py-2 rounded-xl shadow-card hover:shadow-card-hover transition-shadow"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Day {prevDay.day_number}
            </Link>
          ) : (
            <div className="flex-1" />
          )}

          <div className="flex-1" />

          {nextDay ? (
            <Link
              href={`/trips/${trip.id}/days/${nextDay.id}`}
              className="pointer-events-auto flex items-center gap-1.5 bg-white/90 backdrop-blur-sm border border-gray-200 text-gray-600 text-xs font-semibold px-3 py-2 rounded-xl shadow-card hover:shadow-card-hover transition-shadow"
            >
              Day {nextDay.day_number}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          ) : (
            <div className="flex-1" />
          )}
        </div>

      </div>

      {/* Card detail bottom sheet */}
      {selectedCard && (
        <CardBottomSheet
          card={selectedCard}
          onClose={() => {
            setSelectedCard(null);
            setIsCardOpen(false);
          }}
          onCardUpdate={handleCardUpdate}
          onCardDelete={handleCardDelete}
          tripDestination={trip.destination}
        />
      )}
    </div>
  );
}
