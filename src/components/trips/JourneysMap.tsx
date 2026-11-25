"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import TripCover from "@/components/ui/TripCover";
import { ALL, dotBounds, dotFilters, filterDots, type JourneyDot } from "@/lib/journeys/mapDots";

// The map beside Journeys on a computer (25 Nov 2026, mocks approved): the
// same Mapbox map as the week, so it drags and zooms. One dot per journey:
// solid = coming up, hollow = taken. The buttons choose which dots show and
// the map zooms to fit them. A dot shows that journey's card; the card opens
// it. An empty spot on the map closes the card.
//
// Places are named beside a journey coming up, and beside the rest once you
// have zoomed in: seven names over a whole world sit on each other (Rome on
// Tuscany, Toronto on New York).

const INK = "#1A1A2E";
/** Zoom from which every dot is named. */
const NAME_ZOOM = 3.2;
const LABEL = "pointer-events-none absolute left-full top-1/2 ml-1.5 -translate-y-1/2 whitespace-nowrap text-[12.5px] font-semibold";
const LABEL_HALO = "0 0 3px #fff, 0 0 3px #fff, 0 0 2px #fff, 0 0 2px #fff";

function dotElement(d: JourneyDot): { el: HTMLElement; label: HTMLElement; halo: HTMLElement } {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", `${d.title}, ${d.dates}`);
  el.setAttribute("data-testid", "journey-dot");
  el.setAttribute("data-dot", d.id);
  el.setAttribute("data-upcoming", d.upcoming ? "yes" : "no");
  // A 32px target around a 12 to 16px dot.
  el.className = "relative grid h-8 w-8 cursor-pointer place-items-center";
  const halo = document.createElement("span");
  halo.className = "absolute h-8 w-8 rounded-full";
  halo.style.background = "transparent";
  const dot = document.createElement("span");
  dot.className = "relative block rounded-full";
  const size = d.upcoming ? 16 : 13;
  dot.style.cssText = `width:${size}px;height:${size}px;background:${d.upcoming ? INK : "#fff"};border:${d.upcoming ? 2.5 : 2}px solid ${d.upcoming ? "#fff" : INK};box-shadow:0 1px 3px rgba(0,0,0,0.25)`;
  const label = document.createElement("span");
  label.className = LABEL;
  label.style.cssText = `color:${INK};text-shadow:${LABEL_HALO};left:calc(50% + ${size / 2 + 5}px);margin-left:0`;
  label.textContent = d.place;
  el.append(halo, dot, label);
  return { el, label, halo };
}

export default function JourneysMap({ dots }: { dots: JourneyDot[] }) {
  const hasToken = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const boxRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mbRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<{ dot: JourneyDot; marker: any; label: HTMLElement; halo: HTMLElement }[]>([]);
  const fittedOnce = useRef(false);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState(ALL);
  const [sel, setSel] = useState<string | null>(null);
  const [named, setNamed] = useState(false);

  const filters = useMemo(() => dotFilters(dots), [dots]);
  const shown = useMemo(() => filterDots(dots, filter), [dots, filter]);
  const selected = sel ? shown.find((d) => d.id === sel) ?? null : null;

  // The map, once.
  useEffect(() => {
    if (!hasToken || !boxRef.current) return;
    let cancelled = false;
    import("mapbox-gl").then((mapboxgl) => {
      if (cancelled || !boxRef.current || mapRef.current) return;
      boxRef.current.innerHTML = "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mb = mapboxgl.default as any;
      mb.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;
      const map = new mb.Map({
        container: boxRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        // Flat, no fog, like every other map in Roam (29 Sep 2026: the globe's fog made zoom choppy).
        projection: "mercator",
        center: [-30, 25],
        zoom: 1.2,
        attributionControl: false,
        logoPosition: "bottom-right",
      });
      mapRef.current = map;
      mbRef.current = mb;
      map.addControl(new mb.NavigationControl({ showCompass: false }), "bottom-right");
      map.addControl(new mb.AttributionControl({ compact: true }), "bottom-right");
      map.on("style.load", () => { try { map.setFog(null); } catch { /* older styles have none */ } });
      map.on("load", () => { if (!cancelled) setReady(true); });
      map.on("click", () => setSel(null));
      map.on("zoom", () => setNamed(map.getZoom() >= NAME_ZOOM));
    });
    return () => {
      cancelled = true;
      markersRef.current = [];
      try { mapRef.current?.remove(); } catch { /* already gone */ }
      mapRef.current = null;
    };
  }, [hasToken]);

  // The seam drags, so the map's box changes width without the window changing.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { try { mapRef.current?.resize(); } catch { /* not ready */ } });
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  // The dots follow the chosen button, and the map frames them.
  useEffect(() => {
    const map = mapRef.current, mb = mbRef.current;
    if (!ready || !map || !mb) return;
    markersRef.current.forEach((m) => m.marker.remove());
    markersRef.current = shown.map((d) => {
      const { el, label, halo } = dotElement(d);
      el.addEventListener("click", (e) => { e.stopPropagation(); setSel(d.id); });
      const marker = new mb.Marker({ element: el }).setLngLat([d.lng, d.lat]).addTo(map);
      return { dot: d, marker, label, halo };
    });
    const b = dotBounds(shown);
    if (b) {
      const duration = fittedOnce.current ? 600 : 0;
      if (shown.length === 1) map.easeTo({ center: [shown[0].lng, shown[0].lat], zoom: 4, duration });
      else map.fitBounds(b, { padding: { top: 90, bottom: 120, left: 70, right: 90 }, maxZoom: 6, duration });
      fittedOnce.current = true;
    }
  }, [ready, shown]);

  // Which dots are named, and which one is picked.
  useEffect(() => {
    markersRef.current.forEach(({ dot, label, halo }) => {
      const picked = dot.id === sel;
      label.style.display = dot.upcoming || picked || named ? "" : "none";
      halo.style.background = picked ? "rgba(26,26,46,0.16)" : "transparent";
    });
  }, [sel, named, shown, ready]);

  if (!hasToken) return <div className="h-full w-full" style={{ background: "#E9EEF0" }} />;

  return (
    <div className="relative h-full w-full" data-testid="journeys-map" style={{ background: "#CFE2EC" }}>
      <div ref={boxRef} className="h-full w-full" />

      <div className="absolute left-4 top-4 z-[2] flex flex-wrap gap-1.5" role="group" aria-label="Which journeys are on the map">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => { setFilter(f); setSel(null); }}
            className="rounded-full px-[15px] py-[7px] text-[14px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-activity"
            style={filter === f ? { background: INK, color: "#fff" } : { background: "#fff", color: "rgba(26,26,46,0.72)", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }}
          >
            {f}
          </button>
        ))}
      </div>

      {selected && (
        <Link
          href={selected.href}
          data-testid="journey-dot-card"
          className="absolute bottom-4 left-4 z-[3] flex h-[84px] w-[340px] max-w-[calc(100%-5rem)] items-center overflow-hidden rounded-2xl bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-activity"
          style={{ boxShadow: "0 8px 24px rgba(26,26,46,0.2)" }}
        >
          <span className="relative block h-full w-[98px] flex-shrink-0 overflow-hidden">
            <TripCover destination={selected.destination} coverImageUrl={selected.cover} lat={selected.lat} lng={selected.lng} className="h-full w-full" />
          </span>
          <span className="min-w-0 flex-1 px-3.5">
            <span className="block truncate text-[16.5px] font-medium text-activity">{selected.title}</span>
            <span className="mt-0.5 block text-[10.5px] uppercase tracking-widest" style={{ color: "rgba(26,26,46,0.55)" }}>{selected.dates}</span>
          </span>
          <span aria-hidden="true" className="pr-3.5 text-[20px]" style={{ color: "rgba(26,26,46,0.4)" }}>›</span>
        </Link>
      )}
    </div>
  );
}
