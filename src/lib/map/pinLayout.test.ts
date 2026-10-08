import { describe, it, expect } from "vitest";
import { layoutPins, pileRing, type LayoutPin } from "./pinLayout";

const PIN = 32;
const pin = (id: string, x: number, y: number, day = false, type = "food"): LayoutPin => ({ id, x, y, day, type });

describe("layoutPins: side by side, piles, and the day kept apart", () => {
  it("2 and 4 on Via dei Neri sit side by side, nothing hidden", () => {
    const l = layoutPins([pin("2", 255, 152, true), pin("4", 263, 160, true), pin("1", 100, 40, true, "activity")], PIN);
    expect(l.piles).toEqual([]);
    expect(l.hidden.size).toBe(0);
    const a = l.offsets.get("2")!, b = l.offsets.get("4")!;
    expect((263 + b[0]) - (255 + a[0])).toBe(PIN + 4);
    expect(l.offsets.has("1")).toBe(false);
  });

  it("zoomed out, Florence's crowd of saved places is one pile with its type counts", () => {
    const crowd = [pin("a", 300, 300), pin("b", 304, 302), pin("c", 298, 306, false, "activity"), pin("d", 302, 299), pin("e", 306, 304, false, "activity")];
    const l = layoutPins(crowd, PIN);
    expect(l.piles).toHaveLength(1);
    expect(l.piles[0].counts).toEqual({ food: 3, activity: 2 });
    expect(l.hidden.size).toBe(5);
  });

  it("the day's stops never pile with saved places on top of them", () => {
    const saved = [pin("a", 300, 300), pin("b", 304, 302), pin("c", 298, 306), pin("d", 302, 299)];
    const today = [pin("1", 301, 301, true), pin("2", 303, 303, true)];
    const l = layoutPins([...saved, ...today], PIN);
    expect(l.piles).toHaveLength(1);
    expect(l.piles[0].day).toBe(false);
    expect(l.piles[0].ids).not.toContain("1");
    expect(l.offsets.has("1") && l.offsets.has("2")).toBe(true);
  });

  it("four of the day's stops in one spot are the day's own pile", () => {
    const l = layoutPins([pin("1", 50, 50, true), pin("2", 52, 51, true), pin("3", 49, 53, true), pin("4", 51, 49, true)], PIN);
    expect(l.piles).toHaveLength(1);
    expect(l.piles[0].day).toBe(true);
  });
});

describe("pileRing: the ring shows the mix in legend colours", () => {
  const C = { food: "#7C3AED", activity: "#0D9488", logistics: "#111827" };
  it("arcs by count, food then activity then logistics", () => {
    expect(pileRing({ food: 3, activity: 1 }, C)).toBe("conic-gradient(#7C3AED 0deg 270deg, #0D9488 270deg 360deg)");
  });
  it("one type is one full arc", () => {
    expect(pileRing({ activity: 4 }, C)).toBe("conic-gradient(#0D9488 0deg 360deg)");
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
