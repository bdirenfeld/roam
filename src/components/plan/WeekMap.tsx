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
}

type Marker = { marker: any; wrapper: HTMLElement; inner: HTMLElement; cardRef: { current: Card } }; // eslint-disable-line @typescript-eslint/no-explicit-any

function placed(c: Card): boolean {
  return typeof c.place?.lat === "number" && typeof c.place?.lng === "number";
}

export default function WeekMap({ trip, days, cards, hoveredId, activeDayId, onHover, onCardUpdate, onCardCreated, onCardDelete, onPinDragStart, hot }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const mbRef = useRef<any>(null);  // eslint-disable-line @typescript-eslint/no-explicit-any
  const markers = useRef<Map<string, Marker>>(new Map());
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<Card | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const cardsRef = useRef(cards); cardsRef.current = cards;
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
      map.addControl(new mb.NavigationControl({ showCompass: false }), "top-right");
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
      m.inner.style.opacity = dim ? "0.22" : "";
      m.inner.style.transform = id === hoveredId ? "scale(1.4)" : "";
      m.wrapper.style.zIndex = id === hoveredId ? "5" : "";
    });
  }, [hoveredId, activeDayId, cards]);

  const close = useCallback(() => { setSelected(null); setAnchor(null); }, []);

  return (
    <div className="relative h-full min-h-0 border-l" style={{ borderColor: "rgba(26,26,46,0.10)" }}>
      <div ref={containerRef} className="absolute inset-0" onClick={close} />
      {hot && (
        <div className="absolute inset-2 rounded-xl pointer-events-none flex items-end justify-center pb-4" style={{ background: "rgba(26,26,46,0.08)", border: "2px dashed rgba(26,26,46,0.35)" }}>
          <span className="text-[12px] font-medium px-3 py-1.5 rounded-full bg-white" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }}>Drop to take it off the day</span>
        </div>
      )}
      {!process.env.NEXT_PUBLIC_MAPBOX_TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">Map unavailable</div>
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
