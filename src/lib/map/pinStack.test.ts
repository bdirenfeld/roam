// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stackOrder, restack } from "./pinStack";

describe("stackOrder", () => {
  it("saved pins under planned ones, otherwise the order they came in", () => {
    const pins = [
      { id: "colosseum-planned", status: "in_itinerary" },
      { id: "colosseum-saved", status: "interested" },
      { id: "trevi-saved", status: "interested" },
      { id: "pantheon-planned", status: "in_itinerary" },
    ];
    expect(stackOrder(pins).map((p) => p.id)).toEqual(["colosseum-saved", "trevi-saved", "colosseum-planned", "pantheon-planned"]);
  });
});

describe("restack", () => {
  it("whatever order the map left them in, the pins end up in the given order", () => {
    const layer = document.createElement("div");
    const [a, b, c] = ["a", "b", "c"].map((id) => { const el = document.createElement("div"); el.id = id; return el; });
    // As after Food off and on: the food pin (a) was appended last.
    layer.append(b, c, a);
    restack([a, b, c]);
    expect(Array.from(layer.children).map((e) => e.id)).toEqual(["a", "b", "c"]);
    const off = document.createElement("div");
    expect(() => restack([off])).not.toThrow();
  });
});

describe("every map that toggles pins restacks them", () => {
  // The bug lived between Mapbox and each map's show/hide code, so read both.
  const src = (f: string) => readFileSync(path.resolve(__dirname, "../../components", f), "utf8");
  it("the full map restacks after a filter change and after a pin is added", () => {
    const full = src("map/FullMapClient.tsx");
    const sync = full.slice(full.indexOf("const syncVisibility"), full.indexOf("function handleSubTypesChange"));
    expect(sync).toMatch(/restackAll\(\)/);
    const add = full.slice(full.indexOf("const addPinToMap"), full.indexOf("const addPinToMap") + 3000);
    expect(add).toMatch(/restackAll\(\)/);
  });
  it("the week's map restacks after its pins follow the cards", () => {
    const week = src("plan/WeekMap.tsx");
    const effect = week.slice(week.indexOf("// ── pins follow the cards"), week.indexOf("// ── hover lift"));
    expect(effect).toMatch(/restack\(/);
  });
});
