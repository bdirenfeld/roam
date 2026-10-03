import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { materialFontUrl, getMaterialIconHTML } from "./mapPins";

// The icon font asks Google for Roam's glyphs only (3 Oct 2026: the whole
// family was 4.0 MB on every first visit; the subset is about 6 KB).
const url = materialFontUrl();
const names = new URL(url).searchParams.get("icon_names")!.split(",");

describe("the Material Symbols subset", () => {
  it("names every glyph the app draws, sorted as Google requires", () => {
    expect(names).toEqual([...names].sort());
    for (const sub of ["guided", "restaurant", "coffee", "dessert", "hotel", "flight_arrival", "transit", "grocery", "pet_care", "medical", "beach", "camp", "self_directed", "bar", "street_food", "wellness", "event", "challenge"]) {
      const glyph = getMaterialIconHTML(sub).match(/>([a-z_]+)<\/span>/)![1];
      expect(names, `${sub} → ${glyph}`).toContain(glyph);
    }
    // The fallback, a note card's icon, and the day map's hotel.
    expect(names).toEqual(expect.arrayContaining(["place", "edit_note", "hotel"]));
  });

  it("asks only for the axis values the app sets, never the whole family", () => {
    expect(url).toContain("opsz,wght,FILL,GRAD@20,400,0..1,0");
    expect(url).not.toContain("100..700");
  });

  it("every literal glyph in a component is in the subset", () => {
    // CardSurface's note icon and DayMap's hotel are written as text, not via MATERIAL_ICONS.
    const src = ["components/cards/CardSurface.tsx", "components/day/DayMap.tsx"].map((f) => readFileSync(join(__dirname, "..", f), "utf8")).join("\n");
    const literals = Array.from(src.matchAll(/material-symbols-outlined[\s\S]{0,200}?>\s*([a-z_]+)\s*</g)).map((m) => m[1]);
    const textContent = Array.from(src.matchAll(/acIcon\.textContent = "([a-z_]+)"/g)).map((m) => m[1]);
    for (const g of [...literals, ...textContent]) expect(names, g).toContain(g);
  });

  it("the root layout uses the subset", () => {
    expect(readFileSync(join(__dirname, "..", "app/layout.tsx"), "utf8")).toContain("materialFontUrl()");
  });
});
