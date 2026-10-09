"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { stackOrder, restack } from "@/lib/map/pinStack";
import { dayChip, spansMonths } from "@/lib/dayChip";
import { startZoomFor } from "@/lib/places/regions";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { dayPinNumbers, pinOpacity, stayPlaceFor } from "@/lib/map/dayFocus";
import { layoutPins, twinsToHide, type LayoutPin } from "@/lib/map/pinLayout";
import { useRouter, useSearchParams } from "next/navigation";
import MapPinPopup from "./MapPinPopup";
import { popupPanY } from "@/lib/map/popupRoom";
import { savedCardForPlace, savedPlaceIds } from "@/lib/map/savedPlace";
import { SIDEBAR_SUB_TYPES, GROUPS } from "./MapSidebar";
import PlaceSearch from "./PlaceSearch";
import { lookupPlace, TEMP_PIN_SVG } from "./lookupPlace";
import AddToTripSheet from "./AddToTripSheet";
import WhereToStaySheet from "./WhereToStaySheet";
import type { PlaceResult } from "./AddToTripSheet";
import type { Trip, Day, Card, CardType, StayCandidate } from "@/types/database";
import { makeMaterialPinElement, makePinElement } from "@/lib/mapPins";
import { Funnel, Heart, Files, List } from "@phosphor-icons/react";
import { useBookingUpload } from "@/components/trip/useBookingUpload";
import DocumentsSheet from "@/components/plan/DocumentsSheet";
import AppMenu from "@/components/ui/AppMenu";
import JourneyHeader, { HEADER_GLYPH } from "@/components/ui/JourneyHeader";
import Link from "next/link";

// A glyph-only control over the map is a 36px white disc, the same as the
// zoom stack and the day map's map disc. Back and the menu are discs at the
// top corners since 24 Sep 2026 (the ribbon that said "Tuscany" is gone: the
// map already says it). Phone only; the desktop keeps its masthead.
const MAP_DISC = "md:hidden absolute z-[65] w-9 h-9 rounded-full bg-white flex items-center justify-center active:opacity-70 text-[#1A1A2E]";
const MAP_DISC_STYLE = { boxShadow: "0 1px 4px rgba(0,0,0,0.2)" } as const;
import { useGlobalSearch } from "@/components/search/GlobalSearch";
import { useToast } from "@/components/ui/Toast";
import { queuedInsert, queuedDelete } from "@/lib/offline/queuedWrite";
import { takenOffMapToast } from "@/lib/takenOff";
import { createClient } from "@/lib/supabase/client";
import { scheduleCardOnDay } from "@/lib/scheduleCard";
import { planPutOnDay, singlePutLine, alreadyLine, batchPutLine } from "@/lib/map/putOnDay";
import { legLines } from "@/lib/travel/leg";
import { drawLegs, legStarts } from "@/lib/map/legLayer";
import { tapFilter } from "@/lib/map/tapFilter";
import { pulseAt, showAt } from "@/lib/map/pulse";
import { boxCentre, stayGlide } from "@/lib/map/glide";
import dynamic from "next/dynamic";
import { reloadOnStale } from "@/lib/chunkReload";
import { useWarmFind } from "@/hooks/useWarmFind";
import { useFreshPush } from "@/hooks/useFreshPush";
import { firstPlaceLine, PIN_TO_DAY } from "@/lib/map/firstPlace";
import { onlyOnLine } from "@/lib/plan/eventDays";
// Loaded when first opened, not with the map (29 Sep 2026).
const PlanMyTripSheet = dynamic(reloadOnStale(() => import("@/components/plan/PlanMyTripSheet")), { ssr: false });
const FindSheet = dynamic(reloadOnStale(() => import("@/components/plan/FindSheet")), { ssr: false });

// Purple circular pin for search result previews

interface Props {
  trip: Trip;
  days: Day[];
  cards: Card[];
  userAvatarUrl?: string | null;
  /** Guest view — no place search/add, no pin editing/delete, no sidebar. */
  readOnly?: boolean;
  /** Phone, inside the day page (8 Oct 2026, docs/phone-map-one-page-spec.html):
   *  the map grows in place under the day's own header and days. No back or
   *  menu disc (the day's header has both); a list disc closes it. With a day
   *  chosen, that day's stops are numbered as the list numbers them and every
   *  other pin is muted; null shows the whole trip. */
  embedded?: { focusDayId: string | null; onClose: () => void };
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

/** The map's bottom chips (Filter, Plan my trip, Find places), 28px drawn and
 *  44 to the finger (6 Oct 2026, taps audit): 4px each side (half the 8px
 *  gap), only 4px up (Filter's open pill rows sit 8px above), 12px down into
 *  the space under the row — which is also the gap above Find's half sheet. */
const CHIP_TARGET = "absolute -inset-x-1 -top-1 -bottom-3";

// userAvatarUrl stays in Props for the page that passes it; the avatar disc
// it fed left with the one header (consistency sweep, Sep 2026).
export default function FullMapClient({ trip, days, cards, readOnly = false, embedded }: Props) {
  const focusDayId = embedded ? embedded.focusDayId : null;
  const focusDayRef = useRef(focusDayId);
  focusDayRef.current = focusDayId;
  const [planOpen, setPlanOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  // Find's phone half sheet raised to 88dvh (FindSheet onTall): the bottom row steps aside.
  const [findTall, setFindTall] = useState(false);
  const findPinRef = useRef<{ remove: () => void } | null>(null);
  // Find, searched ahead in the background so it opens with its answers (hooks/useWarmFind).
  useWarmFind(trip, cards, !readOnly);
  // Also shown while Plan my trip's cards are still where it put them: the sheet can take them off.
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
  // that lands with a real place becomes a pin here at once. The shared
  // upload (useBookingUpload, 6 Oct 2026 taps audit): several files in one
  // pick, one check-and-add sheet, the toast with Undo — and Undo takes the
  // pins off again.
  const upload = useBookingUpload({
    tripId: trip.id,
    days,
    onAdded: (created, deletedIds) => {
      if (deletedIds.length) {
        const gone = new Set(deletedIds);
        for (const id of deletedIds) { const m = MARKERS.get(id); if (m) { m.marker.remove(); MARKERS.delete(id); } }
        setLocalCards((prev) => prev.filter((c) => !gone.has(c.id)));
      }
      for (const c of created) registerNewCardRef.current(c);
    },
  });
  const [showDocs, setShowDocs] = useState(false);

  // ── Where to stay ──────────────────────────────────────────────────
  // Opens from the menu row (…/map?stays=1). Candidates are lettered pins
  // drawn beside the journey's own; the sheet below lists them. Tap a pin
  // and the row scrolls to it; tap a row and the map flies to the pin.
  const router = useRouter();
  // Onto a day after a write: refresh first, open the day once this page's
  // cards are back, so the router cannot serve the day from before (hooks/useFreshPush).
  const freshPush = useFreshPush(cards);
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
  /** The candidate set the map has already framed, so a gesture is never undone. */
  const fittedRef = useRef<string>("");
  const stayMarkersRef = useRef<{ remove: () => void }[]>([]);
  useEffect(() => {
    if (searchParams.get("stays") === "1" && !readOnly) setShowStays(true);
    // A new journey's "Find places" on the phone's day (StartHere) lands here with Find open.
    if (searchParams.get("find") === "1" && !readOnly) setFindOpen(true);
  }, [searchParams, readOnly]);
  // ?pin=<card id> — a place just shared in from TikTok or Instagram. Fly to
  // it and open its card, which carries Put on a day. Once per id, and after
  // the first frame has framed the journey, so the fit doesn't undo the fly.
  const pinParam = searchParams.get("pin");
  const openedPinRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mapReady || !pinParam || openedPinRef.current === pinParam) return;
    const card = localCards.find((c) => c.id === pinParam);
    if (!card?.place || card.place.lat == null || card.place.lng == null) return;
    openedPinRef.current = pinParam;
    const t = setTimeout(() => handleSidebarCardSelect(card), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, pinParam, localCards]);
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
    // Frame the candidates ONCE per set, never on every pass through this
    // effect. Re-fitting on each render snapped the view back mid-gesture, so
    // the map could not be pinched or zoomed while the sheet was open
    // (Brennan, 10 Sept 2026). A different five re-frames; the same five do not.
    const key = stayCands.map((c) => c.id).join(",");
    if (coords.length > 1 && !focusedStay && fittedRef.current !== key) {
      fittedRef.current = key;
      const bounds = coords.reduce(
        (b: unknown, coord) => (b as { extend: (c: [number, number]) => unknown }).extend(coord),
        new mb.LngLatBounds(coords[0], coords[0]),
      );
      map.fitBounds(bounds, { padding: { top: 80, bottom: 80, left: 40, right: 40 }, maxZoom: 13, ...stayGlide(map.getCenter(), boxCentre(coords)) });
    }
  }, [showStays, stayCands, focusedStay, mapReady]);
  useEffect(() => {
    const map = mapInstRef.current;
    if (!map || !focusedStay || focusedStay.lat == null || focusedStay.lng == null) return;
    // A capped, eased glide however far (lib/map/glide): Osaka to Tokyo took ~5 s.
    const to = { lng: focusedStay.lng, lat: focusedStay.lat };
    const g = stayGlide(map.getCenter(), to);
    const move = { center: [to.lng, to.lat] as [number, number], zoom: Math.max(map.getZoom(), 12), duration: g.duration };
    if (g.linear) map.easeTo(move); else map.flyTo(move);
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
  const mapMenuExtra = [
    { key: "bookings", title: "Bookings", sub: "", icon: <Files size={15} weight="light" />, onClick: () => setShowDocs(true) },
  ];
  // registerNewCard is declared below as a plain function; the delete
  // handler is memoised, so it reaches the current one through a ref.
  const registerNewCardRef = useRef<(card: Card) => void>(() => {});
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
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
  // Picking several pins (25 Sep 2026): long-press a pin (or "Pick more pins
  // first" in a pin card) turns pick mode on; taps then toggle; the rest fade;
  // a tray above the Filter offers the days; ✕ or an empty-map tap leaves.
  // Mock: https://claude.ai/artifact/YZAUNZQhqBBwpmWweLPeeV
  const [pickMode, setPickMode] = useState(false);
  const [pickedIds, setPickedIds] = useState<Set<string>>(() => new Set());
  const pickModeRef = useRef(false);
  const longPressedRef = useRef(false);
  const supabaseRef = useRef(createClient());
  const enterPick = useCallback((cardId: string) => {
    pickModeRef.current = true; setPickMode(true);
    setPickedIds((prev) => { const next = new Set(prev); next.add(cardId); return next; });
    try { navigator.vibrate?.(30); } catch { /* not every phone */ }
  }, []);
  const leavePick = useCallback(() => { pickModeRef.current = false; setPickMode(false); setPickedIds(new Set()); }, []);
  const togglePick = useCallback((cardId: string) => {
    setPickedIds((prev) => { const next = new Set(prev); if (next.has(cardId)) next.delete(cardId); else next.add(cardId); return next; });
  }, []);
  /** Long-press → pick; the click that follows a long-press is swallowed. */
  const attachLongPress = useCallback((el: HTMLElement, cardRef: { current: Card }) => {
    let timer: number | null = null; let x0 = 0, y0 = 0;
    const clear = () => { if (timer !== null) { window.clearTimeout(timer); timer = null; } };
    el.addEventListener("pointerdown", (e) => {
      if (readOnly) return;
      x0 = e.clientX; y0 = e.clientY; longPressedRef.current = false;
      timer = window.setTimeout(() => { timer = null; longPressedRef.current = true; enterPick(cardRef.current.id); }, 500);
    });
    el.addEventListener("pointermove", (e) => { if (Math.abs(e.clientX - x0) > 8 || Math.abs(e.clientY - y0) > 8) clear(); });
    el.addEventListener("pointerup", clear);
    el.addEventListener("pointercancel", clear);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }, [enterPick, readOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  // The chosen day's stops, numbered as the day's list numbers them (lib/map/dayFocus).
  const dayNumbers = useMemo(() => dayPinNumbers(localCards, focusDayId), [localCards, focusDayId]);
  // …and that night's stay, starred and full strength like the strip's hotel
  // (8 Oct 2026, Brennan). One pin for it: today's own card of the hotel when
  // it is a stop, else the first; its other cards (check-out) step aside.
  const stay = useMemo(() => {
    const placeId = stayPlaceFor(localCards, days, trip.end_date, focusDayId);
    const at = placeId ? localCards.filter((c) => c.place_id === placeId && isRealPlace(c)) : [];
    const pick = at.find((c) => dayNumbers.has(c.id)) ?? at[0];
    return { id: pick?.id ?? null, others: new Set(at.filter((c) => c !== pick).map((c) => c.id)) };
  }, [localCards, days, trip.end_date, focusDayId, dayNumbers]);
  const stayRef = useRef(stay);
  stayRef.current = stay;
  // rings and fades follow the picked set; with a day chosen (the day page's
  // map) its stops carry their number and every other pin is muted.
  useEffect(() => {
    MARKERS.forEach(({ marker }, id) => {
      const el = marker.getElement() as HTMLElement;
      const inner = el.children[0] as HTMLElement | undefined; if (!inner) return;
      const on = pickedIds.has(id);
      inner.style.boxShadow = on ? "0 0 0 3px #fff, 0 0 0 5px #1A1A2E" : "";
      const dayOp = id === stay.id ? 1 : pinOpacity(id, dayNumbers, focusDayId);
      inner.style.opacity = pickMode && pickedIds.size > 0 && !on ? "0.35" : dayOp < 1 ? String(dayOp) : "";
      if (on) inner.style.transform = "scale(1.25)"; else if (inner.dataset.selected !== "1") inner.style.transform = "";
      const n = dayNumbers.get(id);
      let tag = el.querySelector<HTMLElement>("[data-day-number]");
      if (n) {
        if (!tag) {
          tag = document.createElement("span");
          tag.dataset.dayNumber = "";
          // The day strip's number tag (components/day/DayMap), so the two maps read alike.
          tag.style.cssText =
            "position:absolute;top:-7px;right:-8px;min-width:18px;height:18px;border-radius:9px;" +
            "background:white;border:1.5px solid rgba(26,26,46,0.35);" +
            "font-family:'DM Sans',Inter,system-ui,sans-serif;font-size:11px;font-weight:700;" +
            "color:#1A1A2E;display:flex;align-items:center;justify-content:center;" +
            "padding:0 4px;line-height:1;pointer-events:none;z-index:1;white-space:nowrap;";
          el.style.overflow = "visible";
          el.appendChild(tag);
        }
        tag.textContent = String(n);
        el.style.zIndex = "3";
      } else {
        tag?.remove();
        el.style.zIndex = id === stay.id ? "3" : "";
      }
      // The night's stay wears the strip's gold star (components/day/DayMap).
      let star = el.querySelector<HTMLElement>("[data-stay-star]");
      if (id === stay.id) {
        if (!star) {
          star = document.createElement("span");
          star.dataset.stayStar = "";
          star.style.cssText =
            "position:absolute;bottom:-3px;right:-3px;width:13px;height:13px;border-radius:50%;background:white;" +
            "display:flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(0,0,0,0.25);" +
            "font-size:8px;line-height:1;color:#F5A623;pointer-events:none;z-index:2;";
          star.textContent = "★";
          el.style.overflow = "visible";
          el.appendChild(star);
        }
      } else star?.remove();
    });
    layoutRef.current();
  }, [pickMode, pickedIds, dayNumbers, focusDayId, mapReady, stay]);

  // The day page's map frames the chosen day, or the whole trip when none is
  // chosen; a later change of day glides there. Once per change, so a pinch is never undone.
  const fittedDayRef = useRef<string | null | undefined>(undefined);
  const isEmbedded = !!embedded;
  useEffect(() => {
    const map = mapInstRef.current;
    const mb = mbRef.current;
    if (!isEmbedded || !mapReady || !map || !mb || fittedDayRef.current === focusDayId) return;
    const first = fittedDayRef.current === undefined;
    fittedDayRef.current = focusDayId;
    const shown = focusDayId ? localCards.filter((c) => dayNumbers.has(c.id) || c.id === stay.id) : localCards.filter(isRealPlace);
    const coords = shown.map((c) => [c.place!.lng!, c.place!.lat!] as [number, number]);
    if (coords.length === 0) return;
    if (coords.length === 1) {
      if (first) map.jumpTo({ center: coords[0], zoom: 15 }); else map.easeTo({ center: coords[0], zoom: 15, duration: 700 });
      return;
    }
    const bounds = coords.reduce(
      (b: unknown, coord) => (b as { extend: (c: [number, number]) => unknown }).extend(coord),
      new mb.LngLatBounds(coords[0], coords[0]),
    );
    // Clear of what floats on the map: the search row on top, Filter row below,
    // zoom and locate down the right (8 Oct 2026: Sunday's hotel sat under the zoom).
    map.fitBounds(bounds, { padding: { top: 92, bottom: 96, left: 56, right: 72 }, maxZoom: focusDayId ? 15 : 13, animate: !first, duration: 700 });
  }, [isEmbedded, mapReady, focusDayId, dayNumbers, localCards, stay]);

  // ── The day page's pin layout (lib/map/pinLayout, 8 Oct 2026) ──────────
  // Two or three touching pins sit side by side, the day's stops only with
  // each other. Nothing is merged into one pin (Brennan, 8 Oct 2026: "I just
  // don't want it to be clustered").
  // The Map screen itself is unchanged. Re-laid after every move.
  const dayNumbersRef = useRef(dayNumbers);
  dayNumbersRef.current = dayNumbers;
  const layoutRef = useRef<() => void>(() => {});
  layoutRef.current = () => {
    const map = mapInstRef.current;
    const mb = mbRef.current;
    if (!map || !mb) return;
    const shown: LayoutPin[] = [];
    // One pin per place: a saved place later put on a day has two cards at one spot (lib/map/pinLayout twinsToHide).
    const twins = embedded ? twinsToHide(Array.from(MARKERS.values()).map((m) => m.cardRef.current), (cid) => dayNumbersRef.current.has(cid) || cid === stayRef.current.id) : new Set<string>();
    MARKERS.forEach(({ marker, cardRef }, id) => {
      marker.setOffset([0, 0]);
      const el = marker.getElement() as HTMLElement;
      el.style.visibility = "";
      const c = cardRef.current;
      if (!embedded || !el.isConnected || !c.place) return;
      if (twins.has(id) || stayRef.current.others.has(id)) { el.style.visibility = "hidden"; return; }
      const p = map.project([c.place.lng!, c.place.lat!]) as { x: number; y: number };
      shown.push({ id, x: p.x, y: p.y, day: dayNumbersRef.current.has(id) || id === stayRef.current.id, type: c.place.type });
    });
    if (!embedded) return;
    const layout = layoutPins(shown, 32);
    layout.offsets.forEach((o, id) => MARKERS.get(id)?.marker.setOffset(o));
  };
  useEffect(() => {
    const map = mapInstRef.current;
    if (!map || !mapReady || !isEmbedded) return;
    const run = () => layoutRef.current();
    map.on("moveend", run);
    run();
    return () => { map.off("moveend", run); };
  }, [mapReady, isEmbedded, dayNumbers]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tempPinRef = useRef<any>(null);

  const hasToken = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

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

  // One stacking order whatever was toggled last (lib/map/pinStack): Mapbox
  // puts a pin that comes back on top of everything.
  const restackAll = useCallback(() => {
    const all = Array.from(MARKERS.values()).map((m) => ({ status: m.cardRef.current.status, el: m.marker.getElement() }));
    restack(stackOrder(all).map((m) => m.el));
  }, []);

  /** Does the filter show this card's pin? Type, sub-type, status and "loved". Reads the refs,
   *  so the memoised callers below see the current filters. A travel leg's line follows its pin. */
  const cardShown = (card: Card): boolean => {
    const place = card.place;
    if (!place) return false;
    const sub = place.sub_type;
    const subTypeOk = !sub || !CONTROLLED_SUB_TYPES.has(sub) || activeSubTypesRef.current.has(sub);
    const statusOk = activeStatusesRef.current.has(card.status ?? "");
    const lovedOk  = !lovedOnlyRef.current || place.loved === true;
    return activeTypesRef.current.has(place.type) && subTypeOk && statusOk && lovedOk;
  };

  // ── Sync all marker visibility against type + sub-type + status toggles ─
  const syncVisibility = useCallback(() => {
    const map = mapInstRef.current;
    if (!map) return;
    MARKERS.forEach(({ marker, cardRef }) => {
      if (cardShown(cardRef.current)) marker.addTo(map); else marker.remove();
    });
    restackAll();
    layoutRef.current();
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

  /**
   * A tap on a filter pill NARROWS to that kind. Brennan, 10 Sept 2026:
   * "if you press Food it doesn't just show you everything food-related, it
   * just takes food off the map, which I always thought was weird." So:
   * everything showing → tap Food → only food; tap Activity as well → both;
   * tap the last one still selected → back to everything. Removing one of
   * several still works, it is just no longer what the first tap means.
   *
   * The sheet this replaced (a 42dvh panel with sub-types and counts) was
   * built and reverted the same morning: the pills cost no space and
   * sub-type filtering is desk work. Do not rebuild it without him asking.
   */
  const ALL_FILTER_TYPES: CardType[] = ["activity", "food", "logistics"];
  const ALL_FILTER_STATUSES = ["interested", "in_itinerary"];
  const filterNarrowed =
    (activeTypes.size < ALL_FILTER_TYPES.length ? ALL_FILTER_TYPES.length - activeTypes.size : 0) +
    (activeStatuses.size < ALL_FILTER_STATUSES.length ? ALL_FILTER_STATUSES.length - activeStatuses.size : 0) +
    (lovedOnly ? 1 : 0);

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

    if (cardShown(card)) mbMarker.addTo(map);
    // Registered below; restack once it is in MARKERS.
    queueMicrotask(() => restackAll());

    attachLongPress(mbMarker.getElement(), cardRef);
    mbMarker.getElement().addEventListener("click", (e: MouseEvent) => {
      e.stopPropagation();
      clickedPinRef.current = true;
      if (longPressedRef.current) { longPressedRef.current = false; return; }
      if (pickModeRef.current) { togglePick(cardRef.current.id); return; }
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
    // Already on the map (6 Oct 2026, taps audit): fly to that pin and open
    // its card — no add sheet, no "save it again?" question.
    const saved = savedCardForPlace(localCards.filter(isRealPlace), placeId);
    if (saved) {
      handleSidebarCardSelect(saved);
      return;
    }
    const pending = await lookupPlace(placeId, sessionToken);
    if (!pending) return;
    const { lat, lng } = pending;
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

    setPendingPlace(pending);
  }

  // Cards onto a day, timed (lib/map/putOnDay): the lasso's picked pins, and
  // since 7 Oct 2026 (taps audit) a single pin's Put on a day too. Before,
  // one pin landed with no time and a toast with no Undo. Events on set days
  // go to their own day, untimed. The lasso then opens the day (the desktop
  // narrows back to the week; the phone goes to the Agenda); "stay" (the
  // pin's card) keeps you on the map, and lets a place planned on another
  // day go on this one too. Undo deletes the new cards from wherever the
  // toast is tapped.
  const putCardsOnDay = useCallback(async (day: Day, chosen: Card[], opts: { stay?: boolean } = {}) => {
    const stay = !!opts.stay;
    const destination = trip.destination_lat != null && trip.destination_lng != null ? { lat: trip.destination_lat, lng: trip.destination_lng } : null;
    const { ownDay, batch } = planPutOnDay(chosen, day, { days, allCards: localCards, destination, single: stay });
    for (const { card: c, day: to, dates } of ownDay) {
      const made = await scheduleCardOnDay(supabaseRef.current, { tripId: trip.id, dayId: to.id, placeId: c.place_id, place: c.place, details: c.details, sourceUrl: c.source_url });
      if (made) { registerNewCardRef.current(made); toast({ message: onlyOnLine(c.place?.title ?? "It", to.date, dates) }); }
    }
    if (!stay) leavePick();
    if (chosen.length === ownDay.length) return;
    const { toAdd, times, skipped, elsewhere, unplaced } = batch;
    // One way to name a day in every toast: "Tue 25" (7 Oct 2026, re-audit).
    const dayName = dayChip(day.date, spansMonths(days.map((d) => d.date)));
    if (toAdd.length === 0) { toast({ message: alreadyLine(dayName, elsewhere > 0) }); return; }
    const created: Card[] = [];
    for (const c of toAdd) {
      const t = times.get(c.id);
      const made = await scheduleCardOnDay(supabaseRef.current, { tripId: trip.id, dayId: day.id, placeId: c.place_id, place: c.place, startTime: t?.start ?? null, endTime: t?.end ?? null, details: c.details, sourceUrl: c.source_url });
      if (made) { created.push(made); registerNewCardRef.current(made); }
    }
    if (created.length === 0) { toast({ message: stay ? "Couldn't put it on that day. Try again." : "Couldn't put them on that day. Try again." }); return; }
    const n = created.length;
    toast({
      message: stay
        ? singlePutLine(dayName, times.get(toAdd[0].id)?.start)
        : batchPutLine(n, dayName, unplaced.length, skipped, elsewhere),
      undo: async () => {
        for (const c of created) { await queuedDelete("cards", { id: c.id }); const m = MARKERS.get(c.id); if (m) { m.marker.remove(); MARKERS.delete(c.id); } }
        const ids = new Set(created.map((c) => c.id));
        setLocalCards((prev) => prev.filter((c) => !ids.has(c.id)));
      },
    });
    if (!stay) freshPush("/trips/" + trip.id + "/days/" + day.id, (now) => created.every((c) => now.some((x) => x.id === c.id)));
  }, [localCards, trip, days, leavePick, toast, freshPush]);

  // ── Travel legs (7 Oct 2026) ─────────────────────────────────
  // The day map's quiet dashed line, here too (lib/map/legLayer): a scheduled
  // leg over about an hour (lib/travel/leg shouldDrawLine), start to end, with
  // the mode at the middle. It follows its end pin through the filters, so
  // filtering transit out takes the lines off with the pins.
  const legsDrawnRef = useRef<{ remove: () => void } | null>(null);
  useEffect(() => {
    legsDrawnRef.current?.remove();
    legsDrawnRef.current = null;
    const map = mapInstRef.current, mb = mbRef.current;
    if (!map || !mb || !mapReady) return;
    legsDrawnRef.current = drawLegs(map, mb, legLines(localCards.filter((c) => !!c.day_id && c.status === "in_itinerary" && isRealPlace(c) && cardShown(c))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, localCards, activeTypes, activeSubTypes, activeStatuses, lovedOnly]);

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

  // Fresh cards from the server (router.refresh) land as pins too. localCards
  // is seeded once, so anything written elsewhere — a stay picked in Where to
  // stay, a Find save — stayed off the map until a reload (Muskoka, 3 Oct 2026).
  // Additions only: removals here already go through the map's own handlers.
  const localIdsRef = useRef<Set<string>>(new Set(cards.map((c) => c.id)));
  useEffect(() => { localIdsRef.current = new Set(localCards.map((c) => c.id)); }, [localCards]);
  useEffect(() => {
    const fresh = cards.filter((c) => !localIdsRef.current.has(c.id));
    if (!fresh.length) return;
    fresh.forEach((c) => addPinToMap(c));
    setLocalCards((prev) => [...prev, ...fresh.filter((c) => !prev.some((p) => p.id === c.id))]);
  }, [cards, addPinToMap]);

  function handlePlaceCardCreated(card: Card) {
    // Read before the new pin lands: an empty map's first place is named as
    // such (7 Oct 2026, delight audit; lib/map/firstPlace).
    const first = firstPlaceLine({ hadPlaces: hasRealPins, destination: trip.destination });
    if (tempPinRef.current) { tempPinRef.current.remove(); tempPinRef.current = null; }
    setPendingPlace(null);
    registerNewCard(card);
    // A save used to say nothing: a hollow pin appeared and the "sort it into
    // a day later" line had vanished with the first-visit card. So say what
    // happened, and where "later" is.
    const onDay = card.day_id ? days.find((d) => d.id === card.day_id) : null;
    toast({
      message: onDay
        ? `Put on ${dayChip(onDay.date, spansMonths(days.map((d) => d.date)))}`
        : first ?? `Saved to your map. ${PIN_TO_DAY}`,
    });
  }
  registerNewCardRef.current = registerNewCard;

  // ── Handle card delete from sidebar or sheet ─────────────────
  // The popup and the sidebar delete the row themselves and then call this.
  // The Map used to be the one host with no way back (UX audit, Sep 2026,
  // finding 2): the pin vanished and that was that. Same six seconds as the
  // Plan and the Agenda now — Undo re-inserts under the original id and puts
  // the pin back.
  // Taken off a day, the place stays saved, so the toast says what really
  // happened ("Removed from the map" was wrong) and Undo also takes back the
  // saved card the take-off made (6 Oct 2026, taps audit).
  const handleCardDelete = useCallback((cardId: string, takenOff?: { savedId: string | null }) => {
    const entry = MARKERS.get(cardId);
    if (entry) { entry.marker.remove(); MARKERS.delete(cardId); }
    setLocalCards((prev) => {
      const gone = prev.find((c) => c.id === cardId) ?? null;
      if (gone) {
        const offDay = takenOff ? days.find((d) => d.id === gone.day_id) : undefined;
        toast({
          message: takenOff ? takenOffMapToast(offDay?.date, spansMonths(days.map((d) => d.date))) : "Removed from the map",
          undo: async () => {
            if (takenOff?.savedId) {
              const savedId = takenOff.savedId;
              await queuedDelete("cards", { id: savedId });
              const m = MARKERS.get(savedId); if (m) { m.marker.remove(); MARKERS.delete(savedId); }
              setLocalCards((p) => p.filter((c) => c.id !== savedId));
            }
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
  }, [toast, days]); // eslint-disable-line react-hooks/exhaustive-deps

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
        // Flat, no fog (29 Sep 2026: "zoom is choppy"). Mapbox 3 draws this
        // style as a globe with fog, and every HTML pin then re-checks its
        // fog opacity as the map moves. A city map looks the same flat.
        projection: "mercator",
        center: [trip.destination_lng ?? 12.4964, trip.destination_lat ?? 41.9028],
        zoom: startZoomFor(trip.destination, 13),
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

      map.on("style.load", () => { try { map.setFog(null); } catch { /* older styles have none */ } });
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

          attachLongPress(mbMarker.getElement(), cardRef);
          mbMarker.getElement().addEventListener("click", (e: MouseEvent) => {
            e.stopPropagation();
            clickedPinRef.current = true;
            if (longPressedRef.current) { longPressedRef.current = false; return; }
            if (pickModeRef.current) { togglePick(cardRef.current.id); return; }
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
        restackAll();

        setMapReady(true);

        // Fit to all pins, and to where each drawn travel leg starts, so its
        // line is seen whole (7 Oct 2026; the day map does the same).
        const coords: [number, number][] = [
          ...mappable.map(({ lng, lat }) => [lng, lat] as [number, number]),
          ...legStarts(legLines(cards.filter((c) => !!c.day_id && c.status === "in_itinerary" && isRealPlace(c)))),
        ];
        if (coords.length > 1) {
          const bounds = coords.reduce(
            (b: unknown, coord) => (b as { extend: (c: [number, number]) => unknown }).extend(coord),
            new mb.LngLatBounds(coords[0], coords[0]),
          );
          // Opens already framed on the pins: no glide from the destination to
          // them (6 Oct 2026, Brennan + taps audit: "open on the pins"). Motion
          // is kept for going somewhere you asked to go.
          map.fitBounds(bounds, { padding: 80, maxZoom: 15, animate: false });
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
        if (pickModeRef.current) { leavePick(); return; }
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
    <div className={`flex w-full overflow-hidden ${embedded ? "h-full" : "h-dvh md:h-[calc(100dvh-64px)]"}`}>

      {/* Desktop sidebar retired (5 Oct 2026, Brennan: "why is the old legend
          there?"). The Filter below is the one control on every screen, as on
          the week's map; delete lives on the pin popup. */}

      {/* ── Map area ── */}
      <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>

        {/* Map canvas */}
        {hasToken ? (
          <div ref={mapContainerRef} className={showStays && !readOnly && !isDesktop ? "stays-open" : findOpen && !findTall ? "find-open" : undefined} style={{ position: "absolute", inset: 0, right: panelOpen ? 400 : 0 }} />
        ) : (
          <div style={{ position: "absolute", inset: 0 }} className="bg-gray-50 flex flex-col items-center justify-center gap-1">
            <p className="text-sm font-medium text-gray-500">Map unavailable</p>
            <p className="text-xs text-gray-400">Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local</p>
          </div>
        )}



        {/* Phone chrome over the map. Owner: no ribbon — back disc top-left,
            menu disc top-right, the place search between them on the same
            36px row (Brennan, 24 Sep 2026: "remove Tuscany from the top …
            you know it's the location of the trip"). Guest: the ribbon stays,
            because a guest has no place search to fill the row and keeps the
            saved-places search glyph instead. */}
        {embedded ? (
          // Inside the day page: its header already has the way back and the
          // menu. One disc, the list, closes the map back to the day.
          <button type="button" onClick={embedded.onClose} aria-label="Back to the list" className={`${MAP_DISC} right-3 top-3`} style={MAP_DISC_STYLE}>
            <span aria-hidden="true" data-testid="map-list-target" className="absolute -inset-1" />
            <List size={17} weight="light" color="#1A1A2E" />
          </button>
        ) : readOnly ? (
          <JourneyHeader
            absolute
            backHref={`/trips/${trip.id}`}
            title={trip.title}
            onSearch={() => search.open()}
            menu={
              <AppMenu
                variant="mobile"
                tripId={trip.id}
                trip={trip}
                days={days}
                guest={readOnly}
                extra={mapMenuExtra}
                triggerClassName={HEADER_GLYPH}
              />
            }
          />
        ) : (
          <>
            <Link href={`/trips/${trip.id}`} aria-label="Back" className={`${MAP_DISC} left-3 top-3`} style={MAP_DISC_STYLE}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </Link>
            <div className={`${MAP_DISC} right-3 top-3`} style={MAP_DISC_STYLE}>
              <AppMenu
                variant="mobile"
                tripId={trip.id}
                trip={trip}
                days={days}
                guest={readOnly}
                extra={mapMenuExtra}
                triggerClassName="w-9 h-9 flex items-center justify-center"
              />
            </div>
          </>
        )}

        {/* The pick tray, above the Filter. At every width: it was phone-only,
            but "Pick more" and a long press start picking on a computer too,
            which left chosen pins with nowhere to put them (6 Oct 2026, taps audit). */}
        {pickMode && pickedIds.size > 0 && !readOnly && (
          <div data-testid="pick-tray" className="absolute left-3 right-3 z-[66] bg-white rounded-2xl p-3" style={{ bottom: "calc(64px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 8px 24px rgba(26,26,46,0.18)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-semibold">{pickedIds.size} {pickedIds.size === 1 ? "place" : "places"} on</span>
              <button onClick={leavePick} aria-label="Stop picking" className="relative w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                {/* 44 wide into the tray's padding, only 4px down: the day chips are 8px below (6 Oct 2026, taps audit). */}
                <span aria-hidden="true" data-testid="pick-close-target" className="absolute -inset-x-2 -top-2 -bottom-1" />
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1A1A2E" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
              {days.map((d) => {
                const dt = new Date(d.date + "T00:00:00");
                return (
                  <button key={d.id} onClick={() => void putCardsOnDay(d, localCards.filter((c) => pickedIds.has(c.id)))} className="h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap active:bg-[#1A1A2E] active:text-white" style={{ background: "rgba(26,26,46,0.06)" }}>
                    {dt.toLocaleDateString("en-GB", { weekday: "short" })} {dt.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Place search — the add-a-place entry; owner only */}
        {!readOnly && (
          <PlaceSearch onPlaceSelect={handlePlaceSelect} destination={trip.destination} lat={trip.destination_lat} lng={trip.destination_lng} savedPlaceIds={savedPlaceIds(localCards.filter(isRealPlace))} positionClassName={embedded ? "absolute top-3 left-3 right-[60px]" : undefined} />
        )}

        {/* Filter button + pill bar — bottom-left, expands upward. View-only
            (toggles pin visibility, mutates nothing). Mobile-only for owners
            (desktop owners use the sidebar); shown on desktop too for guests,
            since their sidebar is suppressed. */}
        <div
          className="absolute left-3 flex flex-col gap-2"
          // The toast stands above this row and its open pills, never on them
          // (7 Oct 2026: removing a pin with Find or the Filter open put
          // "Removed from the map · Undo" over the row; ui/Toast toastClearTop).
          data-toast-clear=""
          // The bar that used to sit under this is gone (24 Sep 2026); clear the
          // phone's home indicator instead. With Find's half sheet up (50dvh,
          // z-70) the row rides just above it; it sat underneath for as long as
          // Find was open, and its ✕ scrolls away (2 Oct 2026, Brennan: "I can't
          // see buttons ... at the bottom. They just basically disappeared").
          // Raised to 88dvh the sheet is for reading, and the row steps aside.
          style={{
            zIndex: 10,
            bottom: findOpen ? "calc(50dvh + 12px)" : "calc(16px + env(safe-area-inset-bottom, 0px))",
            ...(findOpen && findTall ? { display: "none" } : null),
          }}
        >
          {/* Pill rows — rendered above the button (flex-col, first child = top) */}
          {filterOpen && (
            <div className="flex flex-col gap-2 animate-in fade-in duration-200">
              {/* Row 0 — the phone sub-type row (25 Sep 2026): once ONE category
                  is chosen, its rows as pills with counts, the type pills' rule
                  (tap = only that, again = all). Drives activeSubTypes, the same
                  set the desktop sidebar drives. */}
              {activeTypes.size === 1 && (() => {
                const only = Array.from(activeTypes)[0];
                const group = GROUPS.find((g) => g.typeKey === only);
                if (!group) return null;
                const rows = group.rows.map((r) => ({
                  ...r,
                  n: localCards.filter((c) => c.place && r.subTypes.includes(c.place.sub_type ?? "") && activeStatuses.has(c.status ?? "") && (!lovedOnly || c.place.loved === true)).length,
                  on: r.subTypes.every((st) => activeSubTypes.has(st)),
                })).filter((r) => r.n > 0);
                if (rows.length === 0) return null;
                const allOn = rows.every((r) => r.on);
                const tap = (label: string) => {
                  const next = new Set(activeSubTypes);
                  const onlyThis = rows.filter((r) => r.on).length === 1 && rows.find((r) => r.label === label)?.on;
                  rows.forEach((r) => {
                    const want = allOn ? r.label === label : onlyThis ? true : r.label === label ? !r.on : r.on;
                    r.subTypes.forEach((st) => { if (want) next.add(st); else next.delete(st); });
                  });
                  handleSubTypesChange(next);
                };
                return (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {rows.map((r) => {
                      const chosen = r.on && !allOn;
                      return (
                        <button key={r.label} onClick={() => tap(r.label)} className="px-2.5 py-1 rounded-full text-[11.5px] font-medium transition-all duration-200" style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", background: chosen ? "#1A1A2E" : r.on ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)", color: chosen ? "#FFFFFF" : r.on ? "#374151" : "#9CA3AF" }}>
                          {r.label} <span style={{ opacity: 0.55 }}>{r.n}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
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
                  const chosen = active && activeTypes.size < ALL_FILTER_TYPES.length;
                  return (
                    <button
                      key={typeKey}
                      onClick={() => handleActiveTypesChange(tapFilter(activeTypes, ALL_FILTER_TYPES, typeKey))}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
                      style={{
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                        background: chosen ? "#1A1A2E" : active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)",
                        color: chosen ? "#FFFFFF" : active ? "#374151" : "#9CA3AF",
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-opacity duration-200"
                        style={{ background: chosen ? "#FFFFFF" : color, opacity: active ? 1 : 0.3 }}
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
                    { status: "interested",   label: "Saved"    },
                    { status: "in_itinerary", label: "Scheduled" },
                  ] as { status: string; label: string }[]
                ).map(({ status, label }) => {
                  const active = activeStatuses.has(status);
                  const chosen = active && activeStatuses.size < ALL_FILTER_STATUSES.length;
                  return (
                    <button
                      key={status}
                      onClick={() => handleActiveStatusesChange(tapFilter(activeStatuses, ALL_FILTER_STATUSES, status))}
                      className="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
                      style={{
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                        background: chosen ? "#1A1A2E" : active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)",
                        color: chosen ? "#FFFFFF" : active ? "#374151" : "#9CA3AF",
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
                    color: lovedOnly ? "#B0541F" : "#9CA3AF",
                  }}
                >
                  <Heart size={11} weight={lovedOnly ? "fill" : "light"} color={lovedOnly ? "#B0541F" : "#9CA3AF"} />
                  Loved
                </button>
              </div>
              )}
            </div>
          )}

          {/* Filter button — always at bottom of the stack; Plan my trip
              beside it while saved places are off the days (28 Sep 2026). */}
          <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className="relative self-start flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-200"
            style={{
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              background: filterOpen ? "#1A1A2E" : "rgba(255,255,255,0.9)",
              color: filterOpen ? "#FFFFFF" : "#374151",
            }}
          >
            <span aria-hidden="true" data-testid="filter-target" className={CHIP_TARGET} />
            <Funnel size={13} weight="light" color={filterOpen ? "#FFFFFF" : "#374151"} />
            {filterOpen ? "Done" : "Filter"}
            {!filterOpen && filterNarrowed > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold"
                style={{ background: "#B0541F", color: "#FFFFFF" }}
              >
                {filterNarrowed}
              </span>
            )}
          </button>
          {/* On every trip (1 Oct 2026); the sheet explains a full or empty one. */}
          {!readOnly && !filterOpen && (
            <button
              // From above Find's half sheet too: Find closes, so the two sheets never stack.
              onClick={() => { setFindOpen(false); setFindTall(false); setPlanOpen(true); }}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", background: "rgba(255,255,255,0.9)", color: "#1A1A2E" }}
            >
              <span aria-hidden="true" className={CHIP_TARGET} />
              Plan my trip
            </button>
          )}
          {/* Not while Find is the open sheet: one door, not two. */}
          {!readOnly && !filterOpen && !findOpen && (
            <button
              onClick={() => setFindOpen(true)}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", background: "rgba(255,255,255,0.9)", color: "#1A1A2E" }}
            >
              <span aria-hidden="true" className={CHIP_TARGET} />
              Find places
            </button>
          )}
          </div>
        </div>
        {findOpen && (
          <FindSheet trip={trip} days={days} cards={cards} hadPlaces={hasRealPins} onClose={() => {
              setFindOpen(false); setFindTall(false);
              // Android Chrome scrolls the page to make room for the keyboard
              // when Find's search is typed in, and leaves it there: the header
              // (back, search, ⋯) sat off the top with a white band below the
              // map (3 Oct 2026). The map is a full-screen page; put it back.
              if (typeof window !== "undefined" && window.scrollY !== 0) window.scrollTo(0, 0);
            }}
            onTall={setFindTall}
            // The place open in Find, as a purple pin above the sheet (lib/map/pulse).
            onFocus={(r) => {
              findPinRef.current?.remove(); findPinRef.current = null;
              if (r && Number.isFinite(r.lat) && Number.isFinite(r.lng)) findPinRef.current = showAt(mbRef.current, mapInstRef.current, r.lng, r.lat, document.querySelector('[role="dialog"][aria-label="Find places"]'), r.title ?? r.name);
            }}
            onSaved={(c) => {
              findPinRef.current?.remove(); findPinRef.current = null;
              // The pin lands now: localCards is seeded once from the server and
              // ignores router.refresh, so a Find save only showed after a reload
              // (his Hanoi trip, 2 Oct 2026). Same path as the map's own search.
              if (!localCards.some((x) => x.id === c.id)) registerNewCard(c);
              router.refresh();
              // The half sheet leaves the top of the map showing; the new pin is ringed there (lib/map/pulse).
              if (c.place?.lng != null && c.place?.lat != null) pulseAt(mbRef.current, mapInstRef.current, c.place.lng, c.place.lat, document.querySelector('[role="dialog"][aria-label="Find places"]'));
            }} />
        )}
        {planOpen && (
          <PlanMyTripSheet
            trip={trip}
            days={days}
            cards={cards}
            onClose={() => setPlanOpen(false)}
            onDrafted={(created) => {
              // The draft is read on the day: go to its first day.
              const order = new Map(days.map((d) => [d.id, d.day_number]));
              const first = [...created].sort((a, b) => (order.get(a.day_id) ?? 0) - (order.get(b.day_id) ?? 0))[0];
              // Not a bare push: the day may be in the router's cache from a few
              // seconds ago, without these cards (2 Oct 2026, Romania day 1).
              if (first) freshPush(`/trips/${trip.id}/days/${first.day_id}`, (now) => created.every((c) => now.some((x) => x.id === c.id)));
            }}
          />
        )}



        {/* An empty map always has a door: a journey with nothing on it yet
            showed "Filter" and no words (new-journey audit, Sep 2026). The
            45-word first-visit "Start your map" intro and its "Got it" went
            (6 Oct 2026, delight audit): the one line says it. */}
        {/* Not while Find is open: its sheet already says what to do, and the
            card covered the map the pin is meant to land on (2 Oct 2026). */}
        {!hasRealPins && !readOnly && hasToken && !findOpen && (
          <div
            className="absolute top-16 left-1/2 -translate-x-1/2 z-30 w-[min(340px,calc(100%-32px))] bg-white rounded-2xl shadow-sheet border border-gray-100 px-5 py-4"
          >
            <p className="text-[14px] font-semibold text-gray-900">Nothing on the map yet</p>
            <p className="text-[13px] text-gray-500 leading-[1.55] mt-1">
              Tap Find places below, or search above. Whatever you save lands here as a pin.
            </p>
          </div>
        )}

        {/* Pin meanings (hollow = idea, filled = scheduled) are taught by the
            guide; no persistent legend on the map. */}

        {/* Pin-anchored popup */}
        {selectedCard && (
          <MapPinPopup
            card={selectedCard}
            anchorPos={anchorPos}
            onPlaced={(h) => {
              const map = mapInstRef.current, el = mapContainerRef.current;
              if (!map || !el || !anchorPos) return;
              const r = el.getBoundingClientRect();
              const dy = popupPanY(h, anchorPos.y, Math.max(r.top, 0), r.bottom);
              if (dy > 0) map.panBy([0, -dy], { duration: 300 });
            }}
            onClose={() => { deselectPin(); setSelectedCard(null); }}
            onCardUpdate={readOnly ? undefined : handleCardUpdate}
            onCardDelete={readOnly ? undefined : (cardId, takenOff) => { deselectPin(); handleCardDelete(cardId, takenOff); }}
            onCardCreated={readOnly ? undefined : (created) => { deselectPin(); registerNewCard(created); }}
            onPickMore={readOnly ? undefined : () => { const id = selectedCard!.id; deselectPin(); setSelectedCard(null); enterPick(id); }}
            onPutOnDay={readOnly ? undefined : (day) => { const c = selectedCard!; deselectPin(); setSelectedCard(null); return putCardsOnDay(day, [c], { stay: true }); }}
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

        {/* Bookings — the shared hidden picker and check-and-add sheet, the documents sheet. */}
        {!readOnly && upload.element}
        {showDocs && (
          <DocumentsSheet tripId={trip.id} onClose={() => setShowDocs(false)} onImport={readOnly ? undefined : () => { setShowDocs(false); upload.pick(); }} />
        )}
        {upload.reading && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-full bg-[#1A1A2E] text-white text-[12.5px] shadow-lg">
            {upload.readingLabel}
          </div>
        )}

      </div>
    </div>
  );
}
