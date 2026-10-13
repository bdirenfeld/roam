'use client';
import { createContext, useContext, useEffect } from 'react';
import type { Card, Trip } from '@/types/database';
export type GuidanceScreen = { trip: Trip; cards: Card[]; view: 'map' | 'day' | 'week'; readOnly: boolean; openedId?: string | null };
export const JourneyGuidanceContext = createContext<{ resume: () => void; restart?: () => void } | null>(null);
export const GuidanceScreenContext = createContext<((screen: GuidanceScreen | null) => void) | null>(null);
export const useJourneyGuidance = () => useContext(JourneyGuidanceContext);
export function useGuidanceScreen(screen: GuidanceScreen) {
  const publish = useContext(GuidanceScreenContext);
  const { trip, cards, view, readOnly, openedId } = screen;
  useEffect(() => { publish?.({ trip, cards, view, readOnly, openedId }); }, [publish, trip, cards, view, readOnly, openedId]);
  useEffect(() => () => publish?.(null), [publish]);
}
