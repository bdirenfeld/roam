import { describe, it, expect } from "vitest";
import fixture from "./fixtures/trips.json";
import { groupPins, type Pin } from "./dayGroups";
import { placeGroups, weekdayOf, regionLabel, freeDays, type DraftDay } from "./draftTrip";

type Row = { t: string; ty: Pin["type"]; st: string | null; la: number | null; ln: number | null; open?: string | null; types?: string[] };
const pinsOf = (title: string): Pin[] =>
  (fixture.trips.find((t) => t.title === title)!.pins as Row[]).map((p, i) => ({ id: `${title}-${i}`, title: p.t, type: p.ty, subType: p.st, lat: p.la, lng: p.ln, open: p.open ?? null, types: p.types ?? null }));
const daysFrom = (start: string, n: number, free = 1): DraftDay[] =>
  Array.from({ length: n }, (_, i) => ({ id: `d${i + 1}`, date: new Date(Date.parse(start + "T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10), free }));

describe("placeGroups", () => {
  // Japan, 2–15 April 2028 (a Sunday start), with Tokyo, Izu and Kyoto–Osaka chosen.
  const g = groupPins(pinsOf("Japan"), { kids: true });
  const tokyo = g.groups.find((x) => x.items.some((p) => p.title === "Ghibli Museum"))!.region;
  const izu = g.groups.find((x) => x.items.some((p) => p.title === "Itō"))!.region;
  const kansai = g.groups.find((x) => x.items.some((p) => p.title === "Kiyomizu-dera"))!.region;
  const days = daysFrom("2028-04-02", 14);

  it("places every chosen group, one region after another", () => {
    const { placed, unplaced } = placeGroups(g, days, { regions: [tokyo, izu, kansai] });
    const chosen = g.groups.filter((x) => [tokyo, izu, kansai].includes(x.region));
    expect(placed).toHaveLength(chosen.length);
    expect(unplaced.filter((x) => [tokyo, izu, kansai].includes(x.region))).toHaveLength(0);
    // Regions are not interleaved: once a region is left, it is not returned to.
    const seq = placed.map((p) => p.group.region).filter((r, i, a) => i === 0 || a[i - 1] !== r);
    expect(new Set(seq).size).toBe(seq.length);
  });

  it("never puts a group on a weekday one of its places is closed", () => {
    const { placed } = placeGroups(g, days, { regions: [tokyo, izu, kansai] });
    for (const p of placed) {
      const date = days.find((d) => d.id === p.dayId)!.date;
      expect(p.group.openDays[weekdayOf(date)]).toBe("1");
    }
    const ghibli = placed.find((p) => p.group.items.some((i) => i.title === "Ghibli Museum"))!;
    expect(weekdayOf(days.find((d) => d.id === ghibli.dayId)!.date)).not.toBe(1); // not a Tuesday
  });

  it("a travel day into a new region takes half a day at most", () => {
    const { placed } = placeGroups(g, days, { regions: [tokyo, izu, kansai] });
    placed.forEach((p, i) => {
      if (i > 0 && placed[i - 1].group.region !== p.group.region) expect(p.group.load).toBeLessThanOrEqual(0.5);
    });
  });

  it("skips days already planned and gives a flight day only half", () => {
    const rome = groupPins(pinsOf("Rome"), { kids: false });
    const d = daysFrom("2026-04-22", 7).map((x, i) => ({ ...x, free: i === 0 || i === 6 ? 0.5 : i === 2 ? 0 : 1 }));
    const { placed } = placeGroups(rome, d);
    expect(placed.some((p) => p.dayId === "d3")).toBe(false);
    for (const p of placed.filter((x) => x.dayId === "d1" || x.dayId === "d7")) expect(p.group.load).toBeLessThanOrEqual(0.5);
    expect(freeDays(d)).toBe(5);
  });

  it("spreads spare days through the trip, and a full day takes a walkable one", () => {
    const cr = groupPins(pinsOf("Costa Rica"), { kids: true });
    const nine = daysFrom("2026-03-04", 9);
    const { placed } = placeGroups(cr, nine);
    expect(placed).toHaveLength(cr.groups.length);
    // Costa Rica came out as five full days and four empty ones at the end.
    expect(Math.max(...placed.map((p) => Number(p.dayId.slice(1))))).toBeGreaterThanOrEqual(8);
    const rome = groupPins(pinsOf("Rome"), { kids: false });
    const r = placeGroups(rome, daysFrom("2026-04-22", 7));
    expect(r.unplaced).toHaveLength(0);
    expect(r.placed.some((p) => p.group.items.some((i) => i.title === "Villa Borghese Morning"))).toBe(true);
  });

  it("does not sit two days waiting for a place to open", () => {
    // Tokyo alone from Thursday: the stamp shop opens Saturdays and Sundays only.
    const { placed, unplaced } = placeGroups(g, daysFrom("2028-04-06", 4), { regions: [tokyo] });
    const stamps = [...placed.map((p) => p.group), ...unplaced].find((x) => x.items.some((i) => i.title.startsWith("Shinimonogurui")))!;
    const onDay = placed.find((p) => p.group === stamps);
    if (onDay) expect(["d3", "d4"]).toContain(onDay.dayId);
    expect(placed.length).toBeGreaterThanOrEqual(3);
  });

  it("hands back what does not fit instead of squeezing it in", () => {
    const { placed, unplaced } = placeGroups(g, days);
    expect(placed.length).toBeLessThanOrEqual(14);
    expect(placed.length + unplaced.length).toBe(g.groups.length);
    expect(new Set(placed.map((p) => p.dayId)).size).toBe(placed.length);
  });
});

describe("regionLabel", () => {
  it("names a region for the town most of its places are in", () => {
    const at = (address: string): Pin => ({ id: address, title: address, type: "activity", subType: null, lat: 0, lng: 0, address });
    expect(regionLabel([at("1 Via Roma, 00186 Roma RM, Italy"), at("2 Via Cavour, 00184 Roma RM, Italy"), at("Via Frascati, 00044 Frascati RM, Italy")])).toBe("Roma");
    expect(regionLabel([])).toBeNull();
  });
});

import { roundTrip } from "./draftTrip";
describe("roundTrip", () => {
  it("Japan from Tokyo: Yamagata is not left for the last day", () => {
    const at = { Tokyo: { lat: 35.68, lng: 139.76 }, Izu: { lat: 34.97, lng: 139.1 }, Kanazawa: { lat: 36.56, lng: 136.65 }, Osaka: { lat: 34.67, lng: 135.5 }, Yamagata: { lat: 38.25, lng: 140.34 } } as Record<string, { lat: number; lng: number }>;
    const order = roundTrip(Object.keys(at), (k) => at[k], at.Tokyo);
    expect(order[0]).toBe("Tokyo");
    expect(order[order.length - 1]).not.toBe("Yamagata");
    // Yamagata sits next to Tokyo at one end of the loop.
    expect([1, order.length - 1]).toContain(order.indexOf("Yamagata"));
  });
});

describe("placeGroups orders regions as a loop", () => {
  it("Japan: Yamagata is visited next to Tokyo in the loop", () => {
    const g = groupPins(pinsOf("Japan"), { kids: true });
    const reg = (t: string) => g.groups.find((x) => x.items.some((p) => p.title === t))!.region;
    const chosen = [reg("Ghibli Museum"), reg("Itō"), reg("Kanazawa"), reg("Kiyomizu-dera"), reg("Yamagata")];
    const { placed } = placeGroups(g, daysFrom("2028-04-02", 14), { regions: chosen, start: { lat: 35.68, lng: 139.76 } });
    const seq = placed.map((p) => p.group.region).filter((r, i, a) => i === 0 || a[i - 1] !== r);
    expect(seq[0]).toBe(reg("Ghibli Museum"));
    // Yamagata is next to Tokyo in the loop — straight after it, or the last
    // stop before home — never between Osaka and Kanazawa.
    const y = seq.indexOf(reg("Yamagata"));
    expect([1, seq.length - 1]).toContain(y);
  });
});

describe("the place open on the fewest days goes first", () => {
  it("Tokyo from a Sunday, every day free: the weekend-only stamp shop gets the Sunday", () => {
    const g = groupPins(pinsOf("Japan"), { kids: true });
    const tokyo = g.groups.find((x) => x.items.some((p) => p.title === "Ghibli Museum"))!.region;
    const { placed } = placeGroups(g, daysFrom("2028-04-02", 6), { regions: [tokyo] });
    const stamps = placed.find((p) => p.group.items.some((i) => i.title.startsWith("Shinimonogurui")));
    expect(stamps?.dayId).toBe("d1");
  });
});
