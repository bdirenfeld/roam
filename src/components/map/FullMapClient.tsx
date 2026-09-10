"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MapPinPopup from "./MapPinPopup";
import MapSidebar, { SIDEBAR_SUB_TYPES } from "./MapSidebar";
import PlaceSearch from "./PlaceSearch";
import AddToTripSheet from "./AddToTripSheet";
import WhereToStaySheet from "./WhereToStaySheet";
import MapFilterSheet, { narrowedCount } from "./MapFilterSheet";
import type { PlaceResult } from "./AddToTripSheet";
import type { Trip, Day, Card, CardType, StayCandidate } from "@/types/database";
import { makeMaterialPinElement, makePinElement } from "@/lib/mapPins";
import { Funnel, Files } from "@phosphor-icons/react";
import ConfirmationPreviewSheet, { type ParsedConfirmation } from "@/components/plan/ConfirmationPreviewSheet";
import DocumentsSheet from "@/components/plan/DocumentsSheet";
import AppMenu from "@/components/ui/AppMenu";
import JourneyHeader, { HEADER_GLYPH } from "@/components/ui/JourneyHeader";
import { useGlobalSearch } from "@/components/search/GlobalSearch";
import { useToast } from "@/components/ui/Toast";
import { queuedInsert } from "@/lib/offline/queuedWrite";

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
// `challenge` is back and labelled Race — it has a sidebar row again, so it
// arrives here on its own through SIDEBAR_SUB_TYPES.
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

// userAvatarUrl stays in Props for the page that passes it; the avatar disc
// it fed left with the one header (consistency sweep, Sep 2026).
export default function FullMapClient({ trip, days, cards, readOnly = false }: Props) {
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
  const { toast } = useToast();
  const search = useGlobalSearch();

  // ── Bookings — the same row and flow the Agenda and the Plan have, so the
  // three menus match (Brennan, Sep 2026). Parse → preview → cards; a card
  // that lands with a real place becomes a pin here at once.
  const importInputRef = useRef<HTMLInputElement>(null);
  const [pendingConf, setPendingConf] = useState<{ items: ParsedConfirmation[]; fileName: string; fileType: string } | null>(null);
  const [importingConf, setImportingConf] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showDocs, setShowDocs] = useState(false);

  // ── Where to stay ──────────────────────────────────────────────────
  // Opens from the menu row (…/map?stays=1). Candidates are lettered pins
  // drawn beside the journey's own; the sheet below lists them. Tap a pin
  // and the row scrolls to it; tap a row and the map flies to the pin.
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showStays, setShowStays] = useState(false);
  const [stayCands, setStayCands] = useState<StayCandidate[]>([]);
  const [focusedStay, setFocusedStay] = useState<StayCandidate | null>(null);
  const [mapReady, setMapReady] = useState(false);
  // Desktop: the list is a panel on the right and the map narrows beside it,
  // so every pin stays on screen (the centred sheet sat on the pins it was
  // pointing at — Brennan, 9 Sept 2026). Phone: the bottom sheet.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    // 1024, not 768: at tablet width the 400px panel beside the 232px sidebar
    // left a 136px map (audit, 10 Sept 2026).
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const panelOpen = showStays && !readOnly && isDesktop;
  useEffect(() => {
    // The container just changed width; Mapbox has to be told.
    const map = mapInstRef.current;
    if (!map) return;
    const t = setTimeout(() => { try { map.resize(); } catch { /* not loaded yet */ } }, 30);
    return () => clearTimeout(t);
  }, [panelOpen]);
  const stayMarkersRef = useRef<{ remove: () => void }[]>([]);
  useEffect(() => {
    if (searchParams.get("stays") === "1" && !readOnly) setShowStays(true);
  }, [searchParams, readOnly]);
  useEffect(() => {
    const mb = mbRef.current;
    const map = mapInstRef.current;
    stayMarkersRef.current.forEach((m) => m.remove());
    stayMarkersRef.current = [];
    if (!mb || !map || !mapReady || !showStays) return;
    const coords: [number, number][] = [];
    stayCands.forEach((c) => {
      if (c.lat == null || c.lng == null) return;
      const { wrapper, inner } = makePinElement(
        "logistics", "hotel", c.status === "chosen" ? "in_itinerary" : "interested",
        { label: c.letter ?? "", onClick: () => setFocusedStay(c) },
      );
      inner.title = c.name;
      if (focusedStay?.id === c.id) { inner.dataset.selected = "1"; inner.style.transform = "scale(1.35)"; }
      const marker = new mb.Marker({ element: wrapper, anchor: "center" }).setLngLat([c.lng, c.lat]).addTo(map);
      stayMarkersRef.current.push(marker);
      coords.push([c.lng, c.lat]);
    });
    if (coords.length > 1 && !focusedStay) {
      const bounds = coords.reduce(
        (b: unknown, coord) => (b as { extend: (c: [number, number]) => unknown }).extend(coord),
        new mb.LngLatBounds(coords[0], coords[0]),
      );
      map.fitBounds(bounds, { padding: { top: 80, bottom: 80, left: 40, right: 40 }, maxZoom: 13 });
    }
  }, [showStays, stayCands, focusedStay, mapReady]);
  useEffect(() => {
    const map = mapInstRef.current;
    if (!map || !focusedStay || focusedStay.lat == null || focusedStay.lng == null) return;
    map.flyTo({ center: [focusedStay.lng, focusedStay.lat], zoom: Math.max(map.getZoom(), 12) });
  }, [focusedStay]);
  const closeStays = useCallback(() => {
    setShowStays(false);
    setFocusedStay(null);
    router.replace("/trips/" + trip.id + "/map");
  }, [router, trip.id]);

  // The desktop masthead's menu lives in the layout, so its Bookings row asks
  // whichever screen is open to show the sheet (Brennan, Sep 2026: "I thought
  // bookings was supposed to be in the menu like on mobile").
  useEffect(() => {
    const onOpen = () => setShowDocs(true);
    window.addEventListener("roam:open-bookings", onOpen);
    return () => window.removeEventListener("roam:open-bookings", onOpen);
  }, []);
  const handleImportFile = useCallback(async (file: File) => {
    setImportingConf(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/confirmations/parse", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't read that file.");
      setPendingConf({ items: json.parsed, fileName: file.name, fileType: file.type });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Couldn't read that file.");
      setTimeout(() => setImportError(null), 4000);
    } finally {
      setImportingConf(false);
    }
  }, []);
  const mapMenuExtra = [
    { key: "bookings", title: "Bookings", sub: "", icon: <Files size={15} weight="light" />, onClick: () => setShowDocs(true) },
  ];
  // registerNewCard is declared below as a plain function; the delete
  // handler is memoised, so it reaches the current one through a ref.
  const registerNewCardRef = useRef<(card: Card) => void>(() => {});
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

  const filterNarrowed = narrowedCount({ activeTypes, activeSubTypes, activeStatuses, lovedOnly });

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
  registerNewCardRef.current = registerNewCard;

  // ── Handle card delete from sidebar or sheet ─────────────────
  // The popup and the sidebar delete the row themselves and then call this.
  // The Map used to be the one host with no way back (UX audit, Sep 2026,
  // finding 2): the pin vanished and that was that. Same six seconds as the
  // Plan and the Agenda now — Undo re-inserts under the original id and puts
  // the pin back.
  const handleCardDelete = useCallback((cardId: string) => {
    const entry = MARKERS.get(cardId);
    if (entry) { entry.marker.remove(); MARKERS.delete(cardId); }
    setLocalCards((prev) => {
      const gone = prev.find((c) => c.id === cardId) ?? null;
      if (gone) {
        toast({
          message: "Removed from the map",
          undo: async () => {
            const { error } = await queuedInsert("cards", {
              id: gone.id, day_id: gone.day_id, trip_id: gone.trip_id,
              start_time: gone.start_time, end_time: gone.end_time,
              position: gone.position, status: gone.status, source_url: gone.source_url,
              details: gone.details, ai_generated: gone.ai_generated,
              confirmed: gone.confirmed, place_id: gone.place_id,
            });
            if (error) { toast({ message: "Couldn't bring it back. Try again." }); return; }
            registerNewCardRef.current(gone);
          },
        });
      }
      return prev.filter((c) => c.id !== cardId);
    });
    setSelectedCard((prev) => (prev?.id === cardId ? null : prev));
  }, [toast]); // eslint-disable-line react-hooks/exhaustive-deps

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

        setMapReady(true);

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
        <aside className="hidden md:flex md:w-[232px] flex-shrink-0 border-r overflow-y-auto z-20 flex-col" style={{ borderRightColor: "rgba(26,26,46,0.10)", background: "#F5F4F1" }}>
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
          <div ref={mapContainerRef} className={showStays && !readOnly && !isDesktop ? "stays-open" : undefined} style={{ position: "absolute", inset: 0, right: panelOpen ? 400 : 0 }} />
        ) : (
          <div style={{ position: "absolute", inset: 0 }} className="bg-gray-50 flex flex-col items-center justify-center gap-1">
            <p className="text-sm font-medium text-gray-500">Map unavailable</p>
            <p className="text-xs text-gray-400">Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local</p>
          </div>
        )}



        {/* The app's one menu — phone only (desktop has it in the masthead).
            This used to be a bare ⋯ that navigated to the Settings PAGE and
            threw away pan, zoom and filters; it also sat under the search
            pill, so nobody found it. Now it is the same menu as the Agenda,
            beside the avatar, and Settings opens as an overlay over the map. */}
        <JourneyHeader
          absolute
          backHref={`/trips/${trip.id}`}
          title={trip.title}
          onSearch={() => search.open()}
          menu={
            <AppMenu
              variant="mobile"
              tripId={trip.id}
              tripTitle={trip.title}
              trip={trip}
              days={days}
              guest={readOnly}
              extra={mapMenuExtra}
              triggerClassName={HEADER_GLYPH}
            />
          }
        />

        {/* Place search — the add-a-place entry; owner only */}
        {!readOnly && (
          <PlaceSearch onPlaceSelect={handlePlaceSelect} destination={trip.destination} lat={trip.destination_lat} lng={trip.destination_lng} />
        )}

        {/* Filter — one button, and a short sheet that applies live so the pins
            change while you choose. It used to be three rows of pills over the
            map, where a tap REMOVED a kind; tapping Food now shows the food
            (Brennan, 10 Sept 2026). View-only: it moves no data. Mobile-only
            for owners (desktop owners have the sidebar); guests get it at every
            width, since their sidebar is suppressed. */}
        {!showStays && (
          <div className={`${readOnly ? "" : "md:hidden"} absolute bottom-4 left-3`} style={{ zIndex: 10 }}>
            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              aria-label="Filter the map"
              className="h-9 pl-3 pr-3.5 rounded-full inline-flex items-center gap-2 text-[13px] font-medium shadow"
              style={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", color: "#1A1A2E" }}
            >
              <Funnel size={14} weight="light" color="#1A1A2E" />
              Filter
              {filterNarrowed > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-bold" style={{ background: "#B0541F", color: "#fff" }}>
                  {filterNarrowed}
                </span>
              )}
            </button>
          </div>
        )}

        {filterOpen && (
          <MapFilterSheet
            cards={localCards}
            state={{ activeTypes, activeSubTypes, activeStatuses, lovedOnly }}
            onTypes={handleActiveTypesChange}
            onSubTypes={handleSubTypesChange}
            onStatuses={handleActiveStatusesChange}
            onLoved={handleLovedOnlyChange}
            onClose={() => setFilterOpen(false)}
          />
        )}

        {/* First-visit intro — sits under the search bar until dismissed or
            the first real pin lands. Owner-only. */}
        {/* An empty map always has a door, not only on the first visit: a
            journey with nothing on it yet showed "Filter" and no words
            (new-journey audit, Sep 2026). The long intro is first-visit only. */}
        {!hasRealPins && !readOnly && hasToken && (
          <div
            className="absolute top-16 left-1/2 -translate-x-1/2 z-30 w-[min(340px,calc(100%-32px))] bg-white rounded-2xl shadow-sheet border border-gray-100 px-5 py-4"
          >
            <p className="text-[14px] font-semibold text-gray-900">{showHint ? "Start your map" : "Nothing on the map yet"}</p>
            <p className="text-[13px] text-gray-500 leading-[1.55] mt-1">
              {showHint ? (
                <>
                  Search for any place you&rsquo;re curious about — a restaurant, a
                  museum, your hotel. Save it and it becomes a pin. If you already
                  know when you&rsquo;re going, pick a day in the same step — otherwise
                  leave it on the map and sort it into a day later.
                </>
              ) : (
                <>Search above for a place and save it — it lands here as a pin.</>
              )}
            </p>
            {showHint && (
              <button
                onClick={dismissIntro}
                className="mt-3 text-[13px] font-semibold text-[#B0541F]"
              >
                Got it
              </button>
            )}
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
        {/* Where to stay — the half sheet; the pins are drawn above. */}
        {showStays && !readOnly && (
          <WhereToStaySheet
            panel={isDesktop}
            trip={trip}
            placesCount={cards.filter((c) => c.place?.lat != null && c.place?.lng != null).length}
            focusedId={focusedStay?.id ?? null}
            onFocus={setFocusedStay}
            onCandidates={setStayCands}
            onChanged={() => router.refresh()}
            onClose={closeStays}
          />
        )}

        {pendingPlace && (
          <AddToTripSheet
            place={pendingPlace}
            tripId={trip.id}
            days={days}
            onClose={handleAddToTripClose}
            onCardCreated={handlePlaceCardCreated}
          />
        )}

        {/* Bookings — hidden file input, parse preview, the documents sheet. */}
        {!readOnly && (
          <input
            ref={importInputRef}
            type="file"
            accept="application/pdf,image/*,.eml,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportFile(f);
              e.currentTarget.value = "";
            }}
          />
        )}
        {pendingConf && (
          <ConfirmationPreviewSheet
            items={pendingConf.items}
            fileName={pendingConf.fileName}
            fileType={pendingConf.fileType}
            days={days.map((d) => ({ ...d, cards: [] }))}
            tripId={trip.id}
            onClose={() => setPendingConf(null)}
            onCardsCreated={(created) => {
              for (const c of created) registerNewCard(c);
              setPendingConf(null);
            }}
          />
        )}
        {showDocs && (
          <DocumentsSheet tripId={trip.id} onClose={() => setShowDocs(false)} onImport={readOnly ? undefined : () => { setShowDocs(false); importInputRef.current?.click(); }} />
        )}
        {(importingConf || importError) && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-full bg-[#1A1A2E] text-white text-[12.5px] shadow-lg">
            {importError ?? "Reading your booking…"}
          </div>
        )}

      </div>
    </div>
  );
}
