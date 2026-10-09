import { describe, it, expect } from "vitest";
import { layoutPins, type LayoutPin } from "./pinLayout";

const PIN = 32;
const pin = (id: string, x: number, y: number, day = false, type = "food"): LayoutPin => ({ id, x, y, day, type });

describe("layoutPins: side by side, never merged, the day kept apart", () => {
  it("2 and 4 on Via dei Neri sit side by side", () => {
    const l = layoutPins([pin("2", 255, 152, true), pin("4", 263, 160, true), pin("1", 100, 40, true, "activity")], PIN);
    const a = l.offsets.get("2")!, b = l.offsets.get("4")!;
    expect((263 + b[0]) - (255 + a[0])).toBe(PIN + 4);
    expect(l.offsets.has("1")).toBe(false);
  });

  it("Lucca's six old-town stops, zoomed out to take in the villa: no blob, each drawn where it is", () => {
    const six = [pin("1", 300, 300, true), pin("2", 302, 301, true), pin("3", 299, 303, true), pin("5", 301, 299, true), pin("6", 304, 297, true), pin("7", 300, 304, true)];
    const l = layoutPins(six, PIN);
    expect(l.offsets.size).toBe(0);
    expect(Object.keys(l)).toEqual(["offsets"]);
  });

  it("the day's stops never sit beside saved places on top of them", () => {
    const l = layoutPins([pin("saved", 300, 300), pin("1", 301, 301, true), pin("2", 303, 303, true)], PIN);
    expect(l.offsets.has("saved")).toBe(false);
    expect(l.offsets.has("1") && l.offsets.has("2")).toBe(true);
  });
});

describe("the day page's map is wired the way the spec says", async () => {
  const { readFileSync } = await import("fs");
  const { join } = await import("path");
  const read = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8").replace(/\r\n/g, "\n");
  const day = read("components/day/DayViewClient.tsx");
  const full = read("components/map/FullMapClient.tsx");
  it("the strip's map disc opens the map in place, and a day tap on the open map toggles, never navigates", () => {
    expect(day).toContain("onOpenMap={openMap}");
    expect(day).toContain("if (mapOpenRef.current) { setMapDayId((cur) => (cur === day.id ? null : day.id)); return; }");
  });
  it("the header's search glyph is gone but search keeps a door in the day's menu", () => {
    expect(day).not.toContain('aria-label="Search"');
    expect(day).toContain('{ key: "search", title: "Search"');
  });
  it("only the embedded map lays pins out; the Map screen is unchanged", () => {
    expect(full).toContain("if (!embedded) return;\n    const layout = layoutPins(shown, 32);");
    expect(full).not.toContain("makePileElement");
  });
});

describe("twinsToHide: one pin per place", () => {
  it("Buca Mario saved and on a day: the day's card stays, the saved twin goes", async () => {
    const { twinsToHide } = await import("./pinLayout");
    const hide = twinsToHide([
      { id: "saved", place_id: "buca-mario", status: "interested" },
      { id: "on-day", place_id: "buca-mario", status: "in_itinerary" },
      { id: "alone", place_id: "gilli", status: "interested" },
    ]);
    expect(Array.from(hide)).toEqual(["saved"]);
  });
  it("the chosen day's stop wins over another day's card of the same place (the villa)", async () => {
    const { twinsToHide } = await import("./pinLayout");
    const hide = twinsToHide([
      { id: "check-in", place_id: "villa", status: "in_itinerary" },
      { id: "check-out", place_id: "villa", status: "in_itinerary" },
    ], (id) => id === "check-out");
    expect(Array.from(hide)).toEqual(["check-in"]);
  });
});
