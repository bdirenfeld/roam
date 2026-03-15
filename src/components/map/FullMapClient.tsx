"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import MapFilterBar, { type StatusFilter } from "./MapFilterBar";
import MapCardPeek from "./MapCardPeek";
import type { Trip, Day, Card, CardType } from "@/types/database";
import { makePinElement } from "@/lib/mapPins";

interface Props {
  trip: Trip;
  days: Day[];
  cards: Card[];
  userAvatarUrl?: string | null;
}

/** Returns true if a card should be visible given the current filters. */
function isVisible(card: Card, activeTypes: Set<CardType>, statusFilter: StatusFilter): boolean {
  if (!activeTypes.has(card.type)) return false;
  if (statusFilter === "confirmed" && card.status !== "in_itinerary") return false;
  if (statusFilter === "ideas"     && card.status !== "interested")    return false;
  if (card.status === "cut") return false;
  return true;
}

export default function FullMapClient({ trip, days, cards, userAvatarUrl }: Props) {
  const mapRef         = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  // Each entry: { wrapper (Mapbox el), inner (visual el), card }
  const markersRef = useRef<Map<string, { wrapper: HTMLDivElement; inner: HTMLDivElement }>>(new Map());

  const [activeTypes, setActiveTypes]   = useState<Set<CardType>>(new Set<CardType>(["logistics", "activity", "food"]));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  const hasToken = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const dayById  = new Map(days.map((d) => [d.id, d]));

  // Pin counts per type, respecting the current status filter
  const statusFiltered = cards.filter((c) => {
    if (c.status === "cut") return false;
    if (statusFilter === "confirmed") return c.status === "in_itinerary";
    if (statusFilter === "ideas")     return c.status === "interested";
    return true;
  });
  const counts = statusFiltered.reduce<Record<CardType, number>>(
    (acc, c) => { acc[c.type] = (acc[c.type] ?? 0) + 1; return acc; },
    { logistics: 0, activity: 0, food: 0 },
  );

  const toggleType = useCallback((type: CardType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size === 1) return prev; // keep at least one
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // Sync marker visibility whenever filters change
  useEffect(() => {
    markersRef.current.forEach(({ wrapper }, cardId) => {
      const card = cards.find((c) => c.id === cardId);
      if (!card) return;
      wrapper.style.display = isVisible(card, activeTypes, statusFilter) ? "" : "none";
    });
  }, [activeTypes, statusFilter, cards]);

  // Build map once on mount
  useEffect(() => {
    if (!hasToken || !mapRef.current || mapInstanceRef.current) return;

    import("mapbox-gl").then((mapboxgl) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mb = mapboxgl.default as any;
      mb.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

      const map = new mb.Map({
        container: mapRef.current!,
        style: "mapbox://styles/mapbox/light-v11",
        center: [trip.destination_lng ?? 12.4964, trip.destination_lat ?? 41.9028],
        zoom: 13,
        attributionControl: false,
      });
      mapInstanceRef.current = map;

      map.addControl(new mb.AttributionControl({ compact: true }), "bottom-right");
      map.addControl(new mb.NavigationControl({ showCompass: false }), "top-right");

      map.on("load", () => {
        cards.forEach((card) => {
          if (card.lat == null || card.lng == null) return;
          if (card.status === "cut") return;

          const { wrapper, inner } = makePinElement(card.type, card.sub_type, card.status, {
            onClick: () => setSelectedCard(card),
          });

          // Apply initial visibility
          if (!isVisible(card, new Set<CardType>(["logistics", "activity", "food"]), "all")) {
            wrapper.style.display = "none";
          }

          // Tooltip
          inner.title = card.title;

          new mb.Marker({ element: wrapper, anchor: "bottom" })
            .setLngLat([card.lng!, card.lat!])
            .addTo(map);

          markersRef.current.set(card.id, { wrapper, inner });
        });

        // Fit to all mappable pins
        const mappable = cards.filter((c) => c.lat != null && c.lng != null && c.status !== "cut");
        if (mappable.length > 1) {
          const coords = mappable.map((c) => [c.lng!, c.lat!] as [number, number]);
          const bounds = coords.reduce(
            (b: unknown, coord) =>
              (b as { extend: (c: [number, number]) => unknown }).extend(coord),
            new mb.LngLatBounds(coords[0], coords[0]),
          );
          map.fitBounds(bounds, { padding: 80, maxZoom: 15 });
        }
      });

      map.on("click", () => setSelectedCard(null));
    });

    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const markers = markersRef.current;
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
        markers.clear();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex flex-col h-dvh bg-gray-100">
      {/* Floating header */}
      <div className="absolute top-0 left-0 right-0 z-20">
        <div className="flex items-center justify-between px-4 pt-safe pt-3 pb-2 bg-gradient-to-b from-white/95 to-transparent backdrop-blur-sm">
          <div>
            <Link href="/trips" className="text-lg font-bold tracking-tight text-gray-900">
              Roam
            </Link>
            <p className="text-xs text-gray-500 font-medium -mt-0.5">{trip.title}</p>
          </div>
          <Link
            href={`/trips/${trip.id}`}
            className="w-8 h-8 rounded-full bg-white/90 border border-gray-100 flex items-center justify-center shadow-sm"
          >
            {userAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={userAvatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            )}
          </Link>
        </div>
      </div>

      {/* Map container */}
      {hasToken ? (
        <div ref={mapRef} className="absolute inset-0" />
      ) : (
        <div className="absolute inset-0 bg-gray-100 flex flex-col items-center justify-center">
          <p className="text-sm font-medium text-gray-500 mb-1">Map unavailable</p>
          <p className="text-xs text-gray-400">Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local</p>
        </div>
      )}

      {/* Google Maps-style legend */}
      {cards.length > 0 && (
        <MapFilterBar
          counts={counts}
          activeTypes={activeTypes}
          statusFilter={statusFilter}
          onToggleType={toggleType}
          onStatusChange={setStatusFilter}
        />
      )}

      {/* Card peek panel */}
      {selectedCard && (
        <MapCardPeek
          card={selectedCard}
          day={dayById.get(selectedCard.day_id)}
          tripId={trip.id}
          onClose={() => setSelectedCard(null)}
        />
      )}

      {/* Empty state */}
      {cards.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pb-20 pointer-events-none">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl px-6 py-5 shadow-card text-center">
            <p className="text-sm font-semibold text-gray-700">No pins yet</p>
            <p className="text-xs text-gray-400 mt-1">Add lat/lng to cards to see them here.</p>
          </div>
        </div>
      )}
    </div>
  );
}
