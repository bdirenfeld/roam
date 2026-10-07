// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { legLines } from "@/lib/travel/leg";
import { legFeatures, legStarts, drawLegs, LEG_LINE_PAINT, LEG_SOURCE } from "./legLayer";
import { PIN_COLORS } from "@/lib/mapPins";

/**
 * The travel leg's line, shared by the day map and the journey Map (7 Oct
 * 2026). Shapes from the G Adventures test journey: "Overland truck: Lusaka →
 * Mfuwe", a scheduled transit card with details.from.
 */
const leg = (id: string, o: { start?: string; end?: string; fromLat?: number; fromLng?: number } = {}) => ({
  id, status: "in_itinerary", day_id: "d4", start_time: o.start ?? "06:00:00", end_time: o.end ?? "19:00:00",
  details: { from: { title: "Lusaka", lat: o.fromLat ?? -15.4167, lng: o.fromLng ?? 28.2833 }, mode: "drive", mode_label: "Overland truck" },
  place: { title: "Mfuwe", type: "logistics", sub_type: "transit", lat: -13.2667, lng: 31.9333 },
});

describe("legFeatures", () => {
  it("one LineString per drawn leg, start to end, carrying the card id", () => {
    const fc = legFeatures(legLines([leg("t1")]));
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties.cardId).toBe("t1");
    expect(fc.features[0].geometry).toEqual({ type: "LineString", coordinates: [[28.2833, -15.4167], [31.9333, -13.2667]] });
  });

  it("a short hop (under an hour) and a cut card draw nothing", () => {
    const hop = leg("t2", { start: "10:00:00", end: "10:30:00" });
    const cut = { ...leg("t3"), status: "cut" };
    expect(legFeatures(legLines([hop, cut])).features).toEqual([]);
  });

  it("the starts are what a map adds to its frame", () => {
    expect(legStarts(legLines([leg("t1")]))).toEqual([[28.2833, -15.4167]]);
  });
});

describe("drawLegs", () => {
  const fakeMap = () => {
    const markers: { el: HTMLElement; at: [number, number]; removed: boolean }[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mb: any = {
      Marker: function (this: unknown, o: { element: HTMLElement }) {
        const m = { el: o.element, at: [0, 0] as [number, number], removed: false };
        markers.push(m);
        return { setLngLat(at: [number, number]) { m.at = at; return this; }, addTo() { return this; }, remove() { m.removed = true; } };
      },
    };
    const map = { addSource: vi.fn(), addLayer: vi.fn(), removeLayer: vi.fn(), removeSource: vi.fn() };
    return { map, mb, markers };
  };

  it("the quiet line: 1.5px, dashed, 0.4 opacity, in the transit colour", () => {
    expect(LEG_LINE_PAINT).toEqual({ "line-color": PIN_COLORS.logistics, "line-width": 1.5, "line-opacity": 0.4, "line-dasharray": [2, 2.5] });
  });

  it("adds the line, a dot at the start and the mode at the middle; remove() takes all of it off", () => {
    const { map, mb, markers } = fakeMap();
    const legs = legLines([leg("t1")]);
    const h = drawLegs(map, mb, legs);
    expect(map.addSource).toHaveBeenCalledWith(LEG_SOURCE, { type: "geojson", data: legFeatures(legs) });
    expect(map.addLayer.mock.calls[0][0]).toMatchObject({ id: LEG_SOURCE, type: "line", paint: LEG_LINE_PAINT });
    expect(markers.map((m) => [m.el.getAttribute("data-leg-start") ?? m.el.getAttribute("data-leg-mode"), m.at])).toEqual([
      ["t1", [28.2833, -15.4167]],
      ["drive", legs[0].mid],
    ]);
    expect(markers[1].el.textContent).toBe("directions_car");
    h.remove();
    expect(markers.every((m) => m.removed)).toBe(true);
    expect(map.removeLayer).toHaveBeenCalledWith(LEG_SOURCE);
    expect(map.removeSource).toHaveBeenCalledWith(LEG_SOURCE);
  });

  it("no legs: nothing is added, and remove() is safe", () => {
    const { map, mb } = fakeMap();
    drawLegs(map, mb, []).remove();
    expect(map.addSource).not.toHaveBeenCalled();
    expect(map.removeLayer).not.toHaveBeenCalled();
  });

  it("both maps draw through it: neither carries its own copy of the line", () => {
    for (const file of ["src/components/day/DayMap.tsx", "src/components/map/FullMapClient.tsx"]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toMatch(/drawLegs\(map, mb, /);
      expect(src, file).toMatch(/legStarts\(/);
      expect(src, file).not.toMatch(/"line-dasharray"/);
    }
  });
});
