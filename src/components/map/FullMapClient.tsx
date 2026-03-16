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

const FILTER_DOTS: { type: CardType; label: string }[] = [
  { type: "activity",  label: "Activity"  },
  { type: "food",      label: "Food"      },
  { type: "logistics", label: "Logistics" },
];

// Module-level — outside React entirely. Same reference on every render,
// immune to component re-renders, state updates, and React scheduling.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MARKERS = new Map<string, { marker: any; type: CardType }>();
const ACTIVE_TYPES = new Set<CardType>(["activity", "food", "logistics"]);

export default function FullMapClient({ trip, days, cards, userAvatarUrl }: Props) {
  const mapContainerRef  = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstRef       = useRef<any>(null);
  const filtersRef       = useRef<HTMLDivElement>(null);
  const debugRef         = useRef<HTMLDivElement>(null);
  const selectedInnerRef = useRef<HTMLDivElement | null>(null);
  const clickedPinRef    = useRef(false);

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

  function deselectPin() {
    if (selectedInnerRef.current) {
      selectedInnerRef.current.dataset.selected = "";
      selectedInnerRef.current.style.transform  = "";
      selectedInnerRef.current = null;
    }
  }

  // Single effect, runs once. Map and markers live outside React.
  useEffect(() => {
    if (!hasToken || !mapContainerRef.current) return;

    // `cancelled` is local to this effect invocation. When React Strict Mode
    // runs cleanup before the import() Promise resolves, this flag prevents
    // the stale .then() callback from creating a second map on the same container.
    let cancelled = false;

    import("mapbox-gl").then((mapboxgl) => {
      if (cancelled || !mapContainerRef.current || mapInstRef.current) return;

      // Ensure the container is empty — Mapbox warns and misbehaves otherwise.
      mapContainerRef.current.innerHTML = "";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mb = mapboxgl.default as any;
      mb.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

      const map = new mb.Map({
        container: mapContainerRef.current!,
        style: "mapbox://styles/mapbox/light-v11",
        center: [trip.destination_lng ?? 12.4964, trip.destination_lat ?? 41.9028],
        zoom: 13,
        attributionControl: false,
      });
      mapInstRef.current = map;

      map.addControl(new mb.AttributionControl({ compact: true }), "bottom-right");

      map.once("load", () => {
        // Strict Mode race: map1's once("load") can fire after cleanup removes map1
        // and creates map2. Bail out if this handler belongs to a stale map instance.
        if (mapInstRef.current !== map) return;

        // Clear any stale markers from a previous (unmounted) map instance.
        MARKERS.forEach(({ marker }) => marker.remove());
        MARKERS.clear();

        // ── Markers ──────────────────────────────────────────────────────────
        cards.forEach((card) => {
          if (card.lat == null || card.lng == null) return;
          if (card.status === "cut") return;

          const { wrapper, inner } = makePinElement(card.type, card.sub_type, card.status);
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

          MARKERS.set(card.id, { marker: mbMarker, type: card.type });
        });
        if (debugRef.current) debugRef.current.textContent = "M: " + MARKERS.size;
        console.log("[roam] Markers loaded:", MARKERS.size);
        alert("Markers loaded: " + MARKERS.size);

        // Fit to all visible pins
        const mappable = cards.filter((c) => c.lat != null && c.lng != null && c.status !== "cut");
        if (mappable.length > 1) {
          const coords = mappable.map((c) => [c.lng!, c.lat!] as [number, number]);
          const bounds = coords.reduce(
            (b: unknown, coord) => (b as { extend: (c: [number, number]) => unknown }).extend(coord),
            new mb.LngLatBounds(coords[0], coords[0]),
          );
          map.fitBounds(bounds, { padding: 80, maxZoom: 15 });
        }

        // ── Filter dots — wired directly, zero React state or scheduling ────
        filtersRef.current?.querySelectorAll<HTMLButtonElement>("button[data-type]").forEach((btn) => {
          const type = btn.dataset.type as CardType;

          btn.onclick = () => {
            console.log("[roam] Filter tapped. MARKERS size:", MARKERS.size);
            alert("Filter tapped. MARKERS size: " + MARKERS.size);
            if (ACTIVE_TYPES.has(type)) {
              if (ACTIVE_TYPES.size === 1) return; // keep at least one active
              ACTIVE_TYPES.delete(type);
              btn.style.background = "#D1D5DB";
              btn.style.opacity    = "0.5";
            } else {
              ACTIVE_TYPES.add(type);
              btn.style.background = PIN_COLORS[type];
              btn.style.opacity    = "1";
            }
            MARKERS.forEach(({ marker, type: markerType }) => {
              if (ACTIVE_TYPES.has(markerType)) {
                marker.addTo(map);
              } else {
                marker.remove();
              }
            });
            if (debugRef.current) debugRef.current.textContent = "M: " + MARKERS.size;
          };
        });
      });

      // Tap bare map → dismiss peek panel
      map.on("click", () => {
        if (clickedPinRef.current) { clickedPinRef.current = false; return; }
        deselectPin();
        setSelectedCard(null);
      });
    });

    return () => {
      cancelled = true;
      // Clean up module-level state so a future remount starts fresh
      MARKERS.forEach(({ marker }) => marker.remove());
      MARKERS.clear();
      ACTIVE_TYPES.clear();
      ACTIVE_TYPES.add("activity");
      ACTIVE_TYPES.add("food");
      ACTIVE_TYPES.add("logistics");
      if (mapInstRef.current) {
        mapInstRef.current.remove();
        mapInstRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>

      {/* ── Map container ── */}
      {hasToken ? (
        <div ref={mapContainerRef} style={{ position: "absolute", inset: 0 }} />
      ) : (
        <div style={{ position: "absolute", inset: 0 }} className="bg-gray-50 flex flex-col items-center justify-center gap-1">
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

      {/* ── Debug: MARKERS size ── */}
      <div
        ref={debugRef}
        className="fixed top-14 left-4 text-[11px] font-bold text-white bg-black/60 px-2 py-0.5 rounded"
        style={{ zIndex: 9999 }}
      />

      {/* ── Filter dots — onclick set imperatively in useEffect ── */}
      <div
        ref={filtersRef}
        className="fixed top-4 left-1/2 -translate-x-1/2 flex items-center gap-4"
        style={{ zIndex: 9999 }}
      >
        {FILTER_DOTS.map(({ type, label }) => (
          <button
            key={type}
            data-type={type}
            title={label}
            className="w-3.5 h-3.5 rounded-full transition-all duration-150 active:scale-90"
            style={{ background: PIN_COLORS[type], opacity: 1 }}
          />
        ))}
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
