// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { coverFrom, inView, centreOffset, pulseAt, showAt, focusZoom, PULSE_MS } from "./pulse";

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
  function fakes(projected: { x: number; y: number }, zoom = 12) {
    const added: HTMLElement[] = [], removed: HTMLElement[] = [];
    const container = document.createElement("div");
    container.getBoundingClientRect = () => ({ ...phone, x: 0, y: 0, width: 390, height: 844, toJSON: () => ({}) });
    const m = { getContainer: () => container, project: () => projected, getZoom: () => zoom, easeTo: vi.fn() };
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
    expect(f.m.easeTo).toHaveBeenCalledWith({ center: [10.5, 43.8], zoom: 12, offset: [0, -211], duration: 700 });
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
  it("a Europe-sized view zooms in to town level, even when the place is in view (Brennan, 1 Oct 2026)", () => {
    const f = fakes({ x: 200, y: 200 }, 4.5);
    pulseAt(f.mb, f.m, 10.5, 43.8, f.sheet);
    expect(f.m.easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [10.5, 43.8], zoom: 11 }));
  });
});

describe("the place you are reading about", () => {
  it("town level only when zoomed out past a region; closer, your zoom is kept", () => {
    expect(focusZoom(4.5)).toBe(11);
    expect(focusZoom(9.9)).toBe(11);
    expect(focusZoom(10)).toBe(10);
    expect(focusZoom(14)).toBe(14);
  });

  it("drops a purple pin with the place's name, centres the map on it, and hands it back to take away", () => {
    const added: HTMLElement[] = [], removed: HTMLElement[] = [];
    const container = document.createElement("div");
    container.getBoundingClientRect = () => ({ left: 0, top: 0, right: 390, bottom: 844, x: 0, y: 0, width: 390, height: 844, toJSON: () => ({}) });
    const m = { getContainer: () => container, project: () => ({ x: 200, y: 200 }), getZoom: () => 13, easeTo: vi.fn() };
    class Marker {
      el: HTMLElement;
      constructor(o: { element: HTMLElement }) { this.el = o.element; }
      setLngLat() { return this; }
      addTo() { added.push(this.el); return this; }
      remove() { removed.push(this.el); }
    }
    const pin = showAt({ Marker }, m, 10.5, 43.8, null, "Devil's Bridge");
    // Already in view and close enough, and still centred: opening a place says where it is.
    expect(m.easeTo).toHaveBeenCalledWith({ center: [10.5, 43.8], zoom: 13, offset: [0, 0], duration: 700 });
    expect(added[0].dataset.preview).toBe("1");
    // Navy with an orange ring, not purple: purple is every food pin (2 Oct 2026).
    expect(added[0].innerHTML).toContain('fill="#1A1A2E" stroke="#B0541F"');
    expect(added[0].innerHTML).not.toContain("#7C3AED");
    // Its name beside it: food pins are purple too (live check on the Europe trip, 1 Oct 2026).
    expect(added[0].textContent).toBe("Devil's Bridge");
    pin!.remove();
    expect(removed).toEqual(added);
  });
});
