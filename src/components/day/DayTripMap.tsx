"use client";

/**
 * The journey's map, opened on the day page (phone, 8 Oct 2026; spec:
 * docs/phone-map-one-page-spec.html, mock "toggle1"). It grows in place under
 * the day's header and days row, so the page never changes: the same Map the
 * Map screen draws (FullMapClient, embedded), with every saved place, the
 * chosen day's stops numbered and the rest muted. The list disc closes it.
 *
 * The day page loads only its own day, so the journey's cards are fetched
 * here, the first time the map opens, with the Map screen's own select.
 */

import { useEffect, useLayoutEffect, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import type { Card, Day, Trip } from "@/types/database";

const FullMapClient = dynamic(() => import("@/components/map/FullMapClient"), { ssr: false });

/** The Map screen's card select (app/(app)/trips/[tripId]/map/page.tsx), kept identical. */
export const TRIP_MAP_CARD_SELECT = `
        *,
        place:places (
          id, title, type, sub_type, lat, lng, address, google_place_id, cover_image_url, rating, price_level, website, phone, hours, loved, loved_at, photo_t0:photo_cache->t0, types:details->types
        )
      `;

interface Props {
  trip: Trip;
  days: Day[];
  /** The day whose stops are numbered; null = the whole trip. */
  focusDayId: string | null;
  /** The element the map starts under (the days row's bottom edge). */
  topFrom: () => number;
  readOnly?: boolean;
  onClose: () => void;
}

export default function DayTripMap({ trip, days, focusDayId, topFrom, readOnly = false, onClose }: Props) {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [top, setTop] = useState(0);

  useLayoutEffect(() => {
    const place = () => setTop(Math.round(topFrom()));
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [topFrom]);

  useEffect(() => {
    let live = true;
    createClient()
      .from("cards")
      .select(TRIP_MAP_CARD_SELECT)
      .eq("trip_id", trip.id)
      .neq("status", "cut")
      .not("archived", "is", true)
      .order("day_id")
      .order("position")
      .then(({ data }) => { if (live) setCards((data ?? []) as Card[]); });
    return () => { live = false; };
  }, [trip.id]);

  return (
    <div data-testid="day-trip-map" className="md:hidden fixed left-0 right-0 bottom-0 z-[45] bg-[#EEE9E2]" style={{ top }}>
      {cards && (
        <FullMapClient trip={trip} days={days} cards={cards} readOnly={readOnly} embedded={{ focusDayId, onClose }} />
      )}
    </div>
  );
}
