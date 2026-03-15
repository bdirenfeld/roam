"use client";

import { useEffect, useRef, useState } from "react";
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

// Spec order: Activity (teal) · Food (amber) · Logistics (slate)
const FILTER_DOTS: { type: CardType; label: string }[] = [
  { type: "activity",  label: "Activity"  },
  { type: "food",      label: "Food"      },
  { type: "logistics", label: "Logistics" },
];

export default function FullMapClient({ trip, days, cards, userAvatarUrl }: Props) {
  const mapRef          = useRef<HTMLDivElement>(null);
  const mapInstanceRef  = useRef<unknown>(null);
  // Plain JS Map: cardId → { marker, type, inner } — no React involvement
  const markerMap = useRef<Map<string, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    marker: any;
    type: CardType;
    inner: HTMLDivElement;
  }>>(new Map());

  // Tracks the inner element of the currently selected pin
  const selectedInnerRef = useRef<HTMLDivElement | null>(null);
  // Mapbox fires map.on("click") independently of the DOM — this flag stops
  // it dismissing the peek panel right after a pin tap opens it.
  const clickedPinRef = useRef(false);

  const [activeTypes, setActiveTypes] = useState<Set<CardType>>(
    new Set<CardType>(["logistics", "activity", "food"]),
  );
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showHint, setShowHint]         = useState(false);

  const hasToken = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const dayById  = new Map(days.map((d) => [d.id, d]));

  // One-time onboarding hint (lazy init to avoid SSR/localStorage mismatch)
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

  // Plain function — no useCallback, no useEffect, no React scheduling.
  // Reads activeTypes from the render-closure, loops markerMap synchronously.
  function toggleType(type: CardType) {
    console.log("toggleType called:", type);
    const next = new Set(activeTypes);
    if (next.has(type)) {
      if (next.size === 1) return; // always keep at least one visible
      next.delete(type);
    } else {
      next.add(type);
    }
    setActiveTypes(next);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = mapInstanceRef.current as any;
    markerMap.current.forEach(({ marker, type: cardType }) => {
      if (next.has(cardType)) {
        marker.addTo(map);
      } else {
        marker.remove();
      }
    });
  }

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
        // "load" can re-fire (style reload on zoom, etc.) — remove any existing
        // markers and clear the map before repopulating so there's always exactly
        // one set of live pins, all reachable by the filter.
        markerMap.current.forEach(({ marker }) => marker.remove());
        markerMap.current.clear();

        cards.forEach((card) => {
          if (card.lat == null || card.lng == null) return;
          if (card.status === "cut") return;

          const { wrapper, inner } = makePinElement(card.type, card.sub_type, card.status);

          // Visual weight: interested = 30% opacity (background noise)
          if (card.status === "interested") wrapper.style.opacity = "0.3";
          inner.title = card.title;

          const mbMarker = new mb.Marker({ element: wrapper, anchor: "bottom" })
            .setLngLat([card.lng!, card.lat!])
            .addTo(map);

          mbMarker.getElement().addEventListener("click", (e: MouseEvent) => {
            e.stopPropagation();
            clickedPinRef.current = true;
            if (selectedInnerRef.current && selectedInnerRef.current !== inner) {
              selectedInnerRef.current.dataset.selected = "";
              selectedInnerRef.current.style.transform  = "";
            }
            inner.dataset.selected = "1";
            inner.style.transform  = "scale(1.15)";
            selectedInnerRef.current = inner;
            setSelectedCard(card);
          });

          markerMap.current.set(card.id, { marker: mbMarker, type: card.type, inner });
        });

        // Fit to all visible pins
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

      // Tap on bare map → dismiss peek.
      map.on("click", () => {
        if (clickedPinRef.current) {
          clickedPinRef.current = false;
          return;
        }
        deselectPin();
        setSelectedCard(null);
      });
    });

    return () => {
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
        markerMap.current.clear();
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

      {/* ── Back button — top-left ── */}
      <Link
        href={`/trips/${trip.id}`}
        className="fixed top-4 left-4 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center"
        style={{ backdropFilter: "blur(8px)", zIndex: 9999 }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </Link>

      {/* ── Category dots — top-centre, the only persistent filter UI ── */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 flex items-center gap-4" style={{ zIndex: 9999 }}>
        {FILTER_DOTS.map(({ type, label }) => {
          const active = activeTypes.has(type);
          return (
            <button
              key={type}
              title={label}
              onClick={() => toggleType(type)}
              className="w-3.5 h-3.5 rounded-full transition-all duration-150 active:scale-90"
              style={{
                background: active ? PIN_COLORS[type] : "#D1D5DB",
                opacity: active ? 1 : 0.5,
              }}
            />
          );
        })}
      </div>

      {/* ── One-time hint ── */}
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

      {/* ── Card peek panel ── */}
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

      {/* ── Avatar / trip link — top-right ── */}
      <Link
        href={`/trips/${trip.id}`}
        className="fixed top-4 right-4 w-8 h-8 rounded-full overflow-hidden bg-white/80"
        style={{ backdropFilter: "blur(8px)", zIndex: 9999 }}
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
