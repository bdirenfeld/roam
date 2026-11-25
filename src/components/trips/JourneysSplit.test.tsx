// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

/**
 * Journeys' two sides (25 Nov 2026): the journeys, a seam that drags and is
 * remembered, and the map, which is only asked for on a wide window.
 */

vi.mock("next/dynamic", () => ({ default: () => function LazyMap({ dots }: { dots: unknown[] }) { return <div data-testid="lazy-map">{dots.length} dots</div>; } }));

import JourneysSplit from "./JourneysSplit";
import { JOURNEYS_MAP_WIDTH_KEY, LEFT_MIN, MAP_MIN } from "@/lib/journeys/split";
import type { JourneyDot } from "@/lib/journeys/mapDots";

const dots = [{ id: "a" }, { id: "b" }] as unknown as JourneyDot[];
function setWidth(lg: boolean) {
  window.matchMedia = ((q: string) => ({ matches: lg, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
}
function frameIs(width: number) {
  const frame = screen.getByTestId("journeys-split");
  frame.getBoundingClientRect = () => ({ left: 0, right: width, width, top: 0, bottom: 800, height: 800, x: 0, y: 0, toJSON: () => ({}) });
}
const panelWidth = () => screen.getByTestId("journeys-map-panel").style.width;
function drag(toX: number) {
  fireEvent.pointerDown(screen.getByTestId("journeys-seam"), { button: 0 });
  act(() => { window.dispatchEvent(new MouseEvent("pointermove", { clientX: toX })); });
  act(() => { window.dispatchEvent(new MouseEvent("pointerup")); });
}

beforeEach(() => { localStorage.clear(); setWidth(true); });
afterEach(cleanup);

describe("Journeys beside its map", () => {
  it("shows the journeys and, on a wide window, the map with every dot", () => {
    render(<JourneysSplit dots={dots}><p>the journeys</p></JourneysSplit>);
    expect(screen.getByText("the journeys")).toBeTruthy();
    expect(screen.getByTestId("lazy-map").textContent).toBe("2 dots");
  });

  it("below 1024px the map is never asked for", () => {
    setWidth(false);
    render(<JourneysSplit dots={dots}><p>the journeys</p></JourneysSplit>);
    expect(screen.getByText("the journeys")).toBeTruthy();
    expect(screen.queryByTestId("lazy-map")).toBeNull();
  });

  it("until it is dragged the map takes its share of the page", () => {
    render(<JourneysSplit dots={dots}><p>x</p></JourneysSplit>);
    expect(panelWidth()).toBe("58%");
  });

  it("dragging the seam sets the map's width and remembers it", () => {
    render(<JourneysSplit dots={dots}><p>x</p></JourneysSplit>);
    frameIs(1920);
    drag(1020);
    expect(panelWidth()).toBe("900px");
    expect(localStorage.getItem(JOURNEYS_MAP_WIDTH_KEY)).toBe("900");
  });

  it("the seam stops at both limits", () => {
    render(<JourneysSplit dots={dots}><p>x</p></JourneysSplit>);
    frameIs(1920);
    drag(1900);
    expect(panelWidth()).toBe(`${MAP_MIN}px`);
    drag(10);
    expect(panelWidth()).toBe(`${1920 - LEFT_MIN}px`);
  });

  it("opens at the width it was left at", () => {
    localStorage.setItem(JOURNEYS_MAP_WIDTH_KEY, "777");
    render(<JourneysSplit dots={dots}><p>x</p></JourneysSplit>);
    expect(panelWidth()).toBe("777px");
  });

  it("a nonsense remembered width is ignored", () => {
    localStorage.setItem(JOURNEYS_MAP_WIDTH_KEY, "12");
    render(<JourneysSplit dots={dots}><p>x</p></JourneysSplit>);
    expect(panelWidth()).toBe("58%");
  });
});
