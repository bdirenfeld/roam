"use client";

/**
 * The map beside the week (phase 2, 24 Sep 2026). One Mapbox map, every card
 * on the journey as a pin: filled for a card on a day, hollow for a saved one
 * (the same pins the Map tab draws). It knows three things from the week:
 * which card is hovered (its pin lifts), which day is chosen (other days'
 * pins fade), and it hands a tapped pin's card to the same MapPinPopup the
 * Map tab uses, so Put on a day, notes and the rest work unchanged. A pin
 * can also be dragged straight onto the week (the board owns that drag; the
 * map only reports the pointerdown and parks its own panning), and while a
 * block is dragged over the map the panel tints to say "drop here to take
 * it off the day".
 * Mock: https://claude.ai/artifact/Wtio2jYAqHFkA5Kmcq9CDq
 */

import { useCallback, useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Card, Day, Trip } from "@/types/database";
import { makeMaterialPinElement } from "@/lib/mapPins";
import MapPinPopup from "@/components/map/MapPinPopup";
import PlaceSearch from "@/components/map/PlaceSearch";
import AddToTripSheet, { type PlaceResult } from "@/components/map/AddToTripSheet";
import { lookupPlace } from "@/components/map/lookupPlace";
import { TEMP_PIN_SVG } from "@/components/map/lookupPlace";
import { useToast } from "@/components/ui/Toast";
import { Funnel, Heart } from "@phosphor-icons/react";
import { GROUPS } from "@/components/map/MapSidebar";
import WhereToStaySheet from "@/components/map/WhereToStaySheet";
import { makePinElement } from "@/lib/mapPins";
import type { StayCandidate } from "@/types/database";
import type { CardType } from "@/types/database";

const ALL_TYPES: CardType[] = ["activity", "food", "logistics"];
const ALL_STATUSES = ["interested", "in_itinerary"];
/** Tap a pill: alone → only it; only it → all; else toggle. The Map tab's rule. */
function tapFilter<T>(set: Set<T>, all: T[], key: T): Set<T> {
  if (set.size === all.length) return new Set([key]);
  if (set.size === 1 && set.has(key)) return new Set(all);
  const next = new Set(set); if (next.has(key)) next.delete(key); else next.add(key);
  return next.size === 0 ? new Set(all) : next;
}
const PILL = "px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200";
function pillStyle(active: boolean, chosen: boolean): React.CSSProperties {
  return { backdropFilter: "blur(8px)", background: chosen ? "#1A1A2E" : active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)", color: chosen ? "#FFFFFF" : active ? "#374151" : "#9CA3AF" };
}

interface Props {
  trip: Trip;
  days: Day[];
  /** Every card with a placed pin: scheduled ones from the days plus the saved pile. */
  cards: Card[];
  hoveredId: string | null;
  /** A day id to narrow to, or null for the whole journey. */
  activeDayId: string | null;
  onHover: (id: string | null) => void;
  onCardUpdate: (card: Card) => void;
  onCardCreated: (card: Card) => void;
  onCardDelete: (cardId: string) => void;
  /** A pin was pressed; the board may turn it into a drag onto the week. */
  onPinDragStart?: (card: Card) => void;
  /** A week block is being dragged over the map. */
  hot?: boolean;
  /** The map fills the page (the week is folded away). */
  wide?: boolean;
  onToggleWide?: () => void;
  /** Several chosen pins go onto one day, arranged (the wide map's Select). */
  onPutMany?: (cards: Card[], day: Day) => Promise<void> | void;
  /** Where to stay, as a panel on the right of this map (the Map tab's sheet). */
  showStays?: boolean;
  onCloseStays?: () => void;
  onStaysChanged?: () => void;
}

type Marker = { marker: any; wrapper: HTMLElement; inner: HTMLElement; cardRef: { current: Card } }; // eslint-disable-line @typescript-eslint/no-explicit-any

function placed(c: Card): boolean {
  return typeof c.place?.lat === "number" && typeof c.place?.lng === "number";
}

export default function WeekMap({ trip, days, cards, hoveredId, activeDayId, onHover, onCardUpdate, onCardCreated, onCardDelete, onPinDragStart, hot, wide, onToggleWide, onPutMany, showStays, onCloseStays, onStaysChanged }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const mbRef = useRef<any>(null);  // eslint-disable-line @typescript-eslint/no-explicit-any
  const markers = useRef<Map<string, Marker>>(new Map());
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<Card | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const cardsRef = useRef(cards); cardsRef.current = cards;
  const { toast } = useToast();
  // Add a place (24 Sep 2026): the Map tab's search pill and sheet, so the
  // desktop needs no Map tab. A purple temp pin marks the found place until
  // the sheet closes.
  const [pending, setPending] = useState<PlaceResult | null>(null);
  const tempPinRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  // The Map tab's filters, phone style: a Filter pill bottom-left, two rows.
  const [filterOpen, setFilterOpen] = useState(false);
  const [types, setTypes] = useState<Set<CardType>>(() => new Set(ALL_TYPES));
  const [statuses, setStatuses] = useState<Set<string>>(() => new Set(ALL_STATUSES));
  const [lovedOnly, setLovedOnly] = useState(false);
  // The sub-type row (25 Sep 2026): once ONE category is chosen, its rows
  // (Restaurant, Coffee, …) appear as pills with counts; a row switched off
  // hides its sub-types. The row is the old sidebar, as pills.
  const [rowsOff, setRowsOff] = useState<Set<string>>(() => new Set());
  const onlyType = types.size === 1 ? Array.from(types)[0] : null;
  const subRows = onlyType ? GROUPS.find((g) => g.typeKey === onlyType)?.rows ?? [] : [];
  const offSubs = new Set(subRows.filter((r) => rowsOff.has(r.label)).flatMap((r) => r.subTypes));
  const narrowed = (ALL_TYPES.length - types.size) + (ALL_STATUSES.length - statuses.size) + (lovedOnly ? 1 : 0) + (onlyType ? subRows.filter((r) => rowsOff.has(r.label)).length : 0);

  // Select (25 Sep 2026): on the wide map, a disc turns pointer drags into a
  // box and taps into toggles; the chosen pins get a ring, the rest fade, and
  // a tray offers the days. Panning is parked while it is on.
  const [selectMode, setSelectMode] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const boxRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const leaveSelect = useCallback(() => {
    setSelectMode(false); setPicked(new Set()); setBox(null);
    mapRef.current?.dragPan.enable();
  }, []);
  useEffect(() => { if (!wide && selectMode) leaveSelect(); }, [wide, selectMode, leaveSelect]);
  const toggleSelect = () => {
    if (selectMode) { leaveSelect(); return; }
    setSelectMode(true); mapRef.current?.dragPan.disable(); close();
  };
  /** Pins whose projected point lies in the box (container pixels). */
  const pinsIn = (b: { x0: number; y0: number; x1: number; y1: number }): string[] => {
    const map = mapRef.current; if (!map) return [];
    const [l, r] = [Math.min(b.x0, b.x1), Math.max(b.x0, b.x1)], [t, btm] = [Math.min(b.y0, b.y1), Math.max(b.y0, b.y1)];
    const out: string[] = [];
    markers.current.forEach((m, id) => {
      if (m.wrapper.style.display === "none") return;
      const c = m.cardRef.current; if (!placed(c)) return;
      const p = map.project([c.place!.lng!, c.place!.lat!]);
      if (p.x >= l && p.x <= r && p.y >= t && p.y <= btm) out.push(id);
    });
    return out;
  };
  const onSelectPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const start = { x0: e.clientX - r.left, y0: e.clientY - r.top, x1: e.clientX - r.left, y1: e.clientY - r.top };
    boxRef.current = start; setBox(start);
    const move = (ev: PointerEvent) => {
      const b = boxRef.current; if (!b) return;
      const nb = { ...b, x1: ev.clientX - r.left, y1: ev.clientY - r.top };
      boxRef.current = nb; setBox(nb);
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      const b = boxRef.current; boxRef.current = null; setBox(null);
      if (!b) return;
      const dragged = Math.abs(b.x1 - b.x0) > 6 || Math.abs(b.y1 - b.y0) > 6;
      const hit = dragged ? pinsIn(b) : pinsIn({ x0: b.x0 - 16, y0: b.y0 - 16, x1: b.x0 + 16, y1: b.y0 + 16 }).slice(0, 1);
      setPicked((prev) => {
        const next = new Set(prev);
        if (dragged) hit.forEach((id) => next.add(id));
        else hit.forEach((id) => { if (next.has(id)) next.delete(id); else next.add(id); });
        return next;
      });
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const selectedCards = cards.filter((c) => picked.has(c.id));

  // Where to stay (25 Sep 2026): the Map tab's candidates as lettered pins on
  // this map, framed once per set, the focused one enlarged.
  const [stayCands, setStayCands] = useState<StayCandidate[]>([]);
  const [focusedStay, setFocusedStay] = useState<StayCandidate | null>(null);
  const stayMarkers = useRef<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const fittedRef = useRef<string>("");
  useEffect(() => {
    const map = mapRef.current, mb = mbRef.current;
    stayMarkers.current.forEach((m) => m.remove()); stayMarkers.current = [];
    if (!ready || !map || !mb || !showStays) return;
    const coords: [number, number][] = [];
    stayCands.forEach((c) => {
      if (c.lat == null || c.lng == null) return;
      const { wrapper, inner } = makePinElement("logistics", "hotel", c.status === "chosen" ? "in_itinerary" : "interested", { label: c.letter ?? "", onClick: () => setFocusedStay(c) });
      inner.title = c.name;
      if (focusedStay?.id === c.id) { inner.dataset.selected = "1"; inner.style.transform = "scale(1.35)"; }
      stayMarkers.current.push(new mb.Marker({ element: wrapper, anchor: "center" }).setLngLat([c.lng, c.lat]).addTo(map));
      coords.push([c.lng, c.lat]);
    });
    const key = stayCands.map((c) => c.id).join(",");
    if (coords.length > 1 && !focusedStay && fittedRef.current !== key) {
      fittedRef.current = key;
      const b = coords.reduce((acc: any, pt) => acc.extend(pt), new mb.LngLatBounds(coords[0], coords[0])); // eslint-disable-line @typescript-eslint/no-explicit-any
      map.fitBounds(b, { padding: { top: 80, bottom: 80, left: 40, right: 440 }, maxZoom: 13 });
    }
  }, [showStays, stayCands, focusedStay, ready]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusedStay || focusedStay.lat == null || focusedStay.lng == null) return;
    map.flyTo({ center: [focusedStay.lng, focusedStay.lat], zoom: Math.max(map.getZoom(), 12) });
  }, [focusedStay]);

  const clearTemp = () => { if (tempPinRef.current) { tempPinRef.current.remove(); tempPinRef.current = null; } };
  const handlePlaceSelect = useCallback(async (placeId: string, sessionToken: string) => {
    const found = await lookupPlace(placeId, sessionToken);
    if (!found) return;
    clearTemp();
    const mb = mbRef.current, map = mapRef.current;
    if (mb && map) {
      const el = document.createElement("div");
      el.style.cssText = "width:28px;height:28px;cursor:pointer;";
      el.innerHTML = TEMP_PIN_SVG;
      tempPinRef.current = new mb.Marker({ element: el, anchor: "center" }).setLngLat([found.lng, found.lat]).addTo(map);
      map.flyTo({ center: [found.lng, found.lat], zoom: 15 });
    }
    setPending(found);
  }, []);
  const onHoverRef = useRef(onHover); onHoverRef.current = onHover;
  const onPinDragStartRef = useRef(onPinDragStart); onPinDragStartRef.current = onPinDragStart;

  const anchorFor = useCallback((c: Card) => {
    const map = mapRef.current, el = containerRef.current;
    if (!map || !el || !placed(c)) return null;
    const pt = map.project([c.place!.lng!, c.place!.lat!]);
    const r = el.getBoundingClientRect();
    return { x: r.left + pt.x, y: r.top + pt.y };
  }, []);

  // ── init once ───────────────────────────────────────────────
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN || !containerRef.current) return;
    let cancelled = false;
    import("mapbox-gl").then((mod) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const mb = mod.default as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      mb.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;
      mbRef.current = mb;
      const map = new mb.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [trip.destination_lng ?? 12.4964, trip.destination_lat ?? 41.9028],
        zoom: 12,
        attributionControl: false,
        logoPosition: "bottom-right",
      });
      mapRef.current = map;
      map.addControl(new mb.AttributionControl({ compact: true }), "bottom-right");
      const ro = new ResizeObserver(() => map.resize());
      ro.observe(containerRef.current!);
      map.once("remove", () => ro.disconnect());
      map.addControl(new mb.NavigationControl({ showCompass: false }), "bottom-right");
      map.on("move", () => setSelected((s) => { if (s) setAnchor(anchorFor(s)); return s; }));
      map.once("load", async () => {
        try { await document.fonts.load('16px "Material Symbols Outlined"'); } catch { /* best effort */ }
        if (mapRef.current !== map) return;
        setReady(true);
        // frame the journey's pins once
        const pts = cardsRef.current.filter(placed).map((c) => [c.place!.lng!, c.place!.lat!]);
        if (pts.length > 1) {
          const b = pts.reduce((acc: any, p) => acc.extend(p), new mb.LngLatBounds(pts[0], pts[0])); // eslint-disable-line @typescript-eslint/no-explicit-any
          map.fitBounds(b, { padding: { top: 70, bottom: 40, left: 30, right: 60 }, maxZoom: 14, duration: 0 });
        }
      });
    });
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [trip.destination_lat, trip.destination_lng, anchorFor]);

  // ── pins follow the cards ───────────────────────────────────
  useEffect(() => {
    const map = mapRef.current, mb = mbRef.current;
    if (!ready || !map || !mb) return;
    const seen = new Set<string>();
    for (const c of cards) {
      if (!placed(c)) continue;
      seen.add(c.id);
      const existing = markers.current.get(c.id);
      const status = c.day_id ? "in_itinerary" : "interested";
      if (existing) {
        existing.cardRef.current = c;
        if (existing.wrapper.dataset.status !== status) {
          // status changed (put on a day / taken off): rebuild the pin
          existing.marker.remove(); markers.current.delete(c.id);
        } else continue;
      }
      const hasRec = !!(c.details as Record<string, unknown> | null)?.recommended_by;
      const { wrapper, inner } = makeMaterialPinElement(c.place!.type, c.place!.sub_type, status, hasRec);
      wrapper.dataset.status = status;
      inner.title = c.place!.title;
      inner.style.transition = "transform 150ms ease, opacity 150ms ease";
      const cardRef = { current: c };
      const marker = new mb.Marker({ element: wrapper, anchor: "center" }).setLngLat([c.place!.lng!, c.place!.lat!]).addTo(map);
      wrapper.addEventListener("mouseenter", () => onHoverRef.current(cardRef.current.id));
      wrapper.addEventListener("mouseleave", () => onHoverRef.current(null));
      wrapper.addEventListener("click", (e) => {
        e.stopPropagation();
        setSelected(cardRef.current);
        setAnchor(anchorFor(cardRef.current));
      });
      // Press and move = drag onto the week. Panning is parked until the
      // pointer lifts so the map does not slide under the drag; no
      // preventDefault, or the click above would never fire.
      wrapper.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || !onPinDragStartRef.current) return;
        map.dragPan.disable();
        const release = () => { map.dragPan.enable(); window.removeEventListener("pointerup", release); };
        window.addEventListener("pointerup", release);
        onPinDragStartRef.current(cardRef.current);
      });
      markers.current.set(c.id, { marker, wrapper, inner, cardRef });
    }
    markers.current.forEach((m, id) => {
      if (!seen.has(id)) { m.marker.remove(); markers.current.delete(id); }
    });
  }, [cards, ready, anchorFor]);

  // ── hover lift and day fade, on the inner disc (Mapbox owns the wrapper's opacity) ──
  useEffect(() => {
    markers.current.forEach((m, id) => {
      const c = m.cardRef.current;
      const dim = activeDayId !== null && c.day_id !== activeDayId;
      const shown = types.has(c.place!.type) && statuses.has(c.day_id ? "in_itinerary" : "interested") && (!lovedOnly || c.place!.loved === true) && !(c.place!.sub_type && offSubs.has(c.place!.sub_type));
      m.wrapper.style.display = shown ? "" : "none";
      const isSel = picked.has(id);
      const fade = picked.size > 0 && !isSel;
      m.inner.style.opacity = dim || fade ? (fade ? "0.35" : "0.22") : "";
      m.inner.style.transform = id === hoveredId || isSel ? "scale(1.25)" : "";
      m.inner.style.boxShadow = isSel ? "0 0 0 3px #fff, 0 0 0 5px #1A1A2E" : "";
      m.wrapper.style.zIndex = id === hoveredId || isSel ? "5" : "";
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredId, activeDayId, cards, types, statuses, lovedOnly, picked, rowsOff]);

  // Click a day header and the map goes to that day (25 Sep 2026): fit the map
  // to the day's pins, one pin gets a zoom, and clicking the day again fits
  // the whole journey back.
  useEffect(() => {
    const map = mapRef.current, mb = mbRef.current;
    if (!ready || !map || !mb) return;
    const pool = activeDayId === null ? cards : cards.filter((c) => c.day_id === activeDayId);
    const pts = pool.filter(placed).map((c) => [c.place!.lng!, c.place!.lat!] as [number, number]);
    if (pts.length === 0) return;
    if (pts.length === 1) { map.flyTo({ center: pts[0], zoom: Math.max(map.getZoom(), 14), duration: 600 }); return; }
    const b = pts.reduce((acc: any, pt) => acc.extend(pt), new mb.LngLatBounds(pts[0], pts[0])); // eslint-disable-line @typescript-eslint/no-explicit-any
    map.fitBounds(b, { padding: { top: 70, bottom: 60, left: 30, right: 60 }, maxZoom: 15, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDayId, ready]);

  const close = useCallback(() => { setSelected(null); setAnchor(null); }, []);

  return (
    <div className="relative h-full min-h-0 border-l" style={{ borderColor: "rgba(26,26,46,0.10)" }}>
      <div ref={containerRef} className="absolute inset-0" onClick={close} />
      {selectMode && (
        <div className="absolute inset-0 z-[6] cursor-crosshair" onPointerDown={onSelectPointerDown}>
          {box && (
            <div className="absolute rounded-lg pointer-events-none" style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0), border: "1.5px dashed #1A1A2E", background: "rgba(26,26,46,0.06)" }} />
          )}
        </div>
      )}
      {wide && onPutMany && (
        <button
          type="button"
          onClick={toggleSelect}
          aria-pressed={selectMode}
          aria-label={selectMode ? "Stop selecting" : "Select several pins"}
          title={selectMode ? "Done selecting" : "Select several pins"}
          className="absolute right-[60px] top-3 z-10 w-9 h-9 rounded-full flex items-center justify-center hover:opacity-90"
          style={{ background: selectMode ? "#1A1A2E" : "#fff", color: selectMode ? "#fff" : "#1A1A2E", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={selectMode ? undefined : "3 3"}><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
        </button>
      )}
      {selectMode && selectedCards.length > 0 && (
        <div className="absolute left-1/2 -translate-x-1/2 z-[7] bg-white rounded-full flex items-center gap-1.5 pl-4 pr-1.5 py-1.5 max-w-[calc(100%-24px)]" style={{ bottom: 32, boxShadow: "0 8px 24px rgba(26,26,46,0.18)" }}>
          <span className="text-[13px] font-semibold whitespace-nowrap">{selectedCards.length} {selectedCards.length === 1 ? "place" : "places"} on</span>
          <div className="flex items-center gap-1 overflow-x-auto">
            {days.map((d) => {
              const n = cards.filter((c) => c.day_id === d.id).length;
              const dt = new Date(d.date + "T00:00:00");
              return (
                <button
                  key={d.id}
                  onClick={() => { const chosen = selectedCards; leaveSelect(); void onPutMany?.(chosen, d); }}
                  title={n === 0 ? "Nothing on it yet" : `${n} ${n === 1 ? "thing" : "things"} already`}
                  className="h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap hover:bg-[#1A1A2E] hover:text-white transition-colors"
                  style={{ background: "rgba(26,26,46,0.06)" }}
                >
                  {dt.toLocaleDateString("en-GB", { weekday: "short" })} {dt.getDate()}
                </button>
              );
            })}
          </div>
          <button onClick={leaveSelect} aria-label="Clear the selection" className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 hover:bg-gray-200">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1A1A2E" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      )}
      {onToggleWide && (
        <button
          type="button"
          onClick={onToggleWide}
          aria-label={wide ? "Show the week beside the map" : "Widen the map"}
          title={wide ? "Show the week" : "Widen the map"}
          className="absolute right-3 top-3 z-10 w-9 h-9 rounded-full bg-white flex items-center justify-center text-[#1A1A2E] hover:bg-gray-50"
          style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }}
        >
          {wide ? (
            /* collapse: arrows pointing in */
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
          ) : (
            /* expand: arrows pointing out */
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
          )}
        </button>
      )}
      {hot && (
        <div className="absolute inset-2 rounded-xl pointer-events-none flex items-end justify-center pb-4" style={{ background: "rgba(26,26,46,0.08)", border: "2px dashed rgba(26,26,46,0.35)" }}>
          <span className="text-[12px] font-medium px-3 py-1.5 rounded-full bg-white" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }}>Drop to take it off the day</span>
        </div>
      )}
      {!process.env.NEXT_PUBLIC_MAPBOX_TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">Map unavailable</div>
      )}
      <PlaceSearch
        onPlaceSelect={handlePlaceSelect}
        destination={trip.destination}
        lat={trip.destination_lat}
        lng={trip.destination_lng}
        positionClassName="absolute top-3 left-3 right-[60px] max-w-md"
      />
      {pending && (
        <AddToTripSheet
          place={pending}
          tripId={trip.id}
          days={days}
          onClose={() => { clearTemp(); setPending(null); }}
          onCardCreated={(c) => {
            clearTemp(); setPending(null); onCardCreated(c);
            const onDay = c.day_id ? days.find((d) => d.id === c.day_id) : null;
            toast({ message: onDay ? `Put on Day ${onDay.day_number}` : "Saved to your map. Drag its pin onto the week." });
          }}
        />
      )}
      {/* Filter — the Map tab's phone control, bottom-left, rows open upward */}
      <div className="absolute left-3 bottom-8 z-10 flex flex-col gap-2">
        {filterOpen && (
          <div className="flex flex-col gap-2">
            {subRows.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap max-w-[420px]">
                {subRows.map((r) => {
                  const n = cards.filter((c) => c.place && r.subTypes.includes(c.place.sub_type ?? "") && statuses.has(c.day_id ? "in_itinerary" : "interested") && (!lovedOnly || c.place.loved === true)).length;
                  if (n === 0) return null;
                  const on = !rowsOff.has(r.label);
                  return (
                    <button key={r.label} onClick={() => setRowsOff((prev) => { const next = new Set(prev); if (next.has(r.label)) next.delete(r.label); else next.add(r.label); return next; })} className="px-2.5 py-1 rounded-full text-[11.5px] font-medium transition-all duration-200" style={{ ...pillStyle(on, false), textDecoration: on ? "none" : "line-through" }}>
                      {r.label} <span style={{ opacity: 0.55 }}>{n}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex items-center gap-2">
              {([["activity", "Activity", "#1D9E75"], ["food", "Food", "#7C3AED"], ["logistics", "Logistics", "#1A1A2E"]] as [CardType, string, string][]).map(([k, label, color]) => {
                const active = types.has(k); const chosen = active && types.size < ALL_TYPES.length;
                return (
                  <button key={k} onClick={() => setTypes(tapFilter(types, ALL_TYPES, k))} className={`flex items-center gap-1.5 ${PILL}`} style={pillStyle(active, chosen)}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: chosen ? "#FFFFFF" : color, opacity: active ? 1 : 0.3 }} />
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              {([["interested", "Saved"], ["in_itinerary", "Scheduled"]] as [string, string][]).map(([k, label]) => {
                const active = statuses.has(k); const chosen = active && statuses.size < ALL_STATUSES.length;
                return (
                  <button key={k} onClick={() => setStatuses(tapFilter(statuses, ALL_STATUSES, k))} className={PILL} style={{ ...pillStyle(active, chosen), textDecoration: active ? "none" : "line-through" }}>{label}</button>
                );
              })}
              <button onClick={() => setLovedOnly((v) => !v)} aria-pressed={lovedOnly} className={`flex items-center gap-1.5 ${PILL}`} style={{ backdropFilter: "blur(8px)", background: lovedOnly ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)", color: lovedOnly ? "#B0541F" : "#9CA3AF" }}>
                <Heart size={11} weight={lovedOnly ? "fill" : "light"} color={lovedOnly ? "#B0541F" : "#9CA3AF"} />
                Loved
              </button>
            </div>
          </div>
        )}
        <button onClick={() => setFilterOpen((v) => !v)} className={`self-start flex items-center gap-1.5 ${PILL}`} style={{ backdropFilter: "blur(8px)", background: filterOpen ? "#1A1A2E" : "rgba(255,255,255,0.9)", color: filterOpen ? "#FFFFFF" : "#374151", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}>
          <Funnel size={13} weight="light" color={filterOpen ? "#FFFFFF" : "#374151"} />
          {filterOpen ? "Done" : "Filter"}
          {!filterOpen && narrowed > 0 && <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold" style={{ background: "#B0541F", color: "#FFFFFF" }}>{narrowed}</span>}
        </button>
      </div>
      {showStays && onCloseStays && (
        <WhereToStaySheet
          panel
          trip={trip}
          placesCount={cards.filter(placed).length}
          focusedId={focusedStay?.id ?? null}
          onFocus={setFocusedStay}
          onCandidates={setStayCands}
          onChanged={() => onStaysChanged?.()}
          onClose={() => { setFocusedStay(null); onCloseStays(); }}
        />
      )}
      {selected && (
        <MapPinPopup
          card={selected}
          anchorPos={anchor}
          onClose={close}
          onCardUpdate={(u) => { setSelected(u); onCardUpdate(u); }}
          onCardDelete={(id) => { close(); onCardDelete(id); }}
          onCardCreated={(c) => { close(); onCardCreated(c); }}
          days={days}
          tripId={trip.id}
        />
      )}
    </div>
  );
}
