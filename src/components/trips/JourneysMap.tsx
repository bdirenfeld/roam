"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import TripCover from "@/components/ui/TripCover";
import { ALL, dotBounds, dotFilters, filterDots, type JourneyDot } from "@/lib/journeys/mapDots";

// The map of every journey, opened by Journeys' Map button (JourneysMapButton,
// 25 Nov 2026): the same Mapbox map as the week, so it drags and zooms. One dot per journey:
// solid = coming up, hollow = taken. The buttons choose which dots show and
// the map zooms to fit them. A dot shows that journey's card; the card opens
// it. An empty spot on the map closes the card.
//
// Places are named beside a journey coming up, and beside the rest once you
// have zoomed in: seven names over a whole world sit on each other (Rome on
// Tuscany, Toronto on New York).

// On a phone the map is NOT the whole screen (found on the phone viewer, 25 Nov
// 2026): Mapbox will not pull back further than the world filling the map's
// height, so a tall map can never show both North America and Sydney. The map
// is a block about as tall as the screen is wide, and the journeys it is
// showing are listed under it. A dot picks out its row; a row opens the journey.

const INK = "#1A1A2E";
/** Zoom from which every dot is named. */
const NAME_ZOOM = 3.2;
const LABEL = "pointer-events-none absolute left-full top-1/2 ml-1.5 -translate-y-1/2 whitespace-nowrap text-[12.5px] font-semibold";
const LABEL_HALO = "0 0 3px #fff, 0 0 3px #fff, 0 0 2px #fff, 0 0 2px #fff";

function dotElement(d: JourneyDot, phone: boolean): { el: HTMLElement; label: HTMLElement; halo: HTMLElement } {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", `${d.title}, ${d.dates}`);
  el.setAttribute("data-testid", "journey-dot");
  el.setAttribute("data-dot", d.id);
  el.setAttribute("data-upcoming", d.upcoming ? "yes" : "no");
  // The target around a 13 to 16px dot: 32px for a pointer, 44px for a thumb.
  el.className = phone ? "relative grid h-11 w-11 cursor-pointer place-items-center" : "relative grid h-8 w-8 cursor-pointer place-items-center";
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

export default function JourneysMap({ dots, phone = false }: { dots: JourneyDot[]; /** Full screen on a phone: no zoom buttons (you pinch), and the card clears the List button. */ phone?: boolean }) {
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
        // Below zero on purpose: at zoom 0 the world is 512px wide, wider than a
        // phone, so "All" left North America and Sydney off the screen (seen on
        // the phone viewer, 25 Nov 2026). The frame can now pull back far enough.
        minZoom: -2,
        attributionControl: false,
        logoPosition: "bottom-right",
      });
      mapRef.current = map;
      mbRef.current = mb;
      if (!phone) map.addControl(new mb.NavigationControl({ showCompass: false }), "bottom-right");
      map.addControl(new mb.AttributionControl({ compact: true }), "bottom-right");
      map.on("style.load", () => { try { map.setFog(null); } catch { /* older styles have none */ } });
      map.on("load", () => {
        if (cancelled) return;
        // The phone's map opens inside a sheet that is still laying out; measure again.
        try { map.resize(); } catch { /* gone */ }
        setReady(true);
      });
      map.on("click", () => setSel(null));
      map.on("zoom", () => setNamed(map.getZoom() >= NAME_ZOOM));
    });
    return () => {
      cancelled = true;
      markersRef.current = [];
      try { mapRef.current?.remove(); } catch { /* already gone */ }
      mapRef.current = null;
    };
    // phone is fixed for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const { el, label, halo } = dotElement(d, phone);
      el.addEventListener("click", (e) => { e.stopPropagation(); setSel(d.id); });
      const marker = new mb.Marker({ element: el }).setLngLat([d.lng, d.lat]).addTo(map);
      return { dot: d, marker, label, halo };
    });
    const b = dotBounds(shown);
    if (b) {
      const duration = fittedOnce.current ? 600 : 0;
      if (shown.length === 1) map.easeTo({ center: [shown[0].lng, shown[0].lat], zoom: 4, duration });
      else map.fitBounds(b, { padding: phone ? { top: 70, bottom: 30, left: 30, right: 30 } : { top: 90, bottom: 120, left: 70, right: 90 }, maxZoom: 6, duration });
      fittedOnce.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, shown]);

  // Which dots are named, and which one is picked.
  useEffect(() => {
    markersRef.current.forEach(({ dot, label, halo }) => {
      const picked = dot.id === sel;
      label.style.display = dot.upcoming || picked || named ? "" : "none";
      halo.style.background = picked ? "rgba(26,26,46,0.16)" : "transparent";
    });
  }, [sel, named, shown, ready]);

  useEffect(() => {
    if (!phone || !sel) return;
    const row = document.querySelector(`[data-journey-row="${sel}"]`);
    if (row && typeof (row as HTMLElement).scrollIntoView === "function") (row as HTMLElement).scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [phone, sel]);

  if (!hasToken) return <div className="h-full w-full" style={{ background: "#E9EEF0" }} />;

  const buttons = (
    <div className="absolute left-4 top-4 z-[2] flex flex-wrap gap-1.5" role="group" aria-label="Which journeys are on the map">
      {filters.map((f) => (
        <button
          key={f}
          type="button"
          aria-pressed={filter === f}
          onClick={() => { setFilter(f); setSel(null); }}
          className="relative rounded-full px-[15px] py-[7px] text-[14px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-activity"
          style={filter === f ? { background: INK, color: "#fff" } : { background: "#fff", color: "rgba(26,26,46,0.72)", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }}
        >
          {/* The pill is 35px tall; its target reaches 45 (the app's pattern, ui/AppHeader). */}
          <span aria-hidden="true" data-testid="journeys-filter-target" className="absolute inset-x-0 -inset-y-[5px]" />
          {f}
        </button>
      ))}
    </div>
  );

  if (phone) {
    return (
      <div className="flex h-full w-full flex-col bg-white" data-testid="journeys-map">
        <div className="relative w-full flex-none" style={{ height: "min(100vw, 55dvh)", background: "#CFE2EC" }}>
          <div ref={boxRef} className="h-full w-full" />
          {buttons}
        </div>
        {/* The journeys on the map just now, newest first; the foot clears the List button. */}
        <ul className="min-h-0 flex-1 overflow-y-auto px-4 pt-2" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)" }} data-testid="journeys-map-rows">
          {[...shown].reverse().map((d) => (
            <li key={d.id} style={{ borderBottom: "1px solid rgba(26,26,46,0.08)" }}>
              <Link
                href={d.href}
                data-journey-row={d.id}
                aria-current={d.id === sel ? "true" : undefined}
                className="-mx-2 flex min-h-[60px] items-center gap-3 rounded-xl px-2 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-activity"
                style={d.id === sel ? { background: "rgba(26,26,46,0.07)" } : undefined}
              >
                <span aria-hidden="true" className="block flex-none rounded-full" style={d.upcoming ? { width: 12, height: 12, background: INK } : { width: 12, height: 12, background: "#fff", border: `2px solid ${INK}` }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15.5px] text-activity">{d.title}</span>
                  <span className="block text-[10.5px] uppercase tracking-widest" style={{ color: "rgba(26,26,46,0.55)" }}>{d.dates}</span>
                </span>
                <span aria-hidden="true" className="text-[18px]" style={{ color: "rgba(26,26,46,0.4)" }}>›</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full" data-testid="journeys-map" style={{ background: "#CFE2EC" }}>
      <div ref={boxRef} className="h-full w-full" />
      {buttons}

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
