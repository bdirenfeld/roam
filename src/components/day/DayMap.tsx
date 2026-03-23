"use client";

import { useEffect, useRef, useState } from "react";
import type { Card } from "@/types/database";
import { makePinElement, PIN_COLORS } from "@/lib/mapPins";

interface Props {
  cards: Card[];
  centerLat: number;
  centerLng: number;
}

function popupHTML(card: Card): string {
  const color = PIN_COLORS[card.type] ?? "#64748B";
  const time = card.start_time
    ? (() => {
        const [h, m] = card.start_time.split(":").map(Number);
        const p = h >= 12 ? "PM" : "AM";
        return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${p}`;
      })()
    : "";
  return `
    <div style="font-family:Inter,system-ui,sans-serif;padding:10px 12px;min-width:160px;max-width:220px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></div>
        <span style="font-size:10px;font-weight:600;color:#6B7280;text-transform:capitalize">
          ${card.sub_type?.replace(/_/g, " ") ?? card.type}
        </span>
        ${time ? `<span style="font-size:10px;color:#9CA3AF;margin-left:auto">${time}</span>` : ""}
      </div>
      <p style="font-size:13px;font-weight:700;color:#111827;margin:0;line-height:1.3">${card.title}</p>
      ${card.address ? `<p style="font-size:11px;color:#9CA3AF;margin:3px 0 0;line-height:1.3">${card.address}</p>` : ""}
    </div>`;
}

export default function DayMap({ cards, centerLat, centerLng }: Props) {
  const mapRef         = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const hasToken = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    if (!hasToken || !mapRef.current || mapInstanceRef.current || isCollapsed) return;

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
        logoPosition: "bottom-left",
      });
      mapInstanceRef.current = map;

      map.addControl(new mb.AttributionControl({ compact: true }), "bottom-right");

      map.on("load", () => {
        mappable.forEach(({ card, lat, lng }, i) => {
          const { wrapper } = makePinElement(card.type, card.sub_type, card.status);

          // Sequence number badge — sits outside the pin without interfering with
          // Mapbox's transform:translate on wrapper, or inner's hover scale.
          wrapper.style.position = "relative";
          wrapper.style.overflow = "visible";
          const badge = document.createElement("span");
          badge.style.cssText =
            "position:absolute;top:-4px;right:-5px;" +
            "min-width:13px;height:13px;border-radius:7px;" +
            "background:white;border:1.5px solid rgba(0,0,0,0.12);" +
            "font-family:Inter,system-ui,sans-serif;font-size:8px;font-weight:800;" +
            "color:#374151;display:flex;align-items:center;justify-content:center;" +
            "padding:0 2px;line-height:1;pointer-events:none;";
          badge.textContent = String(i + 1);
          wrapper.appendChild(badge);

          const popup = new mb.Popup({
            closeButton: false,
            closeOnClick: true,
            offset: [0, -42],
            maxWidth: "240px",
          }).setHTML(popupHTML(card));

          new mb.Marker({ element: wrapper, anchor: "bottom" })
            .setLngLat([lng, lat])
            .setPopup(popup)
            .addTo(map);
        });

        if (mappable.length > 1) {
          const coords = mappable.map(({ lng, lat }) => [lng, lat] as [number, number]);
          const bounds = coords.reduce(
            (b, coord) => b.extend(coord),
            new mb.LngLatBounds(coords[0], coords[0]),
          );
          map.fitBounds(bounds, { padding: 50, maxZoom: 15 });
        }
      });
    });

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCollapsed, cards]);

  if (!hasToken) {
    return (
      <div className="h-12 bg-gray-50 border-b border-gray-100 flex items-center px-4">
        <span className="text-xs text-gray-400">Map · Add NEXT_PUBLIC_MAPBOX_TOKEN to enable</span>
      </div>
    );
  }

  return (
    <div className="border-b border-gray-100">
      {/* Collapsible map */}
      <div className={`relative transition-all duration-300 overflow-hidden ${isCollapsed ? "h-0" : "h-48"}`}>
        <div ref={mapRef} className="absolute inset-0" />

        {/* Category legend */}
        {!isCollapsed && (
          <div className="absolute bottom-2 left-2 flex gap-1.5 bg-white/90 backdrop-blur-sm rounded-lg px-2 py-1.5 shadow-sm pointer-events-none">
            {(Object.entries(PIN_COLORS) as [string, string][]).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[9px] font-semibold text-gray-500 capitalize">{type}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setIsCollapsed((v) => !v)}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-semibold text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <svg
          width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className={`transition-transform duration-200 ${isCollapsed ? "" : "rotate-180"}`}
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
        {isCollapsed ? "Show map" : "Hide map"}
      </button>
    </div>
  );
}
