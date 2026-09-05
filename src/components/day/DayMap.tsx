"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";
import type { Card } from "@/types/database";
import { makeMaterialPinElement } from "@/lib/mapPins";

interface Props {
  cards: Card[];
  accommodationCard?: Card;
  centerLat: number;
  centerLng: number;
  /** Called when a regular card pin is tapped. */
  onPinTap?: (cardId: string) => void;
  /** When set, briefly pulses the pin for that card ID. */
  pulsedCardId?: string | null;
  /** Phone only: the map fills the screen. Toggled by the ⤢ in its corner
   *  and by tapping a stacked pin. */
  expanded?: boolean;
  onToggleExpand?: () => void;
}

// One placed pin, with what the stacking pass needs to know about it.
interface PinItem {
  cardId: string;
  index: number;
  lng: number;
  lat: number;
  wrapper: HTMLElement;
  badge: HTMLElement;
  /** Set while this pin stands for others too (they are hidden under it). */
  group: PinItem[] | null;
}

// Pins closer than this on screen are one pin. A pin is 32px wide.
const STACK_PX = 30;

export default function DayMap({ cards, accommodationCard, centerLat, centerLng, onPinTap, pulsedCardId, expanded = false, onToggleExpand }: Props) {
  const mapRef         = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const pinsRef        = useRef<PinItem[]>([]);
  const restackRef     = useRef<() => void>(() => {});
  const expandedRef    = useRef(expanded);
  expandedRef.current = expanded;
  const onToggleExpandRef = useRef(onToggleExpand);
  onToggleExpandRef.current = onToggleExpand;

  // Stores the inner (animated) element of each regular-card marker, keyed by card.id.
  // Mapbox owns translate() on the wrapper; we animate scale on inner only.
  const markerInnerRef = useRef<Map<string, HTMLElement>>(new Map());

  // Keep callback ref current without adding it to the main effect's deps
  const onPinTapRef = useRef(onPinTap);
  onPinTapRef.current = onPinTap;

  const hasToken = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // ── Pulse animation ────────────────────────────────────────────
  useEffect(() => {
    if (!pulsedCardId) return;
    const inner = markerInnerRef.current.get(pulsedCardId);
    if (!inner) return;

    inner.style.transition = "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)";
    inner.style.transform  = "scale(1.45)";
    const t = setTimeout(() => {
      inner.style.transition = "transform 300ms ease";
      inner.style.transform  = "";
    }, 220);
    return () => {
      clearTimeout(t);
      // Reset scale in case cleanup fires mid-animation
      inner.style.transition = "transform 150ms ease";
      inner.style.transform  = "";
    };
  }, [pulsedCardId]);

  // ── Full screen ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current as { resize: () => void } | null;
    if (!map) return;
    const t = setTimeout(() => { map.resize(); restackRef.current(); }, 30);
    return () => clearTimeout(t);
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onToggleExpandRef.current?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  // ── Map init ───────────────────────────────────────────────────
  useEffect(() => {
    if (!hasToken || !mapRef.current || mapInstanceRef.current) return;

    // Resolve lat/lng from the linked place
    type Resolved = { card: Card; lat: number; lng: number };
    const mappable: Resolved[] = cards
      .filter((c) => c.status !== "cut")
      .flatMap((c) => {
        const p = c.place;
        if (p != null && p.lat != null && p.lng != null) {
          return [{ card: c, lat: p.lat, lng: p.lng }];
        }
        return [];
      });

    // `cancelled` prevents a stale .then() callback (e.g. from a cleanup that
    // fired while the dynamic import was still in-flight) from creating a
    // second map on the same container — same pattern as FullMapClient.
    let cancelled = false;
    markerInnerRef.current.clear();
    pinsRef.current = [];

    import("mapbox-gl").then((mapboxgl) => {
      if (cancelled || !mapRef.current || mapInstanceRef.current) return;

      // Clear any DOM left behind by a previous map.remove() call.
      mapRef.current.innerHTML = "";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mb = mapboxgl.default as any;
      mb.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

      const map = new mb.Map({
        container: mapRef.current!,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [centerLng, centerLat],
        zoom: 13,
        attributionControl: false,
        logoPosition: "bottom-right",
      });
      mapInstanceRef.current = map;

      map.addControl(new mb.AttributionControl({ compact: true }), "bottom-right");

      map.on("load", async () => {
        // Wait for Material Symbols font so icons render on first paint
        try {
          await document.fonts.load('16px "Material Symbols Outlined"');
        } catch { /* best-effort */ }

        mappable.forEach(({ card, lat, lng }, i) => {
          const cardDetails = card.details as Record<string, unknown> | null;
          const { wrapper, inner } = makeMaterialPinElement(
            card.place!.type, card.place!.sub_type, card.status, !!(cardDetails?.recommended_by), "#1A1A2E",
          );

          // Store inner element so the pulse effect can animate it
          markerInnerRef.current.set(card.id, inner);

          // The day number — an 18px disc with an 11px numeral in the app's
          // ink, ringed like the numeral in the card's rail. (It was 14px with
          // an 8px numeral: "the size of a full stop" — Brennan, Sep 2026.)
          wrapper.style.overflow = "visible";
          const badge = document.createElement("span");
          badge.style.cssText =
            "position:absolute;top:-7px;right:-8px;" +
            "min-width:18px;height:18px;border-radius:9px;" +
            "background:white;border:1.5px solid rgba(26,26,46,0.35);" +
            "font-family:'DM Sans',Inter,system-ui,sans-serif;font-size:11px;font-weight:700;" +
            "color:#1A1A2E;display:flex;align-items:center;justify-content:center;" +
            "padding:0 4px;line-height:1;pointer-events:none;z-index:1;white-space:nowrap;";
          badge.textContent = String(i + 1);
          wrapper.appendChild(badge);

          const item: PinItem = { cardId: card.id, index: i, lng, lat, wrapper, badge, group: null };
          pinsRef.current.push(item);

          // Tap: a plain pin opens its card. A pin standing for several zooms
          // in until they come apart, filling the screen first on a phone.
          inner.style.cursor = "pointer";
          inner.addEventListener("click", () => {
            if (item.group) {
              const b = item.group.reduce(
                (acc, g) => acc.extend([g.lng, g.lat]),
                new mb.LngLatBounds([item.lng, item.lat], [item.lng, item.lat]),
              );
              if (!expandedRef.current && window.innerWidth < 768) onToggleExpandRef.current?.();
              setTimeout(() => map.fitBounds(b, { padding: 90, maxZoom: 17, duration: 500 }), 60);
              return;
            }
            onPinTapRef.current?.(card.id);
          });

          new mb.Marker({ element: wrapper, anchor: "center" })
            .setLngLat([lng, lat])
            .addTo(map);
        });

        // ── Stacking ─────────────────────────────────────────────────
        // Pins that would sit on each other at this zoom become one pin
        // drawn exactly where they are, its badge listing every number it
        // stands for ("2 · 3", or "2 – 4" for a run). Recomputed after every
        // move, so a zoom in pulls them apart again. Positions are never
        // nudged: a pin is always where its place is.
        const restack = () => {
          const items = pinsRef.current;
          items.forEach((it) => { it.wrapper.style.display = ""; it.badge.textContent = String(it.index + 1); it.group = null; });
          const pts = items.map((it) => ({ it, p: map.project([it.lng, it.lat]) as { x: number; y: number } }));
          const used = new Set<number>();
          for (let a = 0; a < pts.length; a++) {
            if (used.has(a)) continue;
            const g = [a];
            used.add(a);
            for (let b = a + 1; b < pts.length; b++) {
              if (used.has(b)) continue;
              if (Math.hypot(pts[a].p.x - pts[b].p.x, pts[a].p.y - pts[b].p.y) < STACK_PX) { g.push(b); used.add(b); }
            }
            if (g.length < 2) continue;
            const members = g.map((k) => pts[k].it).sort((x, y) => x.index - y.index);
            const nums = members.map((m) => m.index + 1);
            const run = nums.every((n, k) => k === 0 || n === nums[k - 1] + 1);
            const head = members[0];
            head.badge.textContent = nums.length >= 3 && run ? `${nums[0]} – ${nums[nums.length - 1]}` : nums.join(" · ");
            head.group = members;
            members.slice(1).forEach((m) => { m.wrapper.style.display = "none"; });
          }
        };
        restackRef.current = restack;
        map.on("moveend", restack);

        // Accommodation hotel pin — matches main map hotel style, same size as regular pins, gold ★ badge
        let accomCoord: [number, number] | null = null;
        if (accommodationCard) {
          const ac = accommodationCard;
          const acLat = ac.place?.lat ?? (ac.details as Record<string, unknown>)?.lat as number | undefined;
          const acLng = ac.place?.lng ?? (ac.details as Record<string, unknown>)?.lng as number | undefined;
          if (acLat != null && acLng != null) {
            accomCoord = [acLng, acLat];

            // Wrapper/inner split: Mapbox owns translate() on wrapper, scale lives on inner
            const acWrapper = document.createElement("div");
            acWrapper.style.cssText = "position:relative;width:32px;height:32px;";

            const acInner = document.createElement("div");
            acInner.style.cssText =
              "width:32px;height:32px;" +
              "border-radius:50%;" +
              "background:#1A1A2E;" +          // uniform ink color for agenda mini-map
              "border:2px solid white;" +
              "display:flex;align-items:center;justify-content:center;" +
              "box-shadow:0 2px 4px rgba(0,0,0,0.25);" +
              "transition:transform 150ms ease;" +
              "transform-origin:50% 50%;";

            // Hotel icon — matches MATERIAL_ICONS.hotel = "hotel"
            const acIcon = document.createElement("span");
            acIcon.className = "material-symbols-outlined";
            acIcon.style.cssText =
              "color:white;" +
              "font-size:16px;" +
              "line-height:1;" +
              "display:block;" +
              "user-select:none;" +
              "font-variation-settings:'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 20;";
            acIcon.textContent = "hotel";

            acInner.appendChild(acIcon);
            acWrapper.appendChild(acInner);

            // The hotel pin opens its card too — every pin on this map is tappable
            acInner.style.cursor = "pointer";
            acInner.addEventListener("click", () => onPinTapRef.current?.(ac.id));

            // Gold ★ badge — top-right corner, ~40% of pin size
            const starBadge = document.createElement("div");
            starBadge.style.cssText =
              "position:absolute;top:-3px;right:-3px;" +
              "width:13px;height:13px;" +
              "border-radius:50%;" +
              "background:white;" +
              "display:flex;align-items:center;justify-content:center;" +
              "box-shadow:0 1px 2px rgba(0,0,0,0.25);" +
              "font-size:8px;line-height:1;" +
              "color:#F5A623;" +
              "pointer-events:none;";
            starBadge.textContent = "★";
            acWrapper.appendChild(starBadge);

            const accomMarker = new mb.Marker({ element: acWrapper, anchor: "center" })
              .setLngLat(accomCoord)
              .addTo(map);

            // Raise z-index so accommodation pin renders above regular card pins
            accomMarker.getElement().style.zIndex = "5";
          }
        }

        const allCoords: [number, number][] = [
          ...mappable.map(({ lng, lat }) => [lng, lat] as [number, number]),
          ...(accomCoord ? [accomCoord] : []),
        ];

        if (allCoords.length > 1) {
          const bounds = allCoords.reduce(
            (b, coord) => b.extend(coord),
            new mb.LngLatBounds(allCoords[0], allCoords[0]),
          );
          map.fitBounds(bounds, { padding: 50, maxZoom: 15 });
        } else if (allCoords.length === 1) {
          // A single stop still deserves the zoom — late-trip days often have
          // one pin and no accommodation span, which used to leave the map
          // sitting at the trip-wide default.
          map.jumpTo({ center: allCoords[0], zoom: 14 });
        }

        requestAnimationFrame(() => { map.resize(); restack(); });
      });
    });

    const markerInner = markerInnerRef.current;
    return () => {
      cancelled = true;
      markerInner.clear();
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, accommodationCard]);

  if (!hasToken) {
    return (
      <div className="h-12 bg-gray-50 border-b border-gray-100 flex items-center px-4">
        <span className="text-xs text-gray-400">Map · Add NEXT_PUBLIC_MAPBOX_TOKEN to enable</span>
      </div>
    );
  }

  return (
    <div
      className={
        expanded
          ? "fixed inset-0 z-50 bg-white"
          : "relative h-48 overflow-hidden border-b border-gray-100 md:h-[620px] md:rounded-2xl md:border md:border-[rgba(26,26,46,0.12)]"
      }
    >
      <div ref={mapRef} className="absolute inset-0" />
      {onToggleExpand && (
        // Phone only: the desktop map is already 620px tall.
        <button
          type="button"
          onClick={onToggleExpand}
          aria-label={expanded ? "Back to the day" : "Fill the screen with the map"}
          className="md:hidden absolute right-3 z-10 w-9 h-9 rounded-full bg-white flex items-center justify-center active:opacity-70"
          style={{ top: expanded ? "max(12px, env(safe-area-inset-top))" : 12, boxShadow: "0 1px 4px rgba(0,0,0,0.2)", color: "#1A1A2E" }}
        >
          {expanded ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
          )}
        </button>
      )}
    </div>
  );
}
