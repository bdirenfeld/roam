// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import type { Card, Day, Trip } from "@/types/database";

/**
 * The phone Map (FullMapClient), rendered without Mapbox (no token in tests,
 * so the canvas is the "Map unavailable" box and every control around it is
 * real). Two bugs Brennan found on his phone on a new Romania journey, 2 Oct 2026:
 *
 * 1. "If I click Plan My Trip, it takes me back to the day ... but it doesn't
 *    refresh." The day had been opened (or prefetched beside the day he was on)
 *    seconds before, and Next's router served that copy, from before the plan.
 *    The Vercel log showed no request for the day after the insert. The map now
 *    refreshes first, which empties the router's cache, and opens the day once
 *    the refreshed map has the new cards.
 * 2. "On the map now, I can't see buttons for the legend or anything at the
 *    bottom." Find's half sheet (fixed, z-70, 50dvh) sat over the Filter /
 *    Plan my trip row for as long as Find was open, and its ✕ scrolls away
 *    with the controls. The row now rides above the half sheet.
 */

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams() }));
// The two lazy sheets: a stub that keeps the props it was given.
const sheets = vi.hoisted(() => ({} as Record<string, Record<string, (...a: unknown[]) => void>>));
vi.mock("next/dynamic", () => ({
  default: () => function LazySheet(props: Record<string, (...a: unknown[]) => void>) {
    const kind = "onDrafted" in props ? "plan" : "find";
    sheets[kind] = props;
    return <div role="dialog" aria-label={kind === "plan" ? "Plan my trip" : "Find places"} />;
  },
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@phosphor-icons/react", () => ({ Funnel: () => null, Heart: () => null, Files: () => null }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/search/GlobalSearch", () => ({ useGlobalSearch: () => ({ open: vi.fn() }) }));
// jsdom has no WebGL: with a token set, the real Map rejects after the test
// ends ("Failed to initialize WebGL") and npm test exits 1. An inert stand-in:
// every property, call and `new` returns itself.
vi.mock("mapbox-gl", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inert: any = new Proxy(function () {}, {
    get: (t, k) => (k === "then" ? undefined : k === Symbol.toPrimitive ? () => 0 : k in t ? (t as unknown as Record<string | symbol, unknown>)[k] : inert),
    apply: () => inert,
    construct: () => inert,
  });
  return { default: inert };
});
vi.mock("@/hooks/useWarmFind", () => ({ useWarmFind: () => undefined }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from: () => ({}) }) }));
vi.mock("./MapSidebar", () => ({ default: () => null, GROUPS: [], SIDEBAR_SUB_TYPES: [] }));
vi.mock("./MapPinPopup", () => ({ default: () => null }));
vi.mock("./PlaceSearch", () => ({ default: () => null }));
vi.mock("./AddToTripSheet", () => ({ default: () => null }));
vi.mock("./WhereToStaySheet", () => ({ default: () => null }));
vi.mock("@/components/plan/ConfirmationPreviewSheet", () => ({ default: () => null }));
vi.mock("@/components/plan/DocumentsSheet", () => ({ default: () => null }));
vi.mock("@/components/ui/AppMenu", () => ({ default: () => null }));
vi.mock("@/components/ui/JourneyHeader", () => ({ default: () => null, HEADER_GLYPH: "" }));

import FullMapClient from "./FullMapClient";

// The Romania test journey's shape: three days, places saved with Find, none on a day yet.
const trip = { id: "t1", title: "Test", destination: "Romania", destination_lat: 45.9, destination_lng: 24.9, start_date: "2026-10-05", end_date: "2026-10-07", party_size: 5, party_ages: [40, 40, 8, 6, 3] } as unknown as Trip;
const days = [1, 2, 3].map((n) => ({ id: `d${n}`, trip_id: "t1", day_number: n, date: `2026-10-0${4 + n}` })) as unknown as Day[];
const saved = (id: string, title: string, lat: number, lng: number) => ({
  id, trip_id: "t1", day_id: null, status: "interested", position: 0, details: {}, start_time: null, end_time: null, place_id: "p" + id,
  place: { id: "p" + id, title, type: "activity", sub_type: "self_directed", lat, lng, address: null, google_place_id: "g" + id },
}) as unknown as Card;
const cards = [saved("c1", "Bran Castle", 45.515, 25.367), saved("c2", "Rupea Citadel", 46.039, 25.214), saved("c3", "Aquatic Paradise", 45.66, 25.6)];

beforeEach(() => {
  Object.values(router).forEach((f) => f.mockClear());
  for (const k of Object.keys(sheets)) delete sheets[k];
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
});

/** The row along the bottom of the map: Filter, Plan my trip, Find places. */
const bottomRow = () => screen.getByRole("button", { name: /^Filter/ }).closest("div.absolute") as HTMLElement;

describe("the phone Map", { timeout: 20000 }, () => {
  it("after Plan my trip, opens the day only once the router has fresh data, so the planned stops show (bug 1)", async () => {
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<FullMapClient trip={trip} days={days} cards={cards} />); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Plan my trip" })); });
    const planned = [
      { ...cards[1], id: "n1", status: "in_itinerary", day_id: "d1", start_time: "09:45:00" },
      { ...cards[2], id: "n2", status: "in_itinerary", day_id: "d2", start_time: "11:00:00" },
    ] as unknown as Card[];
    await act(async () => { sheets.plan.onDrafted(planned); });
    // Not straight to the day: a day opened a moment ago would come out of the cache as it was.
    expect(router.refresh).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    // The refreshed map arrives with the planned cards: now the first day opens, fetched fresh.
    await act(async () => { r.rerender(<FullMapClient trip={trip} days={days} cards={[...cards, ...planned]} />); });
    expect(router.push).toHaveBeenCalledWith("/trips/t1/days/d1");
    expect(router.refresh.mock.invocationCallOrder[0]).toBeLessThan(router.push.mock.invocationCallOrder[0]);
  });

  it("with Find open, Filter and Plan my trip sit above the half sheet, not under it (bug 2)", async () => {
    await act(async () => { render(<FullMapClient trip={trip} days={days} cards={cards} />); });
    // jsdom garbles the env() half of the value, so the 16 px is what is read.
    expect(bottomRow().style.bottom).toMatch(/^calc\(16px/);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Find places" })); });
    expect(screen.getByRole("dialog", { name: "Find places" })).toBeTruthy();
    // The half sheet is 50dvh from the bottom of the screen; the row clears it.
    expect(bottomRow().style.bottom).toBe("calc(50dvh + 12px)");
    expect(screen.getByRole("button", { name: "Plan my trip" })).toBeTruthy();
    // Find is the open sheet, so its own chip is not offered twice.
    expect(screen.queryByRole("button", { name: "Find places" })).toBeNull();
    // Raised to 88dvh the sheet is for reading; the row steps aside rather than hide under it.
    await act(async () => { sheets.find.onTall(true); });
    expect(screen.queryByRole("button", { name: /^Filter/ })).toBeNull();
    await act(async () => { sheets.find.onTall(false); });
    expect(bottomRow().style.bottom).toBe("calc(50dvh + 12px)");
    // Closed: back at the bottom, all three.
    await act(async () => { sheets.find.onClose(); });
    expect(screen.queryByRole("dialog", { name: "Find places" })).toBeNull();
    expect(bottomRow().style.bottom).toMatch(/^calc\(16px/);
    expect(screen.getByRole("button", { name: "Find places" })).toBeTruthy();
  });

  it("a place saved in Find lands on the map at once, without a reload (Hanoi, 2 Oct 2026)", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "pk.test");
    await act(async () => { render(<FullMapClient trip={trip} days={days} cards={[]} />); });
    expect(screen.getByText(/^(Nothing on the map yet|Start your map)$/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Find places" })); });
    // Find open: its sheet says what to do, so the empty-map card steps aside.
    expect(screen.queryByText(/^(Nothing on the map yet|Start your map)$/)).toBeNull();
    await act(async () => { sheets.find.onClose(); });
    expect(screen.getByText(/^(Nothing on the map yet|Start your map)$/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Find places" })); });
    await act(async () => { sheets.find.onSaved(cards[0]); });
    expect(screen.queryByText(/^(Nothing on the map yet|Start your map)$/)).toBeNull();
    // Saving the same place again (or the refresh bringing it back) doesn't double it.
    await act(async () => { sheets.find.onSaved(cards[0]); });
    // Closed again: the pin is on the map, so the empty-map card stays gone.
    await act(async () => { sheets.find.onClose(); });
    expect(screen.queryByText(/^(Nothing on the map yet|Start your map)$/)).toBeNull();
    vi.unstubAllEnvs();
  });

  it("closing Find puts a page the keyboard scrolled back at the top, so the header shows (3 Oct 2026)", async () => {
    await act(async () => { render(<FullMapClient trip={trip} days={days} cards={cards} />); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Find places" })); });
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    Object.defineProperty(window, "scrollY", { value: 140, configurable: true });
    await act(async () => { sheets.find.onClose(); });
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  it("Plan my trip from above Find closes Find, so the two sheets never stack", async () => {
    await act(async () => { render(<FullMapClient trip={trip} days={days} cards={cards} />); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Find places" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Plan my trip" })); });
    expect(screen.getByRole("dialog", { name: "Plan my trip" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Find places" })).toBeNull();
  });

  it("every way onto a day from the map goes through the fresh push, never a bare router.push", () => {
    const src = readFileSync("src/components/map/FullMapClient.tsx", "utf8");
    // Plan my trip's day and the pick tray's day: both were bare pushes on 2 Oct 2026.
    expect(src).not.toMatch(/router\.push\([^)]*days/);
    expect((src.match(/freshPush\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("Mapbox's own zoom and locate ride above Find's half sheet too, as they do above Where to stay", () => {
    // No token in tests, so the canvas is not drawn; the class and the rule are read instead.
    expect(readFileSync("src/components/map/FullMapClient.tsx", "utf8")).toMatch(/findOpen && !findTall \? "find-open"/);
    expect(readFileSync("src/app/globals.css", "utf8")).toMatch(/\.find-open \.mapboxgl-ctrl-bottom-right \{ bottom: 50dvh; \}/);
  });
});
