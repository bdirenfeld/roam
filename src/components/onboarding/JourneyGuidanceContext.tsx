'use client';
import { createContext, useContext, useEffect, useRef } from 'react';
import type { Card, Trip } from '@/types/database';
import type { TourId } from '@/lib/onboarding/walkthroughs';
export type GuidanceScreen = { trip: Trip; cards: Card[]; view: 'map' | 'day' | 'week'; readOnly: boolean; openedId?: string | null };
// `resumable`: a walkthrough is under way or paused part-way, so the menu's one
// Walkthrough tile picks it up; otherwise (never started, or finished) it starts over.
// On a screen with its own walkthrough (the day, the week board) the tile runs that one.
export const JourneyGuidanceContext = createContext<{ resume: () => void; restart?: () => void; resumable?: boolean; choose?: () => void } | null>(null);
export const GuidanceScreenContext = createContext<((screen: GuidanceScreen | null) => void) | null>(null);
export const useJourneyGuidance = () => useContext(JourneyGuidanceContext);
export function useGuidanceScreen(screen: GuidanceScreen) {
  const publish = useContext(GuidanceScreenContext);
  const { trip, cards, view, readOnly, openedId } = screen;
  useEffect(() => { publish?.({ trip, cards, view, readOnly, openedId }); }, [publish, trip, cards, view, readOnly, openedId]);
  useEffect(() => () => publish?.(null), [publish]);
}

/**
 * A screen's own walkthrough (lib/onboarding/walkthroughs.ts). `ready`: the
 * controls it points at can exist (the day has cards; the sheet has loaded).
 * `used`: the feature has been used already, so a first visit marks it done
 * instead of teaching it. The most recently opened screen wins, so a sheet's
 * walkthrough sits over the page's and the page's returns when it closes.
 */
export type WalkthroughScreen = { id: TourId; ready: boolean; used: boolean };
export const WalkthroughRegistryContext = createContext<((key: symbol, screen: WalkthroughScreen | null) => void) | null>(null);
export function useWalkthrough(id: TourId | null, { ready, used }: { ready: boolean; used: boolean }) {
  const register = useContext(WalkthroughRegistryContext);
  const key = useRef(Symbol(id ?? 'walkthrough')).current;
  useEffect(() => { register?.(key, id ? { id, ready, used } : null); }, [register, key, id, ready, used]);
  useEffect(() => () => register?.(key, null), [register, key]);
}

/** Profile's "Show all walkthroughs again": every walkthrough shows once more, each on its own screen. */
export const ResetWalkthroughsContext = createContext<(() => void) | null>(null);
export const useResetWalkthroughs = () => useContext(ResetWalkthroughsContext);
