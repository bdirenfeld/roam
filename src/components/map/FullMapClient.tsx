"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import MapPinPopup from "./MapPinPopup";
import MapSidebar, { SIDEBAR_SUB_TYPES } from "./MapSidebar";
import PlaceSearch from "./PlaceSearch";
import AddToTripSheet from "./AddToTripSheet";
import type { PlaceResult } from "./AddToTripSheet";
import type { Trip, Day, Card, CardType } from "@/types/database";
import { makeMaterialPinElement } from "@/lib/mapPins";
import { Funnel, Heart } from "@phosphor-icons/react";
import AppMenu from "@/components/ui/AppMenu";

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
  /** Guest view — no place search/add, no pin editing/delete, no sidebar. */
  readOnly?: boolean;
}

// Sub-types whose visibility is controlled by the sidebar toggles. Derived
// from the sidebar's own rows so the two lists can never disagree — a sub-type
// that sits under a row but not in here silently ignores that row's toggle.
// (Retired `challenge` is deliberately absent: no row offers it, so leaving it
// uncontrolled keeps legacy pins visible under the Activity type toggle.)
const CONTROLLED_SUB_TYPES = new Set<string>(SIDEBAR_SUB_TYPES);

// Skeleton card titles (Day DNA templates) — these never have real locations
const SKELETON_PREFIXES = [
  "morning activity", "afternoon activity", "evening activity",
  "morning coffee", "lunch", "dinner", "aperitivo", "light dinner",
  "check-in", "check-out", "flight to", "flight home",
  "departure", "arrival",
];

function isSkeletonCard(card: Card): boolean {
  // A skeleton is a placeholder, which by definition never came from Google.
  // Without this guard the title match alone hides genuine places whose names
  // start with a skeleton word — "Lunch Lady", "Dinner Bell", "Arrival Bar".
  if (card.place?.google_place_id) return false;
  const lower = (card.place?.title ?? "").toLowerCase();
  return SKELETON_PREFIXES.some((s) => lower.startsWith(s));
}

/** Returns true for any card that has a linked place with coords and isn't a skeleton placeholder. */
function isRealPlace(card: Card): boolean {
  return (
    card.place != null &&
    card.place.lat != null &&
    card.place.lng != null &&
    !isSkeletonCard(card)
  );
}

function makeInitialSubTypes(): Set<string> {
  return new Set(CONTROLLED_SUB_TYPES);
}

// ── Module-level — outside React entirely ────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MarkerEntry = { marker: any; type: CardType; cardRef: { current: Card } };
const MARKERS = new Map<string, MarkerEntry>();

export default function FullMapClient({ trip, days, cards, userAvatarUrl, readOnly = false }: Props) {
  const mapContainerRef  = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstRef       = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mbRef            = useRef<any>(null);
  const selectedInnerRef = useRef<HTMLDivElement | null>(null);
  const clickedPinRef    = useRef(false);
  const activeSubTypesRef  = useRef<Set<string>>(makeInitialSubTypes());
  const activeTypesRef     = useRef<Set<CardType>>(new Set(["activity", "food", "logistics"] as CardType[]));
  const activeStatusesRef  = useRef<Set<string>>(new Set(["interested", "in_itinerary"]));
  // "We loved this" as a filter — off by default, and composed with the type,
  // sub-type and status filters rather than replacing any of them.
  const lovedOnlyRef       = useRef<boolean>(false);

  const selectedCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const [anchorPos, setAnchorPos] = useState<{ x: number; y: number } | null>(null);

  const [localCards, setLocalCards]     = useState<Card[]>(cards);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showHint, setShowHint]         = useState(false);
  const [activeSubTypes, setActiveSubTypesState] = useState<Set<string>>(makeInitialSubTypes);
  const [activeTypes, setActiveTypesState] = useState<Set<CardType>>(
    () => new Set(["activity", "food", "logistics"] as CardType[]),
  );
  const [activeStatuses, setActiveStatusesState] = useState<Set<string>>(
    () => new Set(["interested", "in_itinerary"]),
  );
  const [lovedOnly, setLovedOnlyState] = useState(false);
  const [pendingPlace, setPendingPlace] = useState<PlaceResult | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tempPinRef = useRef<any>(null);

  const hasToken = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // First-visit intro card — shown until dismissed or the first real pin is
  // saved. Owner-only; the durable pin legend below replaces the old 3s toast.
  useEffect(() => {
    if (readOnly) return;
    if (!localStorage.getItem("roam_map_intro_v1")) setShowHint(true);
  }, [readOnly]);
  const dismissIntro = useCallback(() => {
    setShowHint(false);
    localStorage.setItem("roam_map_intro_v1", "1");
  }, []);
  const hasRealPins = localCards.some(isRealPlace);

  function computeAnchorPos(lat: number, lng: number): { x: number; y: number } | null {
    const map = mapInstRef.current;
    const container = mapContainerRef.current;
    if (!map || !container) return null;
    const point = map.project([lng, lat]);
    const rect  = container.getBoundingClientRect();
    return { x: rect.left + point.x, y: rect.top + point.y };
  }

  function deselectPin() {
    if (selectedInnerRef.current) {
      selectedInnerRef.current.dataset.selected = "";
      selectedInnerRef.current.style.transform  = "";
      selectedInnerRef.current = null;
    }
    selectedCoordsRef.current = null;
    setAnchorPos(null);
  }

  // ── Sync all marker visibility against type + sub-type + status toggles ─
  const syncVisibility = useCallback(() => {
    const map = mapInstRef.current;
    if (!map) return;
    MARKERS.forEach(({ marker, type, cardRef }) => {
      const card = cardRef.current;
      const sub = card.place!.sub_type;
      const subTypeOk =
        !sub ||
        !CONTROLLED_SUB_TYPES.has(sub) ||
        activeSubTypesRef.current.has(sub);
      const statusOk = activeStatusesRef.current.has(card.status ?? "");
      const lovedOk  = !lovedOnlyRef.current || card.place!.loved === true;
      const show = activeTypesRef.current.has(type) && subTypeOk && statusOk && lovedOk;
      if (show) marker.addTo(map); else marker.remove();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubTypesChange(next: Set<string>) {
    activeSubTypesRef.current = next;
    setActiveSubTypesState(new Set(next));
    syncVisibility();
  }

  function handleActiveTypesChange(next: Set<CardType>) {
    activeTypesRef.current = next;
    setActiveTypesState(new Set(next));
    syncVisibility();
  }

  function handleActiveStatusesChange(next: Set<string>) {
    activeStatusesRef.current = next;
    setActiveStatusesState(new Set(next));
    syncVisibility();
  }

  function handleLovedOnlyChange(next: boolean) {
    lovedOnlyRef.current = next;
    setLovedOnlyState(next);
    syncVisibility();
  }

  // ── Add a pin to the live map ────────────────────────────────
  const addPinToMap = useCallback((card: Card) => {
    const map = mapInstRef.current;
    const mb  = mbRef.current;
    if (!map || !mb || !isRealPlace(card)) return;

    const place = card.place!;
    const lat = place.lat!;
    const lng = place.lng!;

    const cardRef: { current: Card } = { current: card };
    const cardDetails = card.details as Record<string, unknown> | null;
    const hasRec = !!(cardDetails?.recommended_by);
    const { wrapper, inner } = makeMaterialPinElement(place.type, place.sub_type, card.status, hasRec);
    inner.title = place.title;

    const mbMarker = new mb.Marker({ element: wrapper, anchor: "center" })
      .setLngLat([lng, lat]);

    const subTypeOk =
      !place.sub_type ||
      !CONTROLLED_SUB_TYPES.has(place.sub_type) ||
      activeSubTypesRef.current.has(place.sub_type);
    const statusOk = activeStatusesRef.current.has(card.status ?? "");
    const lovedOk  = !lovedOnlyRef.current || place.loved === true;

    if (activeTypesRef.current.has(place.type) && subTypeOk && statusOk && lovedOk) {
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
      inner.style.transform  = "scale(1.4)";
      selectedInnerRef.current = inner;
      selectedCoordsRef.current = { lat, lng };
      setAnchorPos(computeAnchorPos(lat, lng));
      setSelectedCard(cardRef.current);
    });

    MARKERS.set(card.id, { marker: mbMarker, type: place.type, cardRef });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Un-hide exactly what a card needs to be visible — nothing more.
   *
   * Picking a place in the sidebar must not reshuffle the filters, but flying
   * to a pin that the current filters have removed from the map is a silent
   * failure: you land on an empty street. So if this card's type, status or
   * sub-type is switched off, switch that one thing back on. Goes through the
   * setters, never the refs, so state and syncVisibility stay in step.
   */
  function revealCard(card: Card) {
    const place = card.place;
    if (!place) return;

    if (!activeTypesRef.current.has(place.type)) {
      handleActiveTypesChange(new Set(activeTypesRef.current).add(place.type));
    }

    const status = card.status ?? "";
    if (status && !activeStatusesRef.current.has(status)) {
      handleActiveStatusesChange(new Set(activeStatusesRef.current).add(status));
    }

    const sub = place.sub_type;
    if (sub && CONTROLLED_SUB_TYPES.has(sub) && !activeSubTypesRef.current.has(sub)) {
      handleSubTypesChange(new Set(activeSubTypesRef.current).add(sub));
    }

    if (lovedOnlyRef.current && place.loved !== true) {
      handleLovedOnlyChange(false);
    }
  }

  // ── Sidebar card select: fly to pin + open sheet ─────────────
  function handleSidebarCardSelect(card: Card) {
    const map = mapInstRef.current;
    const place = card.place!;
    const lat = place.lat;
    const lng = place.lng;
    // Reveal first: syncVisibility must have put the marker back on the map
    // before we reach for its element below.
    revealCard(card);
    if (map && lat != null && lng != null) {
      map.flyTo({ center: [lng, lat], zoom: 14 });
    }
    deselectPin();
    const entry = MARKERS.get(card.id);
    if (entry) {
      const inner = entry.marker.getElement().children[0] as HTMLDivElement | undefined;
      if (inner) {
        inner.dataset.selected = "1";
        inner.style.transform  = "scale(1.4)";
        selectedInnerRef.current = inner;
      }
      if (lat != null && lng != null) {
        selectedCoordsRef.current = { lat, lng };
        setAnchorPos(computeAnchorPos(lat, lng));
      }
      setSelectedCard(entry.cardRef.current);
    } else {
      if (lat != null && lng != null) {
        selectedCoordsRef.current = { lat, lng };
        setAnchorPos(computeAnchorPos(lat, lng));
      }
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
          const photoRes  = await fetch(`/api/places/photo/by-reference?photo_reference=${encodeURIComponent(photoRef)}&maxwidth=800`);
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
        // Forward the raw opening_hours object and the full raw details result
        // so AddToTripSheet can persist them onto the places row (world facts).
        hours:            result.opening_hours ?? null,
        details:          result,
      });
    } catch {
      // silently ignore network errors
    }
  }

  function handleAddToTripClose() {
    if (tempPinRef.current) { tempPinRef.current.remove(); tempPinRef.current = null; }
    setPendingPlace(null);
  }

  /**
   * A card that has just been written — from the add sheet or from a pin's
   * "Add to day" — becomes a live pin here.
   *
   * revealCard runs first, and it matters most for a card saved straight onto a
   * day: with "In Itinerary" toggled off, the pin would be created and
   * immediately filtered out, so the save would look like it failed. Same
   * spirit as flying to a hidden pin from the sidebar.
   */
  function registerNewCard(card: Card) {
    revealCard(card);
    addPinToMap(card);
    setLocalCards((prev) => [...prev, card]);
  }

  function handlePlaceCardCreated(card: Card) {
    if (tempPinRef.current) { tempPinRef.current.remove(); tempPinRef.current = null; }
    setPendingPlace(null);
    registerNewCard(card);
  }

  // ── Handle card delete from sidebar or sheet ─────────────────
  const handleCardDelete = useCallback((cardId: string) => {
    const entry = MARKERS.get(cardId);
    if (entry) { entry.marker.remove(); MARKERS.delete(cardId); }
    setLocalCards((prev) => prev.filter((c) => c.id !== cardId));
    setSelectedCard((prev) => (prev?.id === cardId ? null : prev));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle card type/sub-type update from popup editor ───────
  const handleCardUpdate = useCallback((updatedCard: Card) => {
    // Remove old marker
    const entry = MARKERS.get(updatedCard.id);
    if (entry) { entry.marker.remove(); MARKERS.delete(updatedCard.id); }
    // Update local state
    setLocalCards((prev) => prev.map((c) => c.id === updatedCard.id ? updatedCard : c));
    setSelectedCard(updatedCard);
    // Re-add pin with new type/icon
    addPinToMap(updatedCard);
    // Re-select the new pin element
    const newEntry = MARKERS.get(updatedCard.id);
    if (newEntry) {
      const inner = newEntry.marker.getElement().children[0] as HTMLDivElement | undefined;
      if (inner) {
        inner.dataset.selected = "1";
        inner.style.transform  = "scale(1.4)";
        selectedInnerRef.current = inner;
      }
    }
  }, [addPinToMap]); // eslint-disable-line react-hooks/exhaustive-deps


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
        style: "mapbox://styles/mapbox/streets-v12",
        center: [trip.destination_lng ?? 12.4964, trip.destination_lat ?? 41.9028],
        zoom: 13,
        attributionControl: false,
        logoPosition: "bottom-right",
      });
      mapInstRef.current = map;

      map.addControl(new mb.AttributionControl({ compact: true }), "bottom-right");
      map.addControl(new mb.NavigationControl({ showCompass: false }), "bottom-right");
      const geolocate = new mb.GeolocateControl({
        positionOptions:  { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading:   true,
      });
      map.addControl(geolocate, "bottom-right");

      map.once("load", async () => {
        if (mapInstRef.current !== map) return;

        // Only auto-trigger geolocation (and its fly-to) if the user is within
        // 50 km of the trip destination — otherwise the map stays centred on the
        // destination and the user can click the geolocate button themselves.
        if (
          trip.destination_lat != null &&
          trip.destination_lng != null &&
          "geolocation" in navigator
        ) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const R = 6371;
              const dLat = (pos.coords.latitude  - trip.destination_lat!) * (Math.PI / 180);
              const dLng = (pos.coords.longitude - trip.destination_lng!) * (Math.PI / 180);
              const a =
                Math.sin(dLat / 2) ** 2 +
                Math.cos(trip.destination_lat! * (Math.PI / 180)) *
                Math.cos(pos.coords.latitude   * (Math.PI / 180)) *
                Math.sin(dLng / 2) ** 2;
              const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              if (distKm <= 50) geolocate.trigger();
            },
            () => { /* permission denied or unavailable — stay at destination */ },
            { timeout: 5000, maximumAge: 60_000 },
          );
        }

        // Wait for Material Symbols font before creating pins so icons render correctly
        try {
          await document.fonts.load('16px "Material Symbols Outlined"');
        } catch {
          // best-effort — proceed even if font check fails
        }
        if (mapInstRef.current !== map) return;

        MARKERS.forEach(({ marker }) => marker.remove());
        MARKERS.clear();

        type Resolved = { card: Card; lat: number; lng: number };
        const mappable: Resolved[] = cards.flatMap((c) => {
          if (!isRealPlace(c)) return [];
          return [{ card: c, lat: c.place!.lat!, lng: c.place!.lng! }];
        });

        mappable.forEach(({ card, lat, lng }) => {
          const place = card.place!;
          const cardRef: { current: Card } = { current: card };
          const initDetails = card.details as Record<string, unknown> | null;
          const { wrapper, inner } = makeMaterialPinElement(place.type, place.sub_type, card.status, !!(initDetails?.recommended_by));
          inner.title = place.title;

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
            inner.style.transform  = "scale(1.4)";
            selectedInnerRef.current = inner;
            selectedCoordsRef.current = { lat, lng };
            const point = map.project([lng, lat]);
            const rect  = mapContainerRef.current?.getBoundingClientRect();
            if (rect) setAnchorPos({ x: rect.left + point.x, y: rect.top + point.y });
            setSelectedCard(cardRef.current);
          });

          MARKERS.set(card.id, { marker: mbMarker, type: place.type, cardRef });
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

      map.on("move", () => {
        const coords = selectedCoordsRef.current;
        if (!coords || !mapContainerRef.current) return;
        const point = map.project([coords.lng, coords.lat]);
        const rect  = mapContainerRef.current.getBoundingClientRect();
        setAnchorPos({ x: rect.left + point.x, y: rect.top + point.y });
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
    <div className="flex w-full overflow-hidden h-[calc(100dvh-80px)] md:h-[calc(100dvh-64px)]">

      {/* ── Desktop sidebar ── (owner only — it carries per-card delete and the
          enrich utility; a guest gets the bare map) */}
      {!readOnly && (
        <aside className="hidden md:flex md:w-[232px] flex-shrink-0 border-r overflow-y-auto z-20 flex-col" style={{ borderRightColor: "rgba(26,26,46,0.10)", background: "#FAF7F2" }}>
          <MapSidebar
            cards={localCards}
            activeSubTypes={activeSubTypes}            activeTypes={activeTypes}
            setActiveTypes={handleActiveTypesChange}
            activeStatuses={activeStatuses}
            setActiveStatuses={handleActiveStatusesChange}
            lovedOnly={lovedOnly}
            setLovedOnly={handleLovedOnlyChange}
            onCardSelect={handleSidebarCardSelect}
            onCardDelete={handleCardDelete}
          />
        </aside>
      )}

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

        {/* Back button — mobile only (desktop nav lives in masthead + sub-bar) */}
        <Link
          href={`/trips/${trip.id}`}
          className="md:hidden absolute top-4 left-4 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center"
          style={{ backdropFilter: "blur(8px)", zIndex: 10 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>

        {/* The app's one menu — phone only (desktop has it in the masthead).
            This used to be a bare ⋯ that navigated to the Settings PAGE and
            threw away pan, zoom and filters; it also sat under the search
            pill, so nobody found it. Now it is the same menu as the Agenda,
            beside the avatar, and Settings opens as an overlay over the map. */}
        <AppMenu
          variant="mobile"
          tripId={trip.id}
          tripTitle={trip.title}
          trip={trip}
          days={days}
          guest={readOnly}
          wrapperClassName="md:hidden absolute top-4 right-14 z-10"
          triggerClassName="w-8 h-8 rounded-full bg-white/80 backdrop-blur-md flex items-center justify-center text-[#374151]"
        />

        {/* Place search — the add-a-place entry; owner only */}
        {!readOnly && (
          <PlaceSearch onPlaceSelect={handlePlaceSelect} destination={trip.destination} lat={trip.destination_lat} lng={trip.destination_lng} />
        )}

        {/* Filter button + pill bar — bottom-left, expands upward. View-only
            (toggles pin visibility, mutates nothing). Mobile-only for owners
            (desktop owners use the sidebar); shown on desktop too for guests,
            since their sidebar is suppressed. */}
        <div
          className={`${readOnly ? "" : "md:hidden"} absolute bottom-4 left-3 flex flex-col gap-2`}
          style={{ zIndex: 10 }}
        >
          {/* Pill rows — rendered above the button (flex-col, first child = top) */}
          {filterOpen && (
            <div className="flex flex-col gap-2 animate-in fade-in duration-200">
              {/* Row 1 (top) — Categories */}
              <div className="flex items-center gap-2">
                {(
                  [
                    { typeKey: "activity"  as CardType, label: "Activity", color: "#1D9E75" },
                    { typeKey: "food"      as CardType, label: "Food",     color: "#7C3AED" },
                    { typeKey: "logistics" as CardType, label: "Logistics", color: "#1A1A2E" },
                  ] as { typeKey: CardType; label: string; color: string }[]
                ).map(({ typeKey, label, color }) => {
                  const active = activeTypes.has(typeKey);
                  return (
                    <button
                      key={typeKey}
                      onClick={() => {
                        const next = new Set(activeTypes);
                        if (next.has(typeKey)) next.delete(typeKey); else next.add(typeKey);
                        handleActiveTypesChange(next);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
                      style={{
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                        background: active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)",
                        color: active ? "#374151" : "#9CA3AF",
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-opacity duration-200"
                        style={{ background: color, opacity: active ? 1 : 0.3 }}
                      />
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Row 2 — Status. Hidden for guests: under RLS they only have
                  scheduled pins, so the toggle would be dead. */}
              {!readOnly && (
              <div className="flex items-center gap-2">
                {(
                  [
                    { status: "interested",   label: "Interested"   },
                    { status: "in_itinerary", label: "In Itinerary" },
                  ] as { status: string; label: string }[]
                ).map(({ status, label }) => {
                  const active = activeStatuses.has(status);
                  return (
                    <button
                      key={status}
                      onClick={() => {
                        const next = new Set(activeStatuses);
                        if (next.has(status)) next.delete(status); else next.add(status);
                        handleActiveStatusesChange(next);
                      }}
                      className="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
                      style={{
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                        background: active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)",
                        color: active ? "#374151" : "#9CA3AF",
                        textDecoration: active ? "none" : "line-through",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}

                {/* Loved — the same filter the desktop sidebar has. Roam is
                    mobile-first; leaving it desktop-only made the one
                    un-gameable signal in the app unreachable on a phone. */}
                <button
                  onClick={() => handleLovedOnlyChange(!lovedOnly)}
                  aria-pressed={lovedOnly}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
                  style={{
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    background: lovedOnly ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)",
                    color: lovedOnly ? "#C4622D" : "#9CA3AF",
                  }}
                >
                  <Heart size={11} weight={lovedOnly ? "fill" : "light"} color={lovedOnly ? "#C4622D" : "#9CA3AF"} />
                  Loved
                </button>
              </div>
              )}
            </div>
          )}

          {/* Filter button — always at bottom of the stack */}
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-200"
            style={{
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              background: filterOpen ? "#1A1A2E" : "rgba(255,255,255,0.9)",
              color: filterOpen ? "#FFFFFF" : "#374151",
            }}
          >
            <Funnel size={13} weight="light" color={filterOpen ? "#FFFFFF" : "#374151"} />
            {filterOpen ? "Done" : "Filter"}
          </button>
        </div>

        {/* Avatar — mobile only (desktop avatar lives in masthead) */}
        <Link
          href={`/trips/${trip.id}`}
          className="md:hidden absolute top-4 right-4 w-8 h-8 rounded-full overflow-hidden bg-white/80"
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

        {/* First-visit intro — sits under the search bar until dismissed or
            the first real pin lands. Owner-only. */}
        {showHint && !hasRealPins && !readOnly && hasToken && (
          <div
            className="absolute top-16 left-1/2 -translate-x-1/2 z-30 w-[min(340px,calc(100%-32px))] bg-white rounded-2xl shadow-sheet border border-gray-100 px-5 py-4"
          >
            <p className="text-[14px] font-semibold text-gray-900">Start your map</p>
            <p className="text-[13px] text-gray-500 leading-[1.55] mt-1">
              Search for any place you&rsquo;re curious about — a restaurant, a
              museum, your hotel. Save it and it becomes a pin. If you already
              know when you&rsquo;re going, pick a day in the same step — otherwise
              leave it on the map and sort it into a day later.
            </p>
            <button
              onClick={dismissIntro}
              className="mt-3 text-[13px] font-semibold text-[#C4622D]"
            >
              Got it
            </button>
          </div>
        )}

        {/* Pin meanings (hollow = idea, filled = scheduled) are taught by the
            intro card and the guide; no persistent legend on the map. */}

        {/* Pin-anchored popup */}
        {selectedCard && (
          <MapPinPopup
            card={selectedCard}
            anchorPos={anchorPos}
            onClose={() => { deselectPin(); setSelectedCard(null); }}
            onCardUpdate={readOnly ? undefined : handleCardUpdate}
            onCardDelete={readOnly ? undefined : (cardId) => { deselectPin(); handleCardDelete(cardId); }}
            onCardCreated={readOnly ? undefined : (created) => { deselectPin(); registerNewCard(created); }}
            days={readOnly ? undefined : days}
            tripId={readOnly ? undefined : trip.id}
          />
        )}

        {/* Add to Trip sheet */}
        {/* Add to Trip sheet. No longer gated on the journey having days — the
            sheet only needed one before, to fill a dayId it then ignored. A
            dayless journey now still gets map-only saves. */}
        {pendingPlace && (
          <AddToTripSheet
            place={pendingPlace}
            tripId={trip.id}
            days={days}
            onClose={handleAddToTripClose}
            onCardCreated={handlePlaceCardCreated}
          />
        )}

      </div>
    </div>
  );
}
