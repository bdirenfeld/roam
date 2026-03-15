"use client";

import { useEffect, useRef, useState } from "react";
import type { Card } from "@/types/database";

interface Props {
  cards: Card[];
  centerLat: number;
  centerLng: number;
}

const TYPE_COLORS: Record<string, string> = {
  logistics: "#64748B",
  activity:  "#0D9488",
  food:      "#F59E0B",
};

// Simple card surface info for the map popup
function popupHTML(card: Card): string {
  const color = TYPE_COLORS[card.type] ?? "#64748B";
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
        <span style="font-size:10px;font-weight:600;color:#6B7280;text-transform:capitalize">${card.sub_type?.replace("_", " ") ?? card.type}</span>
        ${time ? `<span style="font-size:10px;color:#9CA3AF;margin-left:auto">${time}</span>` : ""}
      </div>
      <p style="font-size:13px;font-weight:700;color:#111827;margin:0;line-height:1.3">${card.title}</p>
      ${card.address ? `<p style="font-size:11px;color:#9CA3AF;margin:3px 0 0;line-height:1.3">${card.address}</p>` : ""}
    </div>
  `;
}

export default function DayMap({ cards, centerLat, centerLng }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const hasToken = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    if (!hasToken || !mapRef.current || mapInstanceRef.current || isCollapsed) return;

    import("mapbox-gl").then((mapboxgl) => {
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

      // Minimal attribution
      map.addControl(
        new mb.AttributionControl({ compact: true }),
        "bottom-right"
      );

      map.on("load", () => {
        cards.forEach((card, i) => {
          // Top-level lat/lng columns take priority; fall back to details.lat/lng
          const d = card.details as Record<string, unknown>;
          const lat = card.lat ?? (typeof d?.lat === "number" ? d.lat : null);
          const lng = card.lng ?? (typeof d?.lng === "number" ? d.lng : null);
          if (lat == null || lng == null) return;

          const color = TYPE_COLORS[card.type] ?? "#64748B";

          // Create a custom marker element
          const el = document.createElement("div");
          el.style.cssText = `
            width: 28px; height: 28px; border-radius: 50%;
            background: ${color}; color: white;
            display: flex; align-items: center; justify-content: center;
            font-size: 11px; font-weight: 700;
            border: 2.5px solid white;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            cursor: pointer;
            font-family: Inter, system-ui, sans-serif;
          `;
          el.textContent = String(i + 1);

          const popup = new mb.Popup({
            closeButton: false,
            closeOnClick: true,
            offset: 18,
            maxWidth: "240px",
          }).setHTML(popupHTML(card));

          new mb.Marker({ element: el })
            .setLngLat([lng, lat])
            .setPopup(popup)
            .addTo(map);
        });

        // Fit bounds to all pins if there are multiple
        if (cards.length > 1) {
          const coords = cards
            .map((c) => {
              const cd = c.details as Record<string, unknown>;
              const clat = c.lat ?? (typeof cd?.lat === "number" ? cd.lat : null);
              const clng = c.lng ?? (typeof cd?.lng === "number" ? cd.lng : null);
              return clat != null && clng != null ? [clng, clat] as [number, number] : null;
            })
            .filter((x): x is [number, number] => x !== null);

          if (coords.length > 0) {
            const bounds = coords.reduce(
              (b, coord) => b.extend(coord),
              new mb.LngLatBounds(coords[0], coords[0])
            );
            map.fitBounds(bounds, { padding: 50, maxZoom: 15 });
          }
        }
      });
    });

    return () => {
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCollapsed]);

  if (!hasToken) {
    return (
      <div className="h-12 bg-gray-50 border-b border-gray-100 flex items-center justify-between px-4">
        <span className="text-xs text-gray-400">Map · Add NEXT_PUBLIC_MAPBOX_TOKEN to enable</span>
      </div>
    );
  }

  return (
    <div className="border-b border-gray-100">
      {/* Collapsible map */}
      <div
        className={`relative transition-all duration-300 overflow-hidden ${isCollapsed ? "h-0" : "h-48"}`}
      >
        <div ref={mapRef} className="absolute inset-0" />

        {/* Type legend */}
        {!isCollapsed && (
          <div className="absolute bottom-2 left-2 flex gap-1.5 bg-white/90 backdrop-blur-sm rounded-lg px-2 py-1.5 shadow-sm pointer-events-none">
            {Object.entries(TYPE_COLORS).map(([type, color]) => (
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
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className={`transition-transform duration-200 ${isCollapsed ? "" : "rotate-180"}`}
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
        {isCollapsed ? "Show map" : "Hide map"}
      </button>
    </div>
  );
}
