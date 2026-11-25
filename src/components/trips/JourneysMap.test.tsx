// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

/**
 * The map beside Journeys (25 Nov 2026, mocks approved): a dot per journey,
 * buttons that choose which dots show, and a card for the dot you click that
 * opens its journey. Mapbox is played by a stand-in that keeps what it was
 * asked to do: the markers it was given, and where it was told to look.
 */

const fake = vi.hoisted(() => ({
  markers: [] as HTMLElement[],
  looks: [] as { kind: string; arg: unknown }[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handlers: {} as Record<string, (...a: any[]) => void>,
  zoom: 1.2,
  resized: 0,
}));
vi.mock("mapbox-gl", () => {
  class Map {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(e: string, f: (...a: any[]) => void) { fake.handlers[e] = f; if (e === "load") queueMicrotask(() => f()); return this; }
    addControl() { return this; }
    setFog() {}
    fitBounds(b: unknown) { fake.looks.push({ kind: "fit", arg: b }); }
    easeTo(o: unknown) { fake.looks.push({ kind: "ease", arg: o }); }
    getZoom() { return fake.zoom; }
    resize() { fake.resized++; }
    remove() {}
  }
  class Marker {
    el: HTMLElement;
    constructor(o: { element: HTMLElement }) { this.el = o.element; }
    setLngLat() { return this; }
    addTo() { document.body.appendChild(this.el); fake.markers.push(this.el); return this; }
    remove() { this.el.remove(); fake.markers.splice(fake.markers.indexOf(this.el), 1); }
  }
  return { default: { Map, Marker, NavigationControl: class {}, AttributionControl: class {} } };
});
vi.mock("mapbox-gl/dist/mapbox-gl.css", () => ({}));
vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/components/ui/TripCover", () => ({ default: () => null }));

import JourneysMap from "./JourneysMap";
import type { JourneyDot } from "@/lib/journeys/mapDots";

const dot = (id: string, title: string, place: string, lat: number, lng: number, upcoming: boolean, year: number, dates: string): JourneyDot =>
  ({ id, title, place, destination: place, lat, lng, upcoming, year, dates, cover: null, href: `/trips/${id}/plan` });
const dots = [
  dot("aus", "Australia", "Sydney", -33.869, 151.209, false, 2026, "Feb 15–20, 2026"),
  dot("rome", "Rome April 2026", "Rome", 41.903, 12.496, false, 2026, "Apr 22–28, 2026"),
  dot("voss", "Chris Voss Training", "Irving", 32.814, -96.955, true, 2027, "Mar 14–17, 2027"),
  dot("tus", "Tuscany", "Tuscany", 43.567, 10.981, true, 2027, "Aug 24 – Sep 5, 2027"),
];
const ids = () => fake.markers.map((m) => m.getAttribute("data-dot"));
const labelOf = (id: string) => fake.markers.find((m) => m.getAttribute("data-dot") === id)!.querySelector("span:last-child") as HTMLElement;

async function mount() {
  const r = render(<JourneysMap dots={dots} />);
  // the lazy import, then the map's "load"
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  return r;
}

beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "pk.test"); fake.markers.length = 0; fake.looks.length = 0; fake.zoom = 1.2; fake.resized = 0; });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); document.body.innerHTML = ""; });

describe("the Journeys map", () => {
  it("draws one dot per journey, solid for coming up and hollow for taken, and frames them all", async () => {
    await mount();
    expect(ids()).toEqual(["aus", "rome", "voss", "tus"]);
    expect(fake.markers.map((m) => m.getAttribute("data-upcoming"))).toEqual(["no", "no", "yes", "yes"]);
    expect(fake.looks.at(-1)).toMatchObject({ kind: "fit", arg: [[-96.955, -33.869], [151.209, 43.567]] });
  });

  it("the buttons are All, Coming up and the past year; each shows only its journeys and re-frames the map", async () => {
    await mount();
    expect(screen.getAllByRole("button", { pressed: true }).map((b) => b.textContent)).toEqual(["All"]);
    expect(["All", "Coming up", "2026"].every((n) => screen.getByRole("button", { name: n }))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Coming up" }));
    expect(ids()).toEqual(["voss", "tus"]);
    expect(fake.looks.at(-1)).toMatchObject({ kind: "fit", arg: [[-96.955, 32.814], [10.981, 43.567]] });
    fireEvent.click(screen.getByRole("button", { name: "2026" }));
    expect(ids()).toEqual(["aus", "rome"]);
  });

  it("a dot shows its journey's card; the card opens the journey; an empty spot on the map closes it", async () => {
    await mount();
    expect(screen.queryByTestId("journey-dot-card")).toBeNull();
    fireEvent.click(fake.markers.find((m) => m.getAttribute("data-dot") === "rome")!);
    const card = screen.getByTestId("journey-dot-card");
    expect(card.getAttribute("href")).toBe("/trips/rome/plan");
    expect(card.textContent).toContain("Rome April 2026");
    expect(card.textContent).toContain("Apr 22–28, 2026");
    act(() => fake.handlers.click());
    expect(screen.queryByTestId("journey-dot-card")).toBeNull();
  });

  it("choosing another button closes a card left open", async () => {
    await mount();
    fireEvent.click(fake.markers.find((m) => m.getAttribute("data-dot") === "rome")!);
    fireEvent.click(screen.getByRole("button", { name: "Coming up" }));
    expect(screen.queryByTestId("journey-dot-card")).toBeNull();
  });

  it("names a journey coming up; names a past one only when picked or zoomed in", async () => {
    await mount();
    expect(labelOf("voss").style.display).toBe("");
    expect(labelOf("rome").style.display).toBe("none");
    fireEvent.click(fake.markers.find((m) => m.getAttribute("data-dot") === "rome")!);
    expect(labelOf("rome").style.display).toBe("");
    act(() => fake.handlers.click());
    expect(labelOf("rome").style.display).toBe("none");
    fake.zoom = 4;
    act(() => fake.handlers.zoom());
    expect(labelOf("rome").style.display).toBe("");
  });

  it("with no map key there is no map, no buttons and no crash", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "");
    await mount();
    expect(screen.queryByTestId("journeys-map")).toBeNull();
    expect(fake.markers).toEqual([]);
  });
});

describe("the Journeys map on a phone", () => {
  const mountPhone = async () => {
    const r = render(<JourneysMap dots={dots} phone />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    return r;
  };
  const rows = () => Array.from(screen.getByTestId("journeys-map-rows").querySelectorAll("[data-journey-row]"));

  it("lists the journeys on the map under it, the ones coming up first, each a link to its journey", async () => {
    await mountPhone();
    expect(rows().map((r) => r.getAttribute("data-journey-row"))).toEqual(["tus", "voss", "rome", "aus"]);
    expect(rows()[0].getAttribute("href")).toBe("/trips/tus/plan");
    expect(rows()[0].textContent).toContain("Aug 24 – Sep 5, 2027");
  });

  it("the buttons narrow the list and the dots together", async () => {
    await mountPhone();
    fireEvent.click(screen.getByRole("button", { name: "2026" }));
    expect(rows().map((r) => r.getAttribute("data-journey-row"))).toEqual(["rome", "aus"]);
    expect(ids()).toEqual(["aus", "rome"]);
  });

  it("a dot picks out its row instead of floating a card over the small map", async () => {
    await mountPhone();
    fireEvent.click(fake.markers.find((m) => m.getAttribute("data-dot") === "rome")!);
    expect(screen.queryByTestId("journey-dot-card")).toBeNull();
    expect(rows().filter((r) => r.getAttribute("aria-current") === "true").map((r) => r.getAttribute("data-journey-row"))).toEqual(["rome"]);
    act(() => fake.handlers.click());
    expect(rows().some((r) => r.getAttribute("aria-current") === "true")).toBe(false);
  });

  it("a dot is a thumb-sized target", async () => {
    await mountPhone();
    expect(fake.markers.every((m) => m.className.includes("h-11") && m.className.includes("w-11"))).toBe(true);
  });
});
