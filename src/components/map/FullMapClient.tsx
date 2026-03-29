"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import MapPinPopup from "./MapPinPopup";
import CreateCardSheet from "@/components/plan/CreateCardSheet";
import MapSidebar from "./MapSidebar";
import PlaceSearch from "./PlaceSearch";
import AddToTripSheet from "./AddToTripSheet";
import type { PlaceResult } from "./AddToTripSheet";
import type { Trip, Day, Card, CardType } from "@/types/database";
import { makeMaterialPinElement } from "@/lib/mapPins";

// Purple circular pin for search result previews
const TEMP_PIN_SVG =
  `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">` +
  `<circle cx="14" cy="14" r="12" fill="#7C3AED"/>` +
  `<circle cx="14" cy="14" r="4" fill="white"/>` +
  `</svg>`;

interface Props {
  trip: Trip;
  days: Day[];
  cards: Card[];
  userAvatarUrl?: string | null;
}

// Only these sub-types represent real, mappable locations
const LOCATION_SUB_TYPES = new Set([
  "restaurant", "coffee", "cocktail_bar",
  "guided", "wellness",
  "hotel",
]);

// Sub-types whose visibility is controlled by the sidebar toggles
const CONTROLLED_SUB_TYPES = new Set(LOCATION_SUB_TYPES);

/** Returns true only for cards that are real physical locations. */
function isRealPlace(card: Card): boolean {
  if (card.lat == null || card.lng == null) return false;
  return card.sub_type != null && LOCATION_SUB_TYPES.has(card.sub_type);
}

function makeInitialSubTypes(): Set<string> {
  return new Set(CONTROLLED_SUB_TYPES);
}

// ── Module-level — outside React entirely ────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MarkerEntry = { marker: any; type: CardType; cardRef: { current: Card } };
const MARKERS = new Map<string, MarkerEntry>();
const ACTIVE_TYPES = new Set<CardType>(["activity", "food"]);

export default function FullMapClient({ trip, days, cards, userAvatarUrl }: Props) {
  const mapContainerRef  = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstRef       = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mbRef            = useRef<any>(null);
  const selectedInnerRef = useRef<HTMLDivElement | null>(null);
  const clickedPinRef    = useRef(false);
  const activeSubTypesRef = useRef<Set<string>>(makeInitialSubTypes());

  const [localCards, setLocalCards]     = useState<Card[]>(cards);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showHint, setShowHint]         = useState(false);
  const [activeSubTypes, setActiveSubTypesState] = useState<Set<string>>(makeInitialSubTypes);
  const [showCreate, setShowCreate]     = useState(false);
  const [createCoords, setCreateCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pendingPlace, setPendingPlace] = useState<PlaceResult | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tempPinRef = useRef<any>(null);

  const hasToken = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

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

  // ── Sync all marker visibility against sub-type toggles ──────
  const syncVisibility = useCallback(() => {
    const map = mapInstRef.current;
    if (!map) return;
    MARKERS.forEach(({ marker, type, cardRef }) => {
      const card = cardRef.current;
      const subTypeOk =
        !card.sub_type ||
        !CONTROLLED_SUB_TYPES.has(card.sub_type) ||
        activeSubTypesRef.current.has(card.sub_type);
      const show = ACTIVE_TYPES.has(type) && subTypeOk;
      if (show) marker.addTo(map); else marker.remove();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubTypesChange(next: Set<string>) {
    activeSubTypesRef.current = next;
    setActiveSubTypesState(new Set(next));
    syncVisibility();
  }

  // ── Add a pin to the live map ────────────────────────────────
  const addPinToMap = useCallback((card: Card) => {
    const map = mapInstRef.current;
    const mb  = mbRef.current;
    if (!map || !mb || !isRealPlace(card)) return;

    const lat = card.lat!;
    const lng = card.lng!;

    const cardRef: { current: Card } = { current: card };
    const { wrapper, inner } = makeMaterialPinElement(card.type, card.sub_type, card.status);
    inner.title = card.title;

    const mbMarker = new mb.Marker({ element: wrapper, anchor: "center" })
      .setLngLat([lng, lat]);

    const subTypeOk =
      !card.sub_type ||
      !CONTROLLED_SUB_TYPES.has(card.sub_type) ||
      activeSubTypesRef.current.has(card.sub_type);

    if (ACTIVE_TYPES.has(card.type) && subTypeOk) {
      mbMarker.addTo(map);
    }

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
      setSelectedCard(cardRef.current);
    });

    MARKERS.set(card.id, { marker: mbMarker, type: card.type, cardRef });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sidebar card select: fly to pin + open sheet ─────────────
  function handleSidebarCardSelect(card: Card) {
    const map = mapInstRef.current;
    if (map && card.lat != null && card.lng != null) {
      map.flyTo({ center: [card.lng, card.lat], zoom: 14 });
    }
    deselectPin();
    const entry = MARKERS.get(card.id);
    if (entry) {
      const inner = entry.marker.getElement().children[0] as HTMLDivElement | undefined;
      if (inner) {
        inner.dataset.selected = "1";
        inner.style.transform  = "scale(1.15)";
        selectedInnerRef.current = inner;
      }
      setSelectedCard(entry.cardRef.current);
    } else {
      setSelectedCard(card);
    }
  }

  // ── Place search: fetch details, drop temp pin, open sheet ───
  async function handlePlaceSelect(placeId: string, sessionToken: string) {
    try {
      const res  = await fetch(
        `/api/places/details?place_id=${encodeURIComponent(placeId)}&sessiontoken=${encodeURIComponent(sessionToken)}`,
      );
      const data = await res.json();
      if (!data.result) return;
      const { result } = data;
      const lat = result.geometry.location.lat as number;
      const lng = result.geometry.location.lng as number;

      // Resolve cover photo via server-side proxy
      let coverPhotoUrl: string | undefined;
      const photoRef = result.photos?.[0]?.photo_reference as string | undefined;
      if (photoRef) {
        try {
          const photoRes  = await fetch(`/api/places/photo?photo_reference=${encodeURIComponent(photoRef)}&maxwidth=800`);
          const photoData = await photoRes.json();
          if (photoData.url) coverPhotoUrl = photoData.url as string;
        } catch {
          // best-effort
        }
      }

      // Parse today's opening hours
      let openNow: boolean | undefined;
      let todayHours: string | undefined;
      if (result.opening_hours) {
        openNow = result.opening_hours.open_now as boolean | undefined;
        const weekdayText = result.opening_hours.weekday_text as string[] | undefined;
        if (weekdayText?.length) {
          const jsDay = new Date().getDay();
          const idx   = jsDay === 0 ? 6 : jsDay - 1;
          const raw   = weekdayText[idx] ?? "";
          const sep   = raw.indexOf(": ");
          todayHours  = sep !== -1 ? raw.slice(sep + 2) : raw;
        }
      }

      if (tempPinRef.current) { tempPinRef.current.remove(); tempPinRef.current = null; }

      const mb  = mbRef.current;
      const map = mapInstRef.current;
      if (mb && map) {
        const el = document.createElement("div");
        el.style.cssText = "width:28px;height:28px;cursor:pointer;";
        el.innerHTML = TEMP_PIN_SVG;
        tempPinRef.current = new mb.Marker({ element: el, anchor: "center" })
          .setLngLat([lng, lat])
          .addTo(map);
        map.flyTo({ center: [lng, lat], zoom: 15 });
      }

      setPendingPlace({
        placeId,
        name:             result.name,
        address:          result.formatted_address ?? "",
        lat, lng,
        website:          result.website,
        mapsUrl:          result.url,
        coverPhotoUrl,
        rating:           result.rating,
        userRatingsTotal: result.user_ratings_total,
        phone:            result.formatted_phone_number,
        openNow,
        todayHours,
      });
    } catch {
      // silently ignore network errors
    }
  }

  function handleAddToTripClose() {
    if (tempPinRef.current) { tempPinRef.current.remove(); tempPinRef.current = null; }
    setPendingPlace(null);
  }

  function handlePlaceCardCreated(card: Card) {
    if (tempPinRef.current) { tempPinRef.current.remove(); tempPinRef.current = null; }
    setPendingPlace(null);
    addPinToMap(card);
    setLocalCards((prev) => [...prev, card]);
  }

  // ── Handle card delete from sidebar or sheet ─────────────────
  const handleCardDelete = useCallback((cardId: string) => {
    const entry = MARKERS.get(cardId);
    if (entry) { entry.marker.remove(); MARKERS.delete(cardId); }
    setLocalCards((prev) => prev.filter((c) => c.id !== cardId));
    setSelectedCard((prev) => (prev?.id === cardId ? null : prev));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // ── Map initialisation (runs once) ───────────────────────────
  useEffect(() => {
    if (!hasToken || !mapContainerRef.current) return;

    let cancelled = false;

    import("mapbox-gl").then((mapboxgl) => {
      if (cancelled || !mapContainerRef.current || mapInstRef.current) return;

      mapContainerRef.current.innerHTML = "";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mb = mapboxgl.default as any;
      mb.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;
      mbRef.current = mb;

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
        if (mapInstRef.current !== map) return;

        MARKERS.forEach(({ marker }) => marker.remove());
        MARKERS.clear();

        type Resolved = { card: Card; lat: number; lng: number };
        const mappable: Resolved[] = cards.flatMap((c) => {
          if (!isRealPlace(c)) return [];
          return [{ card: c, lat: c.lat!, lng: c.lng! }];
        });

        mappable.forEach(({ card, lat, lng }) => {
          const cardRef: { current: Card } = { current: card };
          const { wrapper, inner } = makeMaterialPinElement(card.type, card.sub_type, card.status);
          inner.title = card.title;

          const mbMarker = new mb.Marker({ element: wrapper, anchor: "center" })
            .setLngLat([lng, lat])
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
            setSelectedCard(cardRef.current);
          });

          MARKERS.set(card.id, { marker: mbMarker, type: card.type, cardRef });
        });

        // Fit to all pins
        if (mappable.length > 1) {
          const coords = mappable.map(({ lng, lat }) => [lng, lat] as [number, number]);
          const bounds = coords.reduce(
            (b: unknown, coord) => (b as { extend: (c: [number, number]) => unknown }).extend(coord),
            new mb.LngLatBounds(coords[0], coords[0]),
          );
          map.fitBounds(bounds, { padding: 80, maxZoom: 15 });
        }
      });

      map.on("click", () => {
        if (clickedPinRef.current) { clickedPinRef.current = false; return; }
        deselectPin();
        setSelectedCard(null);
      });
    });

    return () => {
      cancelled = true;
      MARKERS.forEach(({ marker }) => marker.remove());
      MARKERS.clear();
      ACTIVE_TYPES.clear();
      ACTIVE_TYPES.add("activity");
      ACTIVE_TYPES.add("food");
      if (tempPinRef.current) { tempPinRef.current.remove(); tempPinRef.current = null; }
      mbRef.current = null;
      if (mapInstRef.current) {
        mapInstRef.current.remove();
        mapInstRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: "flex", width: "100%", height: "calc(100dvh - 80px)", overflow: "hidden" }}>

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex md:w-[300px] flex-shrink-0 bg-white border-r border-gray-100 overflow-y-auto z-20 flex-col">
        <MapSidebar
          cards={localCards}
          activeSubTypes={activeSubTypes}
          setActiveSubTypes={handleSubTypesChange}
          onCardSelect={handleSidebarCardSelect}
          onCardDelete={handleCardDelete}
        />
      </aside>

      {/* ── Map area ── */}
      <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>

        {/* Map canvas */}
        {hasToken ? (
          <div ref={mapContainerRef} style={{ position: "absolute", inset: 0 }} />
        ) : (
          <div style={{ position: "absolute", inset: 0 }} className="bg-gray-50 flex flex-col items-center justify-center gap-1">
            <p className="text-sm font-medium text-gray-500">Map unavailable</p>
            <p className="text-xs text-gray-400">Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local</p>
          </div>
        )}

        {/* Back button — top-left */}
        <Link
          href={`/trips/${trip.id}`}
          className="absolute top-4 left-4 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center"
          style={{ backdropFilter: "blur(8px)", zIndex: 10 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>

        {/* Place search — always visible bar */}
        <PlaceSearch onPlaceSelect={handlePlaceSelect} destination={trip.destination} />

        {/* Avatar — top-right */}
        <Link
          href={`/trips/${trip.id}`}
          className="absolute top-4 right-4 w-8 h-8 rounded-full overflow-hidden bg-white/80"
          style={{ backdropFilter: "blur(8px)", zIndex: 10 }}
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

        {/* One-time hint */}
        {showHint && (
          <div
            className="absolute top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
            style={{ animation: "fadeOut 500ms 2500ms ease-in forwards" }}
          >
            <p
              className="bg-gray-900/85 text-white text-[11px] font-medium px-3 py-1.5 rounded-full whitespace-nowrap"
              style={{ backdropFilter: "blur(4px)" }}
            >
              Hollow pins are ideas · Filled pins are confirmed
            </p>
          </div>
        )}

        {/* FAB — add card */}
        {days.length > 0 && (
          <button
            onClick={() => {
              const center = mapInstRef.current?.getCenter();
              setCreateCoords(center ? { lat: center.lat, lng: center.lng } : null);
              setShowCreate(true);
            }}
            className="absolute bottom-5 right-4 w-12 h-12 rounded-full bg-activity text-white flex items-center justify-center active:scale-95 transition-all duration-150"
            style={{ zIndex: 10, boxShadow: "0 4px 12px rgba(13,148,136,0.4)" }}
            aria-label="Add card"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}

        {/* Centered pin popup */}
        {selectedCard && (
          <MapPinPopup
            card={selectedCard}
            onClose={() => { deselectPin(); setSelectedCard(null); }}
          />
        )}

        {/* Create card sheet */}
        {showCreate && days.length > 0 && (
          <CreateCardSheet
            dayId={days[0].id}
            tripId={trip.id}
            endPosition={0}
            initialStatus="interested"
            initialLat={createCoords?.lat}
            initialLng={createCoords?.lng}
            onClose={() => setShowCreate(false)}
            onCardCreated={(card) => {
              setShowCreate(false);
              addPinToMap(card);
            }}
          />
        )}

        {/* Add to Trip sheet */}
        {pendingPlace && days.length > 0 && (
          <AddToTripSheet
            place={pendingPlace}
            tripId={trip.id}
            dayId={days[0].id}
            onClose={handleAddToTripClose}
            onCardCreated={handlePlaceCardCreated}
          />
        )}
      </div>
    </div>
  );
}
