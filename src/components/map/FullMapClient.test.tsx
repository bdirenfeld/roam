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
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast }) }));
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
// The writes onto a day: a stand-in that hands back the card it was asked for (7 Oct 2026).
const schedule = vi.hoisted(() => vi.fn(async (_s: unknown, a: { dayId: string; placeId: string; place: unknown; startTime?: string | null; endTime?: string | null }) => ({
  id: "new-" + a.dayId, trip_id: "t1", day_id: a.dayId, place_id: a.placeId, place: a.place, status: "in_itinerary",
  start_time: a.startTime ?? null, end_time: a.endTime ?? null, details: {}, position: 0,
})));
vi.mock("@/lib/scheduleCard", async (orig) => ({ ...(await orig<object>()), scheduleCardOnDay: schedule }));
const qdel = vi.hoisted(() => vi.fn(async () => ({ error: null })));
vi.mock("@/lib/offline/queuedWrite", async (orig) => ({ ...(await orig<object>()), queuedDelete: qdel }));
vi.mock("@/hooks/useWarmFind", () => ({ useWarmFind: () => undefined }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from: () => ({}) }) }));
vi.mock("./MapSidebar", () => ({ default: () => null, GROUPS: [], SIDEBAR_SUB_TYPES: [] }));
// The popup and the search keep the props they were given (6 Oct 2026, taps audit).
const seen = vi.hoisted(() => ({} as Record<string, Record<string, unknown>>));
vi.mock("./MapPinPopup", () => ({ default: (p: Record<string, unknown>) => { seen.popup = p; return null; } }));
const lookup = vi.hoisted(() => vi.fn(async () => null));
vi.mock("./lookupPlace", () => ({ lookupPlace: lookup, TEMP_PIN_SVG: "" }));
vi.mock("./PlaceSearch", () => ({ default: (p: Record<string, unknown>) => { seen.search = p; return null; } }));
vi.mock("./AddToTripSheet", () => ({ default: (p: Record<string, unknown>) => { seen.add = p; return null; } }));
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

  // 7 Oct 2026, Brennan: "If you delete a pin from a map ... the legend at the
  // bottom disappears on mobile." With Find open the toast stood 8px above the
  // half sheet, which is where this row rides, so "Removed from the map · Undo"
  // covered it. The row is marked for the toast to stand above (ui/Toast toastClearTop).
  it("the bottom row is a control the toast stands above, never on (pin removed with Find open)", async () => {
    await act(async () => { render(<FullMapClient trip={trip} days={days} cards={cards} />); });
    expect(bottomRow().hasAttribute("data-toast-clear")).toBe(true);
    // And the Toast reads that same marker.
    expect(readFileSync("src/components/ui/Toast.tsx", "utf8")).toContain('querySelectorAll<HTMLElement>("[data-toast-clear]")');
  });

  it("a place saved in Find lands on the map at once, without a reload (Hanoi, 2 Oct 2026)", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "pk.test");
    await act(async () => { render(<FullMapClient trip={trip} days={days} cards={[]} />); });
    expect(screen.getByText(/^Nothing on the map yet$/)).toBeTruthy();
    // The 45-word first-visit intro and its Got it are gone (6 Oct 2026, delight audit).
    expect(screen.queryByText("Start your map")).toBeNull();
    expect(screen.queryByRole("button", { name: "Got it" })).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Find places" })); });
    // Find open: its sheet says what to do, so the empty-map card steps aside.
    expect(screen.queryByText(/^Nothing on the map yet$/)).toBeNull();
    await act(async () => { sheets.find.onClose(); });
    expect(screen.getByText(/^Nothing on the map yet$/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Find places" })); });
    await act(async () => { sheets.find.onSaved(cards[0]); });
    expect(screen.queryByText(/^Nothing on the map yet$/)).toBeNull();
    // Saving the same place again (or the refresh bringing it back) doesn't double it.
    await act(async () => { sheets.find.onSaved(cards[0]); });
    // Closed again: the pin is on the map, so the empty-map card stays gone.
    await act(async () => { sheets.find.onClose(); });
    expect(screen.queryByText(/^Nothing on the map yet$/)).toBeNull();
    vi.unstubAllEnvs();
  });

  it("a card the server sends after a refresh (a stay picked in Where to stay) lands on the map without a reload (Muskoka, 3 Oct 2026)", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "pk.test");
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<FullMapClient trip={trip} days={days} cards={[]} />); });
    expect(screen.getByText(/^Nothing on the map yet$/)).toBeTruthy();
    const stay = { ...saved("h1", "Lake of Bays cottage", 45.32, -79.04), status: "in_itinerary", day_id: "d1", place: { ...saved("h1", "x", 45.32, -79.04).place, type: "logistics", sub_type: "hotel" } } as unknown as Card;
    await act(async () => { r.rerender(<FullMapClient trip={trip} days={days} cards={[stay]} />); });
    expect(screen.queryByText(/^Nothing on the map yet$/)).toBeNull();
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

  it("the pick tray shows at every width: Pick more and a long press start picking on a computer too (6 Oct 2026, taps audit)", () => {
    // Picking needs a pin tapped on a drawn map (no token in tests), so the tray's own markup is read.
    const src = readFileSync("src/components/map/FullMapClient.tsx", "utf8").replace(/\r\n/g, "\n");
    const at = src.indexOf("{pickMode && pickedIds.size > 0 && !readOnly && (");
    expect(at).toBeGreaterThan(-1);
    const tray = src.slice(at, src.indexOf("\n", src.indexOf("<div", at)));
    expect(tray).toMatch(/className="absolute left-3 right-3/);
    expect(tray).not.toMatch(/md:hidden/);
  });
});

describe("map search: a place already on the map (6 Oct 2026, taps audit)", () => {
  it("tells the search which results are pinned, and a tap on one opens its pin, not the add sheet", async () => {
    await act(async () => { render(<FullMapClient trip={trip} days={days} cards={cards} />); });
    const ids = seen.search.savedPlaceIds as Set<string>;
    expect(ids.has("gc1")).toBe(true);
    expect(ids.has("gnew")).toBe(false);
    lookup.mockClear();
    await act(async () => { await (seen.search.onPlaceSelect as (id: string, t: string) => Promise<void>)("gc1", "tok"); });
    expect(lookup).not.toHaveBeenCalled();
    expect((seen.popup?.card as Card | undefined)?.id).toBe("c1");
  });

  it("a result not on the map still goes to the add path", async () => {
    await act(async () => { render(<FullMapClient trip={trip} days={days} cards={cards} />); });
    lookup.mockClear();
    await act(async () => { await (seen.search.onPlaceSelect as (id: string, t: string) => Promise<void>)("gnew", "tok"); });
    expect(lookup).toHaveBeenCalledWith("gnew", "tok");
  });
});

describe("the journey's first place (7 Oct 2026, delight audit)", () => {
  const search = async (id: string) => {
    lookup.mockResolvedValueOnce({ place_id: id, name: "Reservoir", lat: 32.89, lng: -96.94 } as never);
    await act(async () => { await (seen.search.onPlaceSelect as (id: string, t: string) => Promise<void>)(id, "tok"); });
  };
  const irving = { ...trip, destination: "Irving, Texas" } as unknown as Trip;

  it("a map search saved onto an empty journey's map says it is the first place for the town; the next save reads as before", async () => {
    toast.mockClear();
    await act(async () => { render(<FullMapClient trip={irving} days={days} cards={[]} />); });
    await search("gr1");
    await act(async () => { (seen.add.onCardCreated as (c: Card) => void)(saved("r1", "Reservoir", 32.89, -96.94)); });
    expect(toast.mock.calls.at(-1)![0].message).toBe("Your first place for Irving. Tap its pin to put it on a day.");
    await search("gr2");
    await act(async () => { (seen.add.onCardCreated as (c: Card) => void)(saved("r2", "Toyota Music Factory", 32.88, -96.94)); });
    expect(toast.mock.calls.at(-1)![0].message).toBe("Saved to your map. Tap its pin to put it on a day.");
  });

  it("a journey that already has places gets the usual line on its next save", async () => {
    toast.mockClear();
    await act(async () => { render(<FullMapClient trip={trip} days={days} cards={cards} />); });
    await search("gnew");
    await act(async () => { (seen.add.onCardCreated as (c: Card) => void)(saved("n9", "Peles Castle", 45.36, 25.54)); });
    expect(toast.mock.calls.at(-1)![0].message).toBe("Saved to your map. Tap its pin to put it on a day.");
  });

  it("Find is told whether the map already has a place, so its first save matches", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "pk.test");
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<FullMapClient trip={trip} days={days} cards={[]} />); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Find places" })); });
    expect((sheets.find as unknown as { hadPlaces: boolean }).hadPlaces).toBe(false);
    await act(async () => { sheets.find.onSaved(cards[0]); });
    expect((sheets.find as unknown as { hadPlaces: boolean }).hadPlaces).toBe(true);
    r.unmount();
    vi.unstubAllEnvs();
  });
});

describe("one pin put on a day gets a time, like the lasso (7 Oct 2026, taps audit)", () => {
  const openPin = async (gid: string) => { await act(async () => { await (seen.search.onPlaceSelect as (id: string, t: string) => Promise<void>)(gid, "tok"); }); };
  const putOn = async (day: Day) => { await act(async () => { await (seen.popup.onPutOnDay as (d: Day) => Promise<void>)(day); }); };
  const lastToast = () => toast.mock.calls.at(-1)![0] as { message: string; undo?: () => Promise<void> };
  const onDay = (c: Card, day: string, start: string | null, end: string | null) => ({ ...c, id: c.id + "-" + day, status: "in_itinerary", day_id: day, start_time: start, end_time: end }) as unknown as Card;
  beforeEach(() => { toast.mockClear(); schedule.mockClear(); qdel.mockClear(); });

  it("is timed from the hotel, says the day and the time, stays on the map, and Undo takes it off", async () => {
    const hotel = { ...saved("h1", "Hotel Bella Muzica", 45.64, 25.59), status: "in_itinerary", day_id: "d1", place: { ...saved("h1", "Hotel Bella Muzica", 45.64, 25.59).place, type: "logistics", sub_type: "hotel" } } as unknown as Card;
    await act(async () => { render(<FullMapClient trip={trip} days={days} cards={[hotel, ...cards]} />); });
    await openPin("gc1");
    await putOn(days[1]);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0][1]).toMatchObject({ dayId: "d2", placeId: "pc1" });
    expect(schedule.mock.calls[0][1].startTime).toMatch(/^\d\d:\d\d:00$/);
    expect(lastToast().message).toMatch(/^Put on Tue 6 · \d{1,2}:\d\d (AM|PM)$/);
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    await act(async () => { await lastToast().undo!(); });
    expect(qdel).toHaveBeenCalledWith("cards", { id: "new-d2" });
  });

  it("no free time: saved without a time, and says so, with Undo", async () => {
    const full = [onDay(saved("b1", "Brasov tour", 45.64, 25.59), "d2", "00:00:00", "12:00:00"), onDay(saved("b2", "Train", 45.66, 25.6), "d2", "12:00:00", "23:59:00")];
    await act(async () => { render(<FullMapClient trip={trip} days={days} cards={[...cards, ...full]} />); });
    await openPin("gc1");
    await putOn(days[1]);
    expect(schedule.mock.calls[0][1]).toMatchObject({ dayId: "d2", startTime: null });
    expect(lastToast().message).toBe("Put on Tue 6 · no free time");
    expect(lastToast().undo).toBeTypeOf("function");
  });

  it("a hotel goes on at its 3:00 PM check-in", async () => {
    const stay = { ...saved("h2", "Casa Wagner", 45.64, 25.59), place: { ...saved("h2", "Casa Wagner", 45.64, 25.59).place, type: "logistics", sub_type: "hotel" } } as unknown as Card;
    await act(async () => { render(<FullMapClient trip={trip} days={days} cards={[...cards, stay]} />); });
    await openPin("gh2");
    await putOn(days[1]);
    expect(lastToast().message).toBe("Put on Tue 6 · 3:00 PM");
  });

  it("already planned on another day: it still goes on this one (a second visit)", async () => {
    await act(async () => { render(<FullMapClient trip={trip} days={days} cards={[...cards, onDay(cards[0], "d1", "10:00:00", "12:00:00")]} />); });
    await openPin("gc1");
    await putOn(days[1]);
    expect(schedule.mock.calls[0][1]).toMatchObject({ dayId: "d2", placeId: "pc1" });
    expect(lastToast().message).toMatch(/^Put on Tue 6 · /);
  });

  it("already on this day: says 'Already on Tue 6' (the day's name, 7 Oct 2026 re-audit) and writes nothing", async () => {
    await act(async () => { render(<FullMapClient trip={trip} days={days} cards={[...cards, onDay(cards[0], "d2", "10:00:00", "12:00:00")]} />); });
    await openPin("gc1");
    await putOn(days[1]);
    expect(schedule).not.toHaveBeenCalled();
    expect(lastToast().message).toBe("Already on Tue 6");
  });

  it("an event on set days goes to its own day, untimed, with the only-on line", async () => {
    const fest = { ...saved("e1", "Harvest festival", 45.64, 25.59), details: { find: { why: "Wed 7 Oct: in the old town" } }, place: { ...saved("e1", "Harvest festival", 45.64, 25.59).place, sub_type: "event" } } as unknown as Card;
    await act(async () => { render(<FullMapClient trip={trip} days={days} cards={[...cards, fest]} />); });
    await openPin("ge1");
    await putOn(days[0]);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0][1]).toMatchObject({ dayId: "d3" });
    expect(schedule.mock.calls[0][1].startTime ?? null).toBeNull();
    expect(lastToast().message).toBe("Harvest festival only happens on Wed 7 Oct, so I moved it there");
  });

  it("a guest's map offers no door onto a day", async () => {
    await act(async () => { render(<FullMapClient trip={trip} days={days} cards={cards} readOnly />); });
    // readOnly has no search; the popup props are read from the source instead.
    const src = readFileSync("src/components/map/FullMapClient.tsx", "utf8");
    expect(src).toMatch(/onPutOnDay=\{readOnly \? undefined :/);
  });
});
