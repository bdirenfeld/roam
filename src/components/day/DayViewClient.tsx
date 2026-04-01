"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/ui/AppHeader";
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
  userAvatarUrl?: string | null;
}

export default function DayViewClient({ trip, days, dayWithCards, userAvatarUrl }: Props) {
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

  const mappableCards = useMemo(
    () =>
      localCards.filter((c) => {
        if (c.lat != null && c.lng != null) return true;
        const d = c.details as Record<string, unknown>;
        return typeof d?.lat === "number" && typeof d?.lng === "number";
      }),
    [localCards],
  );

  return (
    <div className="flex flex-col min-h-dvh">
      {/* Header — "Roam" logo + trip title subtitle + avatar */}
      <AppHeader subtitle={trip.title} avatarUrl={userAvatarUrl} />

      {/* Day strip */}
      <DayStrip
        days={days}
        activeDayId={dayWithCards.id}
        tripId={trip.id}
        onDaySelect={handleDaySelect}
      />

      {/* Map — collapsible, today's pins only */}
      <DayMap
        cards={mappableCards}
        centerLat={trip.destination_lat ?? 41.9028}
        centerLng={trip.destination_lng ?? 12.4964}
      />

      {/* Timeline — keyed to day so it re-mounts on day change.
          Swipe handlers live here only — map and day strip have their own
          horizontal gestures and must not be affected. */}
      <div
        key={dayWithCards.id}
        className={`flex-1 px-4 pt-4 animate-in duration-200 ${
          swipeDir === 'left'  ? 'slide-in-from-right' :
          swipeDir === 'right' ? 'slide-in-from-left'  :
          'fade-in'
        }`}
        {...swipeHandlers}
      >
        <CardTimeline
          dayWithCards={localDayWithCards}
          onCardTap={(card) => { setSelectedCard(card); setIsCardOpen(true); }}
        />
      </div>

      {/* Prev / Next day navigation bar */}
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

      {/* Card detail bottom sheet */}
      {selectedCard && (
        <CardBottomSheet
          card={selectedCard}
          onClose={() => { setSelectedCard(null); setIsCardOpen(false); }}
          onCardUpdate={handleCardUpdate}
          onCardDelete={handleCardDelete}
          tripDestination={trip.destination}
        />
      )}
    </div>
  );
}
