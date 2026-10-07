// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import type { Card, Day, Trip } from "@/types/database";

/**
 * Find on the plan board between 768 and 1023px (6 Oct 2026, taps audit).
 * The map panel beside the week is `hidden lg:block`, and Find opened docked
 * inside that panel, so "Find places" did nothing at tablet / narrow-laptop
 * width (and Start here stepped aside for a sheet nobody could see). Below lg
 * Find now opens as the phone's half sheet, on the page itself.
 */

// The lazy sheets: a stub that keeps the dock it was given.
const seen = vi.hoisted(() => ({ dock: "unset" as string | undefined }));
vi.mock("next/dynamic", () => ({
  default: () => function LazySheet(props: Record<string, unknown>) {
    if ("onDrafted" in props) return <div role="dialog" aria-label="Plan my trip" />;
    seen.dock = props.dock as string | undefined;
    return <div role="dialog" aria-label="Find places" data-dock={String(props.dock)} />;
  },
}));
vi.mock("mapbox-gl", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inert: any = new Proxy(function () {}, {
    get: (t, k) => (k === "then" ? undefined : k === Symbol.toPrimitive ? () => 0 : k in t ? (t as unknown as Record<string | symbol, unknown>)[k] : inert),
    apply: () => inert,
    construct: () => inert,
  });
  return { default: inert };
});
vi.mock("mapbox-gl/dist/mapbox-gl.css", () => ({}));
vi.mock("@phosphor-icons/react", () => ({ Funnel: () => null, Heart: () => null }));
vi.mock("@/hooks/useWarmFind", () => ({ useWarmFind: () => undefined }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/map/MapPinPopup", () => ({ default: () => null }));
vi.mock("@/components/map/PlaceSearch", () => ({ default: () => null }));
vi.mock("@/components/map/AddToTripSheet", () => ({ default: () => null }));
vi.mock("@/components/map/WhereToStaySheet", () => ({ default: () => null }));
vi.mock("@/components/map/MapSidebar", () => ({ GROUPS: [] }));

import WeekMap from "./WeekMap";

const trip = { id: "t1", title: "Test", destination: "Romania", destination_lat: 45.9, destination_lng: 24.9, start_date: "2026-10-05", end_date: "2026-10-07" } as unknown as Trip;
const days = [1, 2, 3].map((n) => ({ id: `d${n}`, trip_id: "t1", day_number: n, date: `2026-10-0${4 + n}` })) as unknown as Day[];

function setWidth(lg: boolean) {
  window.matchMedia = ((q: string) => ({ matches: q.includes("1024") ? lg : false, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
}

const props = {
  trip, days, cards: [] as Card[], hoveredId: null, activeDayId: null,
  onHover: () => {}, onCardUpdate: () => {}, onCardCreated: () => {}, onCardDelete: () => {}, onDraftCreated: () => {},
};

beforeEach(() => { seen.dock = "unset"; });
afterEach(cleanup);

describe("Find on the plan board", () => {
  it("below lg, opens as the half sheet on the page, not docked inside the hidden map panel", () => {
    setWidth(false);
    const { container } = render(<div className="hidden lg:block"><WeekMap {...props} /></div>);
    act(() => { window.dispatchEvent(new Event("roam:open-find")); });
    const sheet = screen.getByRole("dialog", { name: "Find places" });
    expect(seen.dock).toBeUndefined();
    // On the page, outside the panel that is display:none below lg.
    expect(container.contains(sheet)).toBe(false);
    expect(sheet.parentElement).toBe(document.body);
  });

  it("from lg, still docks beside the map (unchanged)", () => {
    setWidth(true);
    const { container } = render(<WeekMap {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Find places" }));
    const sheet = screen.getByRole("dialog", { name: "Find places" });
    expect(seen.dock).toBe("beside");
    expect(container.contains(sheet)).toBe(true);
  });

  it("with the map widened (shown at every width), docks inside it", () => {
    setWidth(false);
    render(<WeekMap {...props} wide />);
    act(() => { window.dispatchEvent(new Event("roam:open-find")); });
    expect(seen.dock).toBe("inside");
  });
});
