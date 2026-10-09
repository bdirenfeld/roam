import { describe, it, expect } from "vitest";
import { stackGroups, STACK_FACTOR, pileZoom, sideBySide, SIDE_BY_SIDE_MAX } from "./stackGroups";

describe("sideBySide: two or three touching pins share a row", () => {
  it("Via dei Neri: 2 and 4 a few px apart end up one gap apart, centred where they were", () => {
    const pts = [{ x: 255, y: 152 }, { x: 263, y: 160 }];
    const off = sideBySide(pts, 36);
    const after = pts.map((p, k) => ({ x: p.x + off[k][0], y: p.y + off[k][1] }));
    expect(after[1].x - after[0].x).toBe(36);
    expect(after[0].y).toBe(after[1].y);
    expect((after[0].x + after[1].x) / 2).toBe(259);
    expect(after[0].y).toBe(156);
  });
  it("keeps input order left to right, three in a row", () => {
    const pts = [{ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 }];
    const xs = sideBySide(pts, 30).map((o, k) => pts[k].x + o[0]);
    expect(xs).toEqual([-25, 5, 35]);
  });
  it("the day map spreads small groups, and its stops wear the legend colours (no ink override)", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "..", "..", "components", "day", "DayMap.tsx"), "utf8").replace(/\r\n/g, "\n");
    expect(src).toContain("sideBySide(row.map(");
    const call = src.slice(src.indexOf("makeMaterialPinElement(\n"), src.indexOf("markerInnerRef.current.set(card.id"));
    expect(call).not.toContain("#1A1A2E");
  });
  it("only small groups spread; a crowd still piles", () => {
    expect(SIDE_BY_SIDE_MAX).toBe(3);
    expect(sideBySide([], 30)).toEqual([]);
  });
});

describe("pileZoom: a tap on a pile always zooms in", () => {
  it("never out, even when fitting into the padding would (his '1 – 4' tap, 3 Oct 2026)", () => {
    expect(pileZoom(13, 12.2)).toBe(14.5);
    expect(pileZoom(13, null)).toBe(14.5);
  });
  it("the day map's pile taps (stops and hotel) both go through it, not a bare fitBounds", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "..", "..", "components", "day", "DayMap.tsx"), "utf8");
    expect(src.match(/zoomToPile\(b\)/g)?.length).toBe(2);
    expect(src).toContain("pileZoom(map.getZoom()");
  });
  it("further in when the fit needs it, capped at street level", () => {
    expect(pileZoom(13, 16)).toBe(16);
    expect(pileZoom(16.5, 18)).toBe(17);
  });
});

const PIN = 44;
const near = PIN * STACK_FACTOR;

describe("stackGroups: which day-map pins stand as one", () => {
  it("a pin half over a stack joins it, even when it's far from the stack's first pin (Paris, 2 Oct 2026)", () => {
    // 2 and 3 on top of each other; 4 half over 3, but more than a pin away from 2.
    const pts = [{ x: 100, y: 200 }, { x: 110, y: 190 }, { x: 145, y: 165 }, { x: 300, y: 300 }];
    expect(stackGroups(pts, near)).toEqual([[0, 1, 2], [3]]);
  });

  it("pins that only just overlap count; pins clearly apart don't", () => {
    expect(stackGroups([{ x: 0, y: 0 }, { x: 46, y: 0 }], near)).toEqual([[0, 1]]);
    expect(stackGroups([{ x: 0, y: 0 }, { x: 60, y: 0 }], near)).toEqual([[0], [1]]);
  });

  it("keeps every pin exactly once, in input order", () => {
    const g = stackGroups([{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 10, y: 0 }], near);
    expect(g.flat().sort()).toEqual([0, 1, 2]);
    expect(g).toContainEqual([0, 2]);
  });
});
