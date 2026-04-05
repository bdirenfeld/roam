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
}

export default function DayMap({ cards, accommodationCard, centerLat, centerLng, onPinTap, pulsedCardId }: Props) {
  const mapRef         = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);

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

  // ── Map init ───────────────────────────────────────────────────
  useEffect(() => {
    if (!hasToken || !mapRef.current || mapInstanceRef.current) return;

    // Resolve lat/lng from top-level fields OR details fallback
    type Resolved = { card: Card; lat: number; lng: number };
    const mappable: Resolved[] = cards
      .filter((c) => c.status !== "cut")
      .flatMap((c) => {
        if (c.lat != null && c.lng != null) return [{ card: c, lat: c.lat, lng: c.lng }];
        const d = c.details as Record<string, unknown>;
        if (typeof d?.lat === "number" && typeof d?.lng === "number")
          return [{ card: c, lat: d.lat as number, lng: d.lng as number }];
        return [];
      });

    // `cancelled` prevents a stale .then() callback (e.g. from a cleanup that
    // fired while the dynamic import was still in-flight) from creating a
    // second map on the same container — same pattern as FullMapClient.
    let cancelled = false;
    markerInnerRef.current.clear();

    import("mapbox-gl").then((mapboxgl) => {
      if (cancelled || !mapRef.current || mapInstanceRef.current) return;

      // Clear any DOM left behind by a previous map.remove() call.
      mapRef.current.innerHTML = "";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mb = mapboxgl.default as any;
      mb.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

      const map = new mb.Map({
        container: mapRef.current!,
        style: "mapbox://styles/mapbox/light-v11",
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
            card.type, card.sub_type, card.status, !!(cardDetails?.recommended_by),
          );

          // Store inner element so the pulse effect can animate it
          markerInnerRef.current.set(card.id, inner);

          // Tap handler — fires onPinTap via stable ref
          inner.addEventListener("click", () => onPinTapRef.current?.(card.id));

          // Sequence number badge — absolute overlay on the pin
          wrapper.style.overflow = "visible";
          const badge = document.createElement("span");
          badge.style.cssText =
            "position:absolute;top:-4px;right:-5px;" +
            "min-width:14px;height:14px;border-radius:7px;" +
            "background:white;border:1.5px solid rgba(0,0,0,0.12);" +
            "font-family:Inter,system-ui,sans-serif;font-size:8px;font-weight:800;" +
            "color:#374151;display:flex;align-items:center;justify-content:center;" +
            "padding:0 2.5px;line-height:1;pointer-events:none;z-index:1;";
          badge.textContent = String(i + 1);
          wrapper.appendChild(badge);

          new mb.Marker({ element: wrapper, anchor: "center" })
            .setLngLat([lng, lat])
            .addTo(map);
        });

        // Accommodation hotel pin — matches main map hotel style, same size as regular pins, gold ★ badge
        let accomCoord: [number, number] | null = null;
        if (accommodationCard) {
          const ac = accommodationCard;
          const acLat = ac.lat ?? (ac.details as Record<string, unknown>)?.lat as number | undefined;
          const acLng = ac.lng ?? (ac.details as Record<string, unknown>)?.lng as number | undefined;
          if (acLat != null && acLng != null) {
            accomCoord = [acLng, acLat];

            // Wrapper/inner split: Mapbox owns translate() on wrapper, scale lives on inner
            const acWrapper = document.createElement("div");
            acWrapper.style.cssText = "position:relative;width:32px;height:32px;";

            const acInner = document.createElement("div");
            acInner.style.cssText =
              "width:32px;height:32px;" +
              "border-radius:50%;" +
              "background:#111827;" +          // same near-black as main map logistics/hotel
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
        }

        requestAnimationFrame(() => { map.resize(); });
      });
    });

    return () => {
      cancelled = true;
      markerInnerRef.current.clear();
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
    <div className="relative h-48 border-b border-gray-100">
      <div ref={mapRef} className="absolute inset-0" />
    </div>
  );
}
