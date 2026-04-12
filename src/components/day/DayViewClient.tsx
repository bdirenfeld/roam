"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DotsThree } from "@phosphor-icons/react";
import DayStrip from "@/components/day/DayStrip";
import DayMap from "@/components/day/DayMap";
import CardTimeline from "@/components/day/CardTimeline";
import CardBottomSheet from "@/components/cards/CardBottomSheet";
import CreateCardSheet from "@/components/plan/CreateCardSheet";
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
  const [gapStartTime, setGapStartTime] = useState<string | null>(null);

  // ── Day cross-fade ─────────────────────────────────────────────
  const [contentVisible, setContentVisible] = useState(false);
  const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fade in whenever the active day changes (covers both first mount and day switches)
  useEffect(() => {
    const t = setTimeout(() => setContentVisible(true), 16);
    return () => clearTimeout(t);
  }, [dayWithCards.id]);

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
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
      setContentVisible(false);
      navTimeoutRef.current = setTimeout(() => {
        router.push(`/trips/${trip.id}/days/${day.id}`);
      }, 150);
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

  // ── Gap tapped → open create sheet with start time pre-filled ─
  const handleGapTap = useCallback((startTime: string) => {
    setGapStartTime(startTime);
  }, []);

  const handleCardCreated = useCallback((card: Card) => {
    setLocalCards((prev) => [...prev, card].sort((a, b) => {
      if (!a.start_time && !b.start_time) return 0;
      if (!a.start_time) return 1;
      if (!b.start_time) return -1;
      return a.start_time.localeCompare(b.start_time);
    }));
    setGapStartTime(null);
  }, []);

  return (
    <div className="flex flex-col h-dvh">
      {/* Trip header — back to home + trip title + settings */}
      <div className="relative flex items-center bg-white border-b border-gray-100 flex-shrink-0 h-11">
        <Link
          href="/"
          className="flex items-center justify-center w-11 h-11 text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
          aria-label="Back to home"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="font-display italic text-[15px] text-gray-900">
            {trip.title}
          </span>
        </span>
        <span className="flex-1" />
        <Link
          href={`/trips/${trip.id}/settings`}
          className="flex items-center justify-center w-11 h-11 text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
          aria-label="Trip settings"
        >
          <DotsThree size={20} weight="light" />
        </Link>
      </div>

      {/* Day strip — sits below the trip header, does not scroll */}
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

      {/* Scrollable cards area — only this section scrolls.
          min-h-0 is required so flex children can shrink below their content height.
          Opacity cross-fade on day strip taps; slide animation on swipes. */}
      <div className={`flex-1 overflow-y-auto min-h-0 pb-20 transition-opacity ${
        contentVisible
          ? 'opacity-100 duration-[200ms] ease-in'
          : 'opacity-0 duration-[150ms] ease-out'
      }`}>

        {/* Timeline — keyed to day so it re-mounts on day change.
            Swipe handlers live here only — map and day strip have their own
            horizontal gestures and must not be affected. */}
        <div
          key={dayWithCards.id}
          className={`px-4 pt-4 ${
            swipeDir === 'left'  ? 'animate-in slide-in-from-right duration-200' :
            swipeDir === 'right' ? 'animate-in slide-in-from-left duration-200'  :
            ''
          }`}
          {...swipeHandlers}
        >
          <CardTimeline
            dayWithCards={localDayWithCards}
            onCardTap={handleCardTap}
            highlightedCardId={highlightedCardId}
            onGapTap={handleGapTap}
          />
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

      {/* Create card sheet — opened by tapping a free-time gap */}
      {gapStartTime !== null && (
        <CreateCardSheet
          dayId={dayWithCards.id}
          tripId={trip.id}
          endPosition={localCards.reduce((m, c) => Math.max(m, c.position), 0) + 1}
          initialStartTime={gapStartTime}
          onClose={() => setGapStartTime(null)}
          onCardCreated={handleCardCreated}
        />
      )}
    </div>
  );
}
