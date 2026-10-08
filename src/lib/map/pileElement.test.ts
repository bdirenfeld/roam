// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { makePileElement } from "./pileElement";
import { pileLabel } from "./pinLayout";

const C = { food: "#7C3AED", activity: "#0D9488", logistics: "#111827" };

describe("pileLabel: the strip and the map say the same thing", () => {
  it("Brennan's Lucca Tuesday: the hotel (4) is apart, so the pile is 1–3 and 5–7, not 1–7", () => {
    expect(pileLabel([1, 2, 3, 5, 6, 7])).toBe("1–3 · 5–7");
  });
  it("short runs one by one", () => {
    expect(pileLabel([2, 4])).toBe("2 · 4");
    expect(pileLabel([1, 2, 5])).toBe("1 · 2 · 5");
    expect(pileLabel([4, 1, 3, 2])).toBe("1–4");
  });
});

describe("makePileElement: one pile pin for both maps", () => {
  it("the day's pile: label, legend ring, a size up, tappable by name", () => {
    const el = makePileElement({ label: "1–3 · 5–7", counts: { food: 4, activity: 2 }, colours: C, day: true, ariaLabel: "Stops 1–3 · 5–7" });
    expect(el.textContent).toBe("1–3 · 5–7");
    expect(el.style.background).toContain("conic-gradient");
    expect(el.style.minWidth).toBe("48px");
    expect(el.getAttribute("role")).toBe("button");
    expect(el.dataset.pile).toBe("day");
  });
  it("saved places muted when a day is chosen, 44px", () => {
    const el = makePileElement({ label: "5", counts: { food: 5 }, colours: C, day: false, ariaLabel: "5 places here", muted: 0.22 });
    expect(el.style.opacity).toBe("0.22");
    expect(el.style.minWidth).toBe("44px");
  });
});
