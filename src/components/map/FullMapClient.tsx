"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import MapCardPeek from "./MapCardPeek";
import type { Trip, Day, Card, CardType } from "@/types/database";
import { makePinElement, PIN_COLORS } from "@/lib/mapPins";

interface Props {
  trip: Trip;
  days: Day[];
  cards: Card[];
  userAvatarUrl?: string | null;
}

// Ordered: Activity (teal) · Food (amber) · Logistics (slate) — spec order
const FILTER_DOTS: { type: CardType; label: string }[] = [
  { type: "activity",  label: "Activity"  },
  { type: "food",      label: "Food"      },
  { type: "logistics", label: "Logistics" },
];

export default function FullMapClient({ trip, days, cards, userAvatarUrl }: Props) {
  const mapRef         = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const markersRef     = useRef<Map<string, { wrapper: HTMLDivElement; inner: HTMLDivElement }>>(new Map());
  // Tracks the inner element of whichever pin is currently "selected"
  const selectedInnerRef = useRef<HTMLDivElement | null>(null);

  const [activeTypes, setActiveTypes] = useState<Set<CardType>>(
    new Set<CardType>(["logistics", "activity", "food"]),
  );
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  // First-time hint — initialised lazily after mount to avoid SSR mismatch
  const [showHint, setShowHint] = useState(false);

  const hasToken = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const dayById  = new Map(days.map((d) => [d.id, d]));

  // Show the one-time onboarding hint
  useEffect(() => {
    if (!localStorage.getItem("roam_map_hint_v1")) setShowHint(true);
  }, []);
  useEffect(() => {
    if (!showHint) return;
    const t = setTimeout(() => {
      setShowHint(false);
      localStorage.setItem("roam_map_hint_v1", "1");
    }, 3000);
    return () => clearTimeout(t);
  }, [showHint]);

  const toggleType = useCallback((type: CardType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size === 1) return prev; // always keep at least one category
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // Sync marker visibility whenever the type filter changes
  useEffect(() => {
    markersRef.current.forEach(({ wrapper }, cardId) => {
      const card = cards.find((c) => c.id === cardId);
      if (!card) return;
      wrapper.style.display = activeTypes.has(card.type) ? "" : "none";
    });
  }, [activeTypes, cards]);

  // Deselect pin when selectedCard is cleared externally (map click)
  function deselectPin() {
    if (selectedInnerRef.current) {
      selectedInnerRef.current.dataset.selected = "";
      selectedInnerRef.current.style.transform  = "";
      selectedInnerRef.current = null;
    }
  }

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

      map.on("load", () => {
        cards.forEach((card) => {
          if (card.lat == null || card.lng == null) return;
          if (card.status === "cut") return;

          const { wrapper, inner } = makePinElement(card.type, card.sub_type, card.status, {
            onClick: () => {
              // Deselect previous pin
              if (selectedInnerRef.current && selectedInnerRef.current !== inner) {
                selectedInnerRef.current.dataset.selected = "";
                selectedInnerRef.current.style.transform  = "";
              }
              // Select this pin — scale stays at 1.15x
              inner.dataset.selected = "1";
              inner.style.transform  = "scale(1.15)";
              selectedInnerRef.current = inner;
              setSelectedCard(card);
            },
          });

          // Status → visual weight
          // interested = background noise (30% opacity, outline only)
          // in_itinerary / on_map = signal (full opacity, filled)
          if (card.status === "interested") {
            wrapper.style.opacity = "0.3";
          }

          inner.title = card.title;

          new mb.Marker({ element: wrapper, anchor: "bottom" })
            .setLngLat([card.lng!, card.lat!])
            .addTo(map);

          markersRef.current.set(card.id, { wrapper, inner });
        });

        // Fit to all mappable pins
        const mappable = cards.filter(
          (c) => c.lat != null && c.lng != null && c.status !== "cut",
        );
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

      // Tap map → dismiss peek + deselect pin
      map.on("click", () => {
        deselectPin();
        setSelectedCard(null);
      });
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
    <div className="relative w-full h-dvh overflow-hidden">
      {/* ── Map ── */}
      {hasToken ? (
        <div ref={mapRef} className="absolute inset-0" />
      ) : (
        <div className="absolute inset-0 bg-gray-50 flex flex-col items-center justify-center gap-1">
          <p className="text-sm font-medium text-gray-500">Map unavailable</p>
          <p className="text-xs text-gray-400">Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local</p>
        </div>
      )}

      {/* ── Back button — top-left, minimal ── */}
      <Link
        href={`/trips/${trip.id}`}
        className="absolute top-4 left-4 z-20 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center"
        style={{ backdropFilter: "blur(8px)" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </Link>

      {/* ── Three category dots — top-center, the only persistent controls ── */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
        {FILTER_DOTS.map(({ type, label }) => {
          const active = activeTypes.has(type);
          return (
            <button
              key={type}
              title={label}
              onClick={() => toggleType(type)}
              className="w-3 h-3 rounded-full transition-all duration-150 active:scale-90"
              style={{
                background: active ? PIN_COLORS[type] : "#D1D5DB",
                opacity: active ? 1 : 0.5,
              }}
            />
          );
        })}
      </div>

      {/* ── One-time onboarding hint ── */}
      {showHint && (
        <div
          className="absolute top-12 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
          style={{ animation: "fadeOut 500ms 2500ms ease-in forwards" }}
        >
          <p
            className="bg-gray-900/85 text-white text-[11px] font-medium px-3 py-1.5 rounded-full whitespace-nowrap"
            style={{ backdropFilter: "blur(4px)" }}
          >
            Filled pins are confirmed · Faded pins are ideas
          </p>
        </div>
      )}

      {/* ── Pin tap → card peek ── */}
      {selectedCard && (
        <MapCardPeek
          card={selectedCard}
          day={dayById.get(selectedCard.day_id)}
          tripId={trip.id}
          onClose={() => {
            deselectPin();
            setSelectedCard(null);
          }}
        />
      )}

      {/* Avatar / trip link — top-right, very subtle */}
      <Link
        href={`/trips/${trip.id}`}
        className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full overflow-hidden bg-white/80"
        style={{ backdropFilter: "blur(8px)" }}
        title={trip.title}
      >
        {userAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={userAvatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
        )}
      </Link>
    </div>
  );
}
