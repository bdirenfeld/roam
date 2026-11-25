// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

/**
 * Journeys' Map button (25 Nov 2026): on a phone and on a computer the map
 * sits behind one button. It is only asked for once Map is pressed, and List
 * (or Escape) puts the journeys back.
 */

const asked = vi.hoisted(() => ({ times: 0, phone: undefined as unknown }));
vi.mock("next/dynamic", () => ({
  default: () => function LazyMap({ dots, phone }: { dots: unknown[]; phone?: boolean }) { asked.times++; asked.phone = phone; return <div data-testid="lazy-map">{dots.length} dots</div>; },
}));

import JourneysMapButton from "./JourneysMapButton";
import type { JourneyDot } from "@/lib/journeys/mapDots";

const dots = [{ id: "a" }, { id: "b" }, { id: "c" }] as unknown as JourneyDot[];
const toggle = () => screen.getByTestId("journeys-map-toggle");
afterEach(() => { cleanup(); asked.times = 0; asked.phone = undefined; document.body.style.overflow = ""; });

describe("the Map button on Journeys", () => {
  it("starts as a Map button over the list, with no map drawn or asked for", () => {
    render(<JourneysMapButton dots={dots} phone={false} />);
    expect(toggle().textContent).toBe("Map");
    expect(screen.queryByTestId("journeys-map-sheet")).toBeNull();
    expect(asked.times).toBe(0);
  });

  it("on a computer, Map opens the map under the 64px masthead in its computer shape, and the button becomes List", () => {
    render(<JourneysMapButton dots={dots} phone={false} />);
    fireEvent.click(toggle());
    expect(screen.getByTestId("journeys-map-sheet").className).toContain("top-16");
    expect(screen.getByTestId("lazy-map").textContent).toBe("3 dots");
    expect(asked.phone).toBe(false);
    expect(toggle().textContent).toBe("List");
  });

  it("on a phone, the map opens under the 57px header in its phone shape", () => {
    render(<JourneysMapButton dots={dots} phone />);
    fireEvent.click(toggle());
    expect(screen.getByTestId("journeys-map-sheet").className).toContain("top-[57px]");
    expect(asked.phone).toBe(true);
  });

  it("List puts the journeys back", () => {
    render(<JourneysMapButton dots={dots} phone={false} />);
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(screen.queryByTestId("journeys-map-sheet")).toBeNull();
    expect(toggle().textContent).toBe("Map");
  });

  it("Escape puts the journeys back too, and does nothing when the map is not open", () => {
    render(<JourneysMapButton dots={dots} phone={false} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(toggle().textContent).toBe("Map");
    fireEvent.click(toggle());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("journeys-map-sheet")).toBeNull();
    expect(toggle().textContent).toBe("Map");
  });

  it("the list behind does not scroll while the map is open, and scrolls again after", () => {
    render(<JourneysMapButton dots={dots} phone />);
    fireEvent.click(toggle());
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(toggle());
    expect(document.body.style.overflow).toBe("");
  });
});
