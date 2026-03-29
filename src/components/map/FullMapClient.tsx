"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import CardBottomSheet from "@/components/cards/CardBottomSheet";
import CreateCardSheet from "@/components/plan/CreateCardSheet";
import MapSidebar from "./MapSidebar";
import PlaceSearch from "./PlaceSearch";
import AddToTripSheet from "./AddToTripSheet";
import type { PlaceResult } from "./AddToTripSheet";
import type { PlacementFilter } from "./MapSidebar";
import type { Trip, Day, Card, CardType } from "@/types/database";
import { makePinElement, makePinSVG, PIN_COLORS } from "@/lib/mapPins";

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

const FILTER_DOTS: { type: CardType; label: string }[] = [
  { type: "activity",  label: "Activity"  },
  { type: "food",      label: "Food"      },
  { type: "logistics", label: "Logistics" },
];

// Sub-types that the sidebar can toggle (others always show)
const CONTROLLED_SUB_TYPES = new Set([
  "guided", "hosted", "self_directed", "wellness", "challenge", "event",
  "restaurant", "fine_dining", "street_food", "coffee", "coffee_dessert", "cocktail_bar", "drinks",
  "hotel", "flight_arrival", "flight_departure",
]);

// Sub-types that represent real, pinnable places even without a source_url/address
const PLACE_SUB_TYPES = new Set([
  "guided", "wellness",
  "restaurant", "fine_dining", "street_food", "coffee", "coffee_dessert", "cocktail_bar", "drinks",
  "hotel", "flight_arrival", "flight_departure",
]);

/** A card should only appear as a map pin if it has coordinates AND is a real place. */
function isRealPlace(card: Card): boolean {
  if (card.lat == null || card.lng == null) return false;
  if (card.source_url) return true;
  if (card.address) return true;
  if (card.sub_type && PLACE_SUB_TYPES.has(card.sub_type)) return true;
  return false;
}

// All sub-types that start active (matches CONTROLLED_SUB_TYPES + spec values)
function makeInitialSubTypes(): Set<string> {
  return new Set(CONTROLLED_SUB_TYPES);
}

// ── Module-level — outside React entirely ────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MarkerEntry = { marker: any; type: CardType; status: string; dayId: string; cardRef: { current: Card } };
const MARKERS = new Map<string, MarkerEntry>();
const ACTIVE_TYPES = new Set<CardType>(["activity", "food", "logistics"]);

export default function FullMapClient({ trip, days, cards, userAvatarUrl }: Props) {
  const mapContainerRef  = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstRef       = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mbRef            = useRef<any>(null);
  const filtersRef       = useRef<HTMLDivElement>(null);
  const selectedInnerRef = useRef<HTMLDivElement | null>(null);
  const clickedPinRef    = useRef(false);
  const placementFilterRef  = useRef<PlacementFilter>("all");
  const dayFilterRef        = useRef<string | null>(null);
  const activeSubTypesRef   = useRef<Set<string>>(makeInitialSubTypes());

  const [localCards, setLocalCards]     = useState<Card[]>(cards);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showHint, setShowHint]         = useState(false);
  const [placementFilter, setPlacementFilter] = useState<PlacementFilter>("all");
  const [dayFilter, setDayFilter]             = useState<string | null>(null);
  const [activeSubTypes, setActiveSubTypesState] = useState<Set<string>>(makeInitialSubTypes);
  const [showCreate, setShowCreate]   = useState(false);
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

  // ── Sync all marker visibility against current filters ──────
  const syncVisibility = useCallback(() => {
    const map = mapInstRef.current;
    if (!map) return;
    MARKERS.forEach(({ marker, type, status, dayId, cardRef }) => {
      const card = cardRef.current;
      const subTypeOk =
        !card.sub_type ||
        !CONTROLLED_SUB_TYPES.has(card.sub_type) ||
        activeSubTypesRef.current.has(card.sub_type);
      const placementOk =
        placementFilterRef.current === "all" ||
        (placementFilterRef.current === "placed"   && status === "in_itinerary") ||
        (placementFilterRef.current === "unplaced" && status === "interested");
      const show =
        ACTIVE_TYPES.has(type) &&
        (dayFilterRef.current === null || dayId === dayFilterRef.current) &&
        subTypeOk &&
        placementOk;
      if (show) marker.addTo(map); else marker.remove();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sidebar filter handlers (update ref + state + sync) ─────
  function handleSubTypesChange(next: Set<string>) {
    activeSubTypesRef.current = next;
    setActiveSubTypesState(new Set(next));
    syncVisibility();
  }

  function handlePlacementChange(f: PlacementFilter) {
    placementFilterRef.current = f;
    setPlacementFilter(f);
    syncVisibility();
  }

  function handleDayFilter(dayId: string | null) {
    dayFilterRef.current = dayId;
    setDayFilter(dayId);
    syncVisibility();
  }

  // ── Add a pin to the live map ────────────────────────────────
  const addPinToMap = useCallback((card: Card) => {
    const map = mapInstRef.current;
    const mb  = mbRef.current;
    if (!map || !mb) return;
    if (!isRealPlace(card)) return;

    let lat = card.lat, lng = card.lng;
    if (lat == null || lng == null) {
      const d = card.details as Record<string, unknown>;
      if (typeof d?.lat === "number" && typeof d?.lng === "number") {
        lat = d.lat as number; lng = d.lng as number;
      }
    }
    if (lat == null || lng == null) return;

    const cardRef: { current: Card } = { current: card };
    const { wrapper, inner } = makePinElement(card.type, card.sub_type, card.status);
    inner.title = card.title;

    const mbMarker = new mb.Marker({ element: wrapper, anchor: "center" })
      .setLngLat([lng, lat]);

    const subTypeOk =
      !card.sub_type ||
      !CONTROLLED_SUB_TYPES.has(card.sub_type) ||
      activeSubTypesRef.current.has(card.sub_type);
    const placementOk =
      placementFilterRef.current === "all" ||
      (placementFilterRef.current === "placed"   && card.status === "in_itinerary") ||
      (placementFilterRef.current === "unplaced" && card.status === "interested");
    if (ACTIVE_TYPES.has(card.type) && subTypeOk && placementOk &&
        (dayFilterRef.current === null || card.day_id === dayFilterRef.current)) {
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

    MARKERS.set(card.id, { marker: mbMarker, type: card.type, status: card.status, dayId: card.day_id, cardRef });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sidebar card select: fly to pin + open sheet ─────────────
  function handleSidebarCardSelect(card: Card) {
    const map = mapInstRef.current;
    let lat = card.lat, lng = card.lng;
    if (lat == null || lng == null) {
      const d = card.details as Record<string, unknown>;
      if (typeof d?.lat === "number" && typeof d?.lng === "number") {
        lat = d.lat as number; lng = d.lng as number;
      }
    }
    if (map && lat != null && lng != null) {
      map.flyTo({ center: [lng, lat], zoom: 14 });
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

      // Resolve cover photo via server-side proxy (keeps API key hidden)
      let coverPhotoUrl: string | undefined;
      const photoRef = result.photos?.[0]?.photo_reference as string | undefined;
      if (photoRef) {
        try {
          const photoRes  = await fetch(`/api/places/photo?photo_reference=${encodeURIComponent(photoRef)}&maxwidth=800`);
          const photoData = await photoRes.json();
          if (photoData.url) coverPhotoUrl = photoData.url as string;
        } catch {
          // best-effort — ignore photo errors
        }
      }

      // Parse today's opening hours
      let openNow: boolean | undefined;
      let todayHours: string | undefined;
      if (result.opening_hours) {
        openNow = result.opening_hours.open_now as boolean | undefined;
        const weekdayText = result.opening_hours.weekday_text as string[] | undefined;
        if (weekdayText?.length) {
          const jsDay = new Date().getDay();               // 0 = Sunday
          const idx   = jsDay === 0 ? 6 : jsDay - 1;      // weekday_text starts Monday
          const raw   = weekdayText[idx] ?? "";
          const sep   = raw.indexOf(": ");
          todayHours  = sep !== -1 ? raw.slice(sep + 2) : raw;
        }
      }

      // Remove stale temp pin
      if (tempPinRef.current) { tempPinRef.current.remove(); tempPinRef.current = null; }

      // Drop purple preview pin
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

  // ── Handle card updates from CardBottomSheet ─────────────────
  const handleCardUpdate = useCallback((updated: Card) => {
    setSelectedCard(updated);
    const entry = MARKERS.get(updated.id);
    if (entry) {
      entry.cardRef.current = updated;
      MARKERS.set(updated.id, { ...entry, status: updated.status, dayId: updated.day_id });
      const inner = entry.marker.getElement().children[0] as HTMLDivElement | undefined;
      if (inner) inner.innerHTML = makePinSVG(updated.type, updated.sub_type, updated.status);
    }
    syncVisibility();
  }, [syncVisibility]);

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
          if (c.lat != null && c.lng != null) return [{ card: c, lat: c.lat, lng: c.lng }];
          const d = c.details as Record<string, unknown>;
          if (typeof d?.lat === "number" && typeof d?.lng === "number")
            return [{ card: c, lat: d.lat as number, lng: d.lng as number }];
          return [];
        });

        mappable.forEach(({ card, lat, lng }) => {
          const cardRef: { current: Card } = { current: card };
          const { wrapper, inner } = makePinElement(card.type, card.sub_type, card.status);
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

          MARKERS.set(card.id, { marker: mbMarker, type: card.type, status: card.status, dayId: card.day_id, cardRef });
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

        // ── Type filter dots — wired imperatively ─────────────
        filtersRef.current?.querySelectorAll<HTMLButtonElement>("button[data-type]").forEach((btn) => {
          const type = btn.dataset.type as CardType;
          btn.onclick = () => {
            if (ACTIVE_TYPES.has(type)) {
              if (ACTIVE_TYPES.size === 1) return;
              ACTIVE_TYPES.delete(type);
              btn.style.background = "#D1D5DB";
              btn.style.opacity    = "0.5";
            } else {
              ACTIVE_TYPES.add(type);
              btn.style.background = PIN_COLORS[type];
              btn.style.opacity    = "1";
            }
            syncVisibility();
          };
        });
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
      ACTIVE_TYPES.add("logistics");
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
    // Flex row on desktop: sidebar (md+) + map (flex-1)
    <div style={{ display: "flex", width: "100%", height: "calc(100dvh - 80px)", overflow: "hidden" }}>

      {/* ── Desktop sidebar — hidden on mobile ── */}
      <aside className="hidden md:flex md:w-[300px] flex-shrink-0 bg-white border-r border-gray-100 overflow-y-auto z-20 flex-col">
        <MapSidebar
          cards={localCards}
          activeSubTypes={activeSubTypes}
          setActiveSubTypes={handleSubTypesChange}
          placementFilter={placementFilter}
          setPlacementFilter={handlePlacementChange}
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

        {/* Type filter dots — hidden on desktop (sidebar handles type via sub-type) */}
        <div
          ref={filtersRef}
          className="md:hidden absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-4"
          style={{ zIndex: 10 }}
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

        {/* Place search — sits just left of avatar, manages its own expand state */}
        <PlaceSearch onPlaceSelect={handlePlaceSelect} />

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

        {/* Placement toggle — mobile only (desktop uses sidebar) */}
        <div
          className="md:hidden absolute left-1/2 -translate-x-1/2"
          style={{ top: 56, zIndex: 10 }}
        >
          <div
            className="flex items-center bg-white/90 rounded-full p-0.5 border border-gray-100"
            style={{ backdropFilter: "blur(8px)", boxShadow: "0 1px 4px rgba(0,0,0,0.10)" }}
          >
            {(["all", "unplaced", "placed"] as PlacementFilter[]).map((f) => {
              const label = f === "all" ? "All" : f === "unplaced" ? "Unplaced" : "Placed";
              return (
                <button
                  key={f}
                  onClick={() => handlePlacementChange(f)}
                  className={`px-3 py-1 text-[11px] font-semibold rounded-full transition-all duration-150 ${
                    placementFilter === f ? "bg-gray-900 text-white" : "text-gray-500"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Day chips */}
        {days.length > 1 && (
          <div
            className="absolute left-0 right-0"
            style={{ top: 96, zIndex: 10, overflowX: "auto", WebkitOverflowScrolling: "touch" }}
          >
            <div className="flex items-center gap-2 px-4 pb-1" style={{ width: "max-content" }}>
              {days.map((day) => (
                <button
                  key={day.id}
                  onClick={() => handleDayFilter(dayFilter === day.id ? null : day.id)}
                  className={`flex-shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-all duration-150 active:scale-95 ${
                    dayFilter === day.id
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white/90 text-gray-600 border-gray-200"
                  }`}
                  style={{ backdropFilter: "blur(4px)" }}
                >
                  Day {day.day_number}{day.day_name ? ` · ${day.day_name}` : ""}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* One-time hint */}
        {showHint && (
          <div
            className="absolute left-1/2 -translate-x-1/2 z-30 pointer-events-none"
            style={{ top: days.length > 1 ? 136 : 96, animation: "fadeOut 500ms 2500ms ease-in forwards" }}
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

        {/* Card bottom sheet */}
        {selectedCard && (
          <CardBottomSheet
            card={selectedCard}
            days={days}
            onClose={() => { deselectPin(); setSelectedCard(null); }}
            onCardUpdate={handleCardUpdate}
            onCardDelete={handleCardDelete}
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

        {/* Add to Trip sheet — opened after selecting a Google Places result */}
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
