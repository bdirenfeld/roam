/**
 * The travel leg's quiet line, drawn the same on both maps (7 Oct 2026, mock
 * d13): the day map since e27887d, the journey Map from today. Thin (1.5px),
 * low-opacity (0.4), dashed, in the transit pins' own colour; a small dot at
 * the start and the mode glyph in a white disc at the middle. Nothing on it is
 * tappable: the end pin already opens the card. `lib/travel/leg` decides
 * which legs are drawn (shouldDrawLine, legLines); this only draws them.
 */

import { PIN_COLORS } from "@/lib/mapPins";
import { LEG_MODE_GLYPH, type LegLine } from "@/lib/travel/leg";

export const LEG_SOURCE = "travel-legs";

export const LEG_LINE_PAINT = {
  "line-color": PIN_COLORS.logistics,
  "line-width": 1.5,
  "line-opacity": 0.4,
  "line-dasharray": [2, 2.5],
};

/** The legs as GeoJSON: one LineString per leg, start → end, carrying its card id. */
export function legFeatures(legs: LegLine[]) {
  return {
    type: "FeatureCollection" as const,
    features: legs.map((l) => ({
      type: "Feature" as const,
      properties: { cardId: l.cardId },
      geometry: { type: "LineString" as const, coordinates: [l.from, l.to] },
    })),
  };
}

/** Every point a map should keep in frame for these legs: the starts (the ends are pins already). */
export function legStarts(legs: LegLine[]): [number, number][] {
  return legs.map((l) => l.from);
}

/**
 * Draw the legs on a loaded map. Returns a handle whose remove() takes the
 * line, the dots and the mode discs off again — the journey Map redraws when
 * its filters change. A style without sources still gets its pins.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function drawLegs(map: any, mb: any, legs: LegLine[]): { remove: () => void } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markers: any[] = [];
  let layered = false;
  if (legs.length) {
    try {
      map.addSource(LEG_SOURCE, { type: "geojson", data: legFeatures(legs) });
      map.addLayer({
        id: LEG_SOURCE,
        type: "line",
        source: LEG_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { ...LEG_LINE_PAINT },
      });
      layered = true;
    } catch { /* a style without sources: the pins still stand */ }
    legs.forEach((l) => {
      const dot = document.createElement("div");
      dot.setAttribute("data-leg-start", l.cardId);
      dot.style.cssText =
        "width:8px;height:8px;border-radius:50%;background:" + PIN_COLORS.logistics + ";" +
        "border:1.5px solid white;box-shadow:0 1px 2px rgba(0,0,0,0.25);pointer-events:none;";
      markers.push(new mb.Marker({ element: dot, anchor: "center" }).setLngLat(l.from).addTo(map));

      const mid = document.createElement("div");
      mid.setAttribute("data-leg-mode", l.mode);
      mid.style.cssText =
        "width:20px;height:20px;border-radius:50%;background:white;" +
        "box-shadow:0 0 0 1px rgba(26,26,46,0.18),0 1px 2px rgba(0,0,0,0.15);" +
        "display:flex;align-items:center;justify-content:center;pointer-events:none;";
      const glyph = document.createElement("span");
      glyph.className = "material-symbols-outlined";
      glyph.style.cssText =
        "font-size:12px;line-height:1;color:rgba(26,26,46,0.7);user-select:none;" +
        "font-variation-settings:'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 20;";
      glyph.textContent = LEG_MODE_GLYPH[l.mode];
      mid.appendChild(glyph);
      markers.push(new mb.Marker({ element: mid, anchor: "center" }).setLngLat(l.mid).addTo(map));
    });
  }
  return {
    remove: () => {
      markers.forEach((m) => m.remove());
      markers.length = 0;
      if (!layered) return;
      layered = false;
      try { map.removeLayer(LEG_SOURCE); map.removeSource(LEG_SOURCE); } catch { /* map already gone */ }
    },
  };
}
