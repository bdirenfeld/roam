// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { coverFrom, inView, centreOffset, pulseAt, PULSE_MS } from "./pulse";

/** Where a Find save lands (1 Oct 2026): the map glides only when the place is hidden, then rings it. */

const map = { left: 800, top: 64, right: 1500, bottom: 900 }; // the week's map pane on a computer
const phone = { left: 0, top: 0, right: 390, bottom: 844 };

describe("what the Find sheet hides", () => {
  it("beside the map, over the week: nothing", () => {
    expect(coverFrom(map, { left: 390, top: 76, right: 790, bottom: 888 })).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
  it("inside a widened map, on the left: its width", () => {
    expect(coverFrom(map, { left: 812, top: 76, right: 1212, bottom: 888 })).toEqual({ top: 0, right: 0, bottom: 0, left: 412 });
  });
  it("the phone's half sheet: the bottom half", () => {
    expect(coverFrom(phone, { left: 0, top: 422, right: 390, bottom: 844 })).toEqual({ top: 0, right: 0, bottom: 422, left: 0 });
  });
  it("no sheet: nothing", () => {
    expect(coverFrom(map, null).bottom).toBe(0);
  });
});

describe("in view", () => {
  const cover = { top: 0, right: 0, bottom: 422, left: 0 };
  it("above the half sheet is seen; under it is not", () => {
    expect(inView({ x: 200, y: 200 }, 390, 844, cover)).toBe(true);
    expect(inView({ x: 200, y: 600 }, 390, 844, cover)).toBe(false);
    expect(inView({ x: 200, y: 410 }, 390, 844, cover)).toBe(false); // inside the margin
  });
  it("the glide centres the place in the uncovered part", () => {
    expect(centreOffset(cover)).toEqual([0, -211]);
    expect(centreOffset({ top: 0, right: 0, bottom: 0, left: 412 })).toEqual([206, 0]);
  });
});

describe("pulseAt", () => {
  function fakes(projected: { x: number; y: number }) {
    const added: HTMLElement[] = [], removed: HTMLElement[] = [];
    const container = document.createElement("div");
    container.getBoundingClientRect = () => ({ ...phone, x: 0, y: 0, width: 390, height: 844, toJSON: () => ({}) });
    const m = { getContainer: () => container, project: () => projected, easeTo: vi.fn() };
    class Marker {
      el: HTMLElement;
      constructor(o: { element: HTMLElement }) { this.el = o.element; }
      setLngLat() { return this; }
      addTo() { added.push(this.el); return this; }
      remove() { removed.push(this.el); }
    }
    const sheet = document.createElement("div");
    sheet.getBoundingClientRect = () => ({ left: 0, top: 422, right: 390, bottom: 844, x: 0, y: 422, width: 390, height: 422, toJSON: () => ({}) });
    return { m, mb: { Marker }, added, removed, sheet };
  }

  it("a place under the sheet: the map glides it into the top half, then it rings and the ring goes", () => {
    vi.useFakeTimers();
    const f = fakes({ x: 200, y: 700 });
    pulseAt(f.mb, f.m, 10.5, 43.8, f.sheet);
    expect(f.m.easeTo).toHaveBeenCalledWith({ center: [10.5, 43.8], offset: [0, -211], duration: 600 });
    expect(f.added).toHaveLength(1);
    expect(f.added[0].dataset.pulse).toBe("1");
    vi.advanceTimersByTime(PULSE_MS + 500);
    expect(f.removed).toEqual(f.added);
    vi.useRealTimers();
  });

  it("a place already in view: no glide, just the ring", () => {
    const f = fakes({ x: 200, y: 200 });
    pulseAt(f.mb, f.m, 10.5, 43.8, f.sheet);
    expect(f.m.easeTo).not.toHaveBeenCalled();
    expect(f.added).toHaveLength(1);
  });
});
