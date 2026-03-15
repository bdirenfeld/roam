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

// Spec order: Activity (teal) · Food (amber) · Logistics (slate)
const FILTER_DOTS: { type: CardType; label: string }[] = [
  { type: "activity",  label: "Activity"  },
  { type: "food",      label: "Food"      },
  { type: "logistics", label: "Logistics" },
];

export default function FullMapClient({ trip, days, cards, userAvatarUrl }: Props) {
  const mapRef         = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);

  // card.id → { marker, inner, card }
  const markersRef = useRef<Map<string, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    marker: any;
    inner: HTMLDivElement;
    card: Card;
  }>>(new Map());

  // Tracks which types are currently removed from the map, so we only call
  // remove()/addTo() when the visibility state actually changes.
  const hiddenTypesRef = useRef<Set<CardType>>(new Set());

  const selectedInnerRef = useRef<HTMLDivElement | null>(null);

  const [activeTypes, setActiveTypes] = useState<Set<CardType>>(
    new Set<CardType>(["logistics", "activity", "food"]),
  );
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showHint, setShowHint]         = useState(false);

  const hasToken = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const dayById  = new Map(days.map((d) => [d.id, d]));

  // One-time onboarding hint
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
    console.log("[DEBUG] toggleType called:", type, "| markers in ref:", markersRef.current.size);
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size === 1) {
          console.log("[DEBUG] toggleType: blocked — would hide last active type");
          return prev;
        }
        next.delete(type);
      } else {
        next.add(type);
      }
      console.log("[DEBUG] toggleType: new activeTypes →", Array.from(next));
      return next;
    });
  }, []);

  // Filter visibility: only call remove()/addTo() when the state actually changes.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = mapInstanceRef.current as any;
    console.log("[DEBUG] filter effect ran | map:", !!map, "| activeTypes:", Array.from(activeTypes), "| markers:", markersRef.current.size);
    if (!map) return;

    markersRef.current.forEach(({ marker, card: c }) => {
      const shouldHide = !activeTypes.has(c.type);
      const isHidden   = hiddenTypesRef.current.has(c.type);

      if (shouldHide && !isHidden) {
        console.log("[DEBUG] removing marker for", c.type, c.title);
        marker.remove();
      } else if (!shouldHide && isHidden) {
        console.log("[DEBUG] adding marker for", c.type, c.title);
        marker.addTo(map);
      }
    });

    // Sync hiddenTypesRef to current activeTypes
    hiddenTypesRef.current = new Set(
      (["logistics", "activity", "food"] as CardType[]).filter((t) => !activeTypes.has(t)),
    );
  }, [activeTypes]);

  function deselectPin() {
    if (selectedInnerRef.current) {
      selectedInnerRef.current.dataset.selected = "";
      selectedInnerRef.current.style.transform  = "";
      selectedInnerRef.current = null;
    }
  }

  function dismissCard() {
    deselectPin();
    setSelectedCard(null);
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
        console.log("[DEBUG] map load fired | cards to place:", cards.filter(c => c.lat != null && c.lng != null && c.status !== "cut").length);

        // FIX 1: clear any existing markers before placing — prevents duplicates
        // if the map fires "load" more than once (e.g. style reload).
        markersRef.current.forEach(({ marker }) => marker.remove());
        markersRef.current.clear();

        cards.forEach((card) => {
          if (card.lat == null || card.lng == null) return;
          if (card.status === "cut") return;

          // FIX 2: do NOT pass onClick through makePinElement — attach a direct
          // DOM addEventListener on wrapper (the outermost element Mapbox positions).
          // This bypasses any pointer-event quirks on the inner SVG layer.
          const { wrapper, inner } = makePinElement(card.type, card.sub_type, card.status);

          wrapper.addEventListener("click", (e) => {
            console.log("clicked:", card.title);
            e.stopPropagation();
            if (selectedInnerRef.current && selectedInnerRef.current !== inner) {
              selectedInnerRef.current.dataset.selected = "";
              selectedInnerRef.current.style.transform  = "";
            }
            inner.dataset.selected = "1";
            inner.style.transform  = "scale(1.15)";
            selectedInnerRef.current = inner;
            setSelectedCard(card);
          });

          // interested = 30% opacity (background noise); in_itinerary = full opacity (signal)
          if (card.status === "interested") wrapper.style.opacity = "0.3";
          inner.title = card.title;

          const mbMarker = new mb.Marker({ element: wrapper, anchor: "bottom" })
            .setLngLat([card.lng!, card.lat!])
            .addTo(map);

          markersRef.current.set(card.id, { marker: mbMarker, inner, card });
        });

        console.log("[DEBUG] markers placed:", markersRef.current.size);

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

      {/* ── Dismiss overlay ──────────────────────────────────────────────────
           Only rendered when a card is selected. Transparent, full-screen.
           z-[15]: above the Mapbox canvas, below the pins (z-20 via globals.css)
           and below filter dots / peek panel (z-40+ / z-30).
      ─────────────────────────────────────────────────────────────────────── */}
      {selectedCard && (
        <div className="absolute inset-0 z-[15]" onClick={dismissCard} />
      )}

      {/* ── DEBUG: plain click test button — remove before shipping ── */}
      <button
        className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 bg-red-500 text-white text-xs font-bold px-4 py-2 rounded-full"
        onClick={() => alert("plain button works ✓")}
      >
        Test
      </button>

      {/* ── Back button — top-left ── */}
      <Link
        href={`/trips/${trip.id}`}
        className="absolute top-4 left-4 z-[60] w-8 h-8 rounded-full bg-white/80 flex items-center justify-center"
        style={{ backdropFilter: "blur(8px)" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </Link>

      {/* ── Category dots — top-centre ──
           FIX 3: z-[60] ensures dots are above Mapbox marker stacking context
           (which can win at z-20 depending on Mapbox version).
           Each button gets extra padding for a larger tap target while keeping
           the visible dot the same size.
      ── */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2">
        {FILTER_DOTS.map(({ type, label }) => {
          const active = activeTypes.has(type);
          return (
            <button
              key={type}
              title={label}
              onClick={() => {
                console.log("[DEBUG] dot button clicked:", type);
                toggleType(type);
              }}
              className="p-2 flex items-center justify-center active:scale-90"
            >
              <span
                className="block w-3.5 h-3.5 rounded-full transition-all duration-150"
                style={{
                  background: active ? PIN_COLORS[type] : "#D1D5DB",
                  opacity: active ? 1 : 0.5,
                }}
              />
            </button>
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
          onClose={dismissCard}
        />
      )}

      {/* ── Avatar — top-right ── */}
      <Link
        href={`/trips/${trip.id}`}
        className="absolute top-4 right-4 z-[60] w-8 h-8 rounded-full overflow-hidden bg-white/80"
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
