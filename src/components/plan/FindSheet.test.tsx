// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act, waitFor, within } from "@testing-library/react";
import type { Card, Day, Trip } from "@/types/database";
import type { FindResult } from "@/lib/find/merge";

/**
 * Find, rendered on an empty journey (29 Sep 2026): no pins yet, so the
 * destination is the one base, the first gap is searched on open, and Save
 * imports the place and puts one interested card on the map.
 */

const inserted: Record<string, unknown>[] = [];
const updated: { row: Record<string, unknown>; id: string }[] = [];
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => { inserted.push(row); return Promise.resolve({ error: null }); },
      update: (row: Record<string, unknown>) => ({ eq: (_k: string, id: string) => { updated.push({ row, id }); return Promise.resolve({ error: null }); } }),
    }),
  }),
}));
const toasts: { message: string }[] = [];
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: (t: { message: string }) => toasts.push(t) }) }));

import FindSheet from "./FindSheet";

const trip = { id: "t1", title: "Rome", destination: "Rome, Italy", destination_lat: 41.9, destination_lng: 12.5, start_date: "2026-04-22", end_date: "2026-04-28", party_size: 2 } as unknown as Trip;
const result: FindResult = { placeId: "g1", name: "Trattoria Da Enzo", address: "Via dei Vascellari 29", lat: 41.888, lng: 12.476, rating: 4.6, reviews: 9000, why: "Reddit's favourite in Trastevere.", source: { name: "r/rome", url: "https://reddit.com/r/rome/x" }, from: "travellers", kids: false, photo: "https://photos.example/thumb.jpg" };
const finds = () => calls.filter((c) => c.url === "/api/find");

const calls: { url: string; body: Record<string, unknown> }[] = [];
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body: string }) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    calls.push({ url, body });
    if (url === "/api/find") return { ok: true, json: async () => ({ results: [result], travellers: true }) };
    if (url.startsWith("/api/places/details")) return { ok: true, json: async () => ({ result: {
      photos: [{ photo_reference: "ref1" }], url: "https://maps.google.com/?cid=1", website: "https://daenzoal29.com", price_level: 2,
      opening_hours: { weekday_text: ["Monday: Closed", "Tuesday: 12:30 – 3:00 PM", "Wednesday: 12:30 – 3:00 PM", "Thursday: 12:30 – 3:00 PM", "Friday: 12:30 – 3:00 PM", "Saturday: 12:30 – 3:00 PM", "Sunday: 12:30 – 3:00 PM"] },
    } }) };
    if (url.startsWith("/api/places/photo/by-reference")) return { ok: true, json: async () => ({ url: "https://photos.example/1.jpg" }) };
    return { ok: true, json: async () => ({ imported: [{ place_id: "p1", google_place_id: "g1", title: "Da Enzo al 29" }] }) };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); inserted.length = 0; updated.length = 0; toasts.length = 0; calls.length = 0; });

// Rendering with jsdom is slow under the full suite; one test timed out at 7.7 s.
describe("Find sheet", { timeout: 20000 }, () => {
  it("on an empty map, searches the destination straight away, with a photo on each result", async () => {
    await act(async () => { render(<FindSheet trip={trip} days={[]} cards={[] as Card[]} onClose={vi.fn()} onSaved={vi.fn()} />); });
    expect(screen.getByRole("dialog", { name: "Find places" })).toBeTruthy();
    expect(finds().slice(0, 2).map((c) => [c.body.subType, c.body.mode])).toEqual([["self_directed", "google"], ["self_directed", "travellers"]]);
    expect(finds()[0].body).toMatchObject({ tripId: "t1", base: { label: "Rome", lat: 41.9, lng: 12.5 } });
    expect(screen.getByText("Trattoria Da Enzo")).toBeTruthy();
    expect(screen.getByRole("link", { name: "r/rome" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "More about Trattoria Da Enzo" }).querySelector("img")?.getAttribute("src")).toBe("https://photos.example/thumb.jpg");
    // Two levels, as the map's Filter: Activity's kinds first, Food's behind the switch. No numbers.
    for (const label of ["Explore", "Tour", "Beach", "Wellness", "Event", "Race", "Camp"]) expect(screen.getByRole("button", { name: label })).toBeTruthy();
    // Chips wrap; a scrolling row cut them off at the edge.
    expect(screen.getByRole("button", { name: "Explore" }).parentElement!.className).toMatch(/flex-wrap/);
    expect(screen.queryByRole("button", { name: "Restaurant" })).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: "Food" })); });
    for (const label of ["Restaurant", "Coffee", "Dessert", "Bar"]) expect(screen.getByRole("button", { name: label })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Explore" })).toBeNull();
    expect(screen.getByRole("button", { name: "Restaurant" }).getAttribute("aria-pressed")).toBe("true"); // the switch opens the group's first kind
  });

  it("says how far each place is from the hotel, in the list and once opened (Sandra, 1 Oct 2026)", async () => {
    const hotel = { id: "h1", trip_id: "t1", day_id: "d1", status: "in_itinerary", place_id: "ph",
      place: { id: "ph", title: "Banco 19 B&B", type: "logistics", sub_type: "hotel", lat: 41.8986, lng: 12.4683, address: "Via dei Banchi Nuovi 19, 00186 Roma RM" } } as unknown as Card;
    const sight = { id: "s1", trip_id: "t1", day_id: "d1", status: "in_itinerary", place_id: "ps",
      place: { id: "ps", title: "Pantheon", type: "activity", sub_type: "self_directed", lat: 41.8986, lng: 12.4769, address: null } } as unknown as Card;
    await act(async () => { render(<FindSheet trip={trip} days={[]} cards={[hotel, sight]} onClose={vi.fn()} onSaved={vi.fn()} />); });
    // Da Enzo in Trastevere, about 1.4 km from the B&B: walkable.
    expect(screen.getByText(/min walk from Banco 19 B&B$/)).toBeTruthy();
    // The dot sits BETWEEN the distance and the source, glued to both by
    // non-breaking spaces, so it can never dangle at a line end (6 Oct 2026).
    const meta = screen.getByTestId("find-meta");
    expect(meta.textContent).toMatch(/min walk from Banco 19 B&B · r\/rome$/);
    expect(meta.textContent!.trim().endsWith("·")).toBe(false);
    expect(meta.querySelector("span")!.textContent).not.toMatch(/·/);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "More about Trattoria Da Enzo" })); });
    expect(within(screen.getByRole("region", { name: "Trattoria Da Enzo" })).getByText(/min walk from Banco 19 B&B$/)).toBeTruthy();
    // Its dot is the map pin's look, navy with an orange ring, not food purple (2 Oct 2026).
    const dot = screen.getByTestId("find-away-dot");
    expect(dot.style.background).toBe("rgb(26, 26, 46)");
    expect(dot.style.boxShadow).toMatch(/176, 84, 31|#B0541F/i);
  });

  it("never covers the map: docked beside it on a computer, a half sheet on the phone, nothing dimmed (1 Oct 2026)", async () => {
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<FindSheet trip={trip} days={[]} cards={[] as Card[]} dock="beside" onClose={vi.fn()} onSaved={vi.fn()} />); });
    const { container, unmount } = r;
    const panel = screen.getByRole("dialog", { name: "Find places" }).parentElement!;
    expect(panel.className).toMatch(/absolute/);
    expect(panel.style.right).toBe("calc(100% + 10px)"); // against the map's edge, over the week
    expect(container.innerHTML).not.toContain("rgba(26, 26, 46, 0.28)"); // the old dimming backdrop
    unmount();
    await act(async () => { render(<FindSheet trip={trip} days={[]} cards={[] as Card[]} onClose={vi.fn()} onSaved={vi.fn()} />); });
    const sheet = screen.getByRole("dialog", { name: "Find places" });
    expect(sheet.style.height).toBe("50dvh");
    expect(sheet.parentElement!.className).toMatch(/pointer-events-none/); // the map above takes taps
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Show more results" })); });
    expect(sheet.style.height).toBe("88dvh");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Show more map" })); });
    expect(sheet.style.height).toBe("50dvh");
  });

  it("an opened place says what it is before the photos, and the map is told where it is (1 Oct 2026)", async () => {
    const google: FindResult = { ...result, placeId: "g7", name: "Ponte del Diavolo", from: "google", source: null, why: "Rated 4.7 on Google from 12,520 reviews." };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body: string }) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body) : {} });
      if (url === "/api/find") return { ok: true, json: async () => ({ results: [google] }) };
      if (url.startsWith("/api/places/details")) return { ok: true, json: async () => ({ result: { editorial_summary: { overview: "Medieval stone bridge over the Serchio." }, photos: [{ photo_reference: "r1" }] } }) };
      if (url.startsWith("/api/places/photo/by-reference")) return { ok: true, json: async () => ({ url: "https://photos.example/b.jpg" }) };
      return { ok: true, json: async () => ({}) };
    }));
    const onFocus = vi.fn();
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<FindSheet trip={trip} days={[]} cards={[] as Card[]} onClose={vi.fn()} onSaved={vi.fn()} onFocus={onFocus} />); });
    expect(onFocus).toHaveBeenLastCalledWith(null);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "More about Ponte del Diavolo" })); });
    expect(onFocus).toHaveBeenLastCalledWith(expect.objectContaining({ placeId: "g7", lat: 41.888, lng: 12.476 }));
    const view = screen.getByRole("region", { name: "Ponte del Diavolo" });
    // Google's own summary stands in for a rating-only "why"; it comes before the photos.
    const blurb = await within(view).findByTestId("find-blurb");
    expect(blurb.textContent).toBe("Medieval stone bridge over the Serchio.");
    await waitFor(() => expect(view.querySelector("img")).toBeTruthy());
    expect(blurb.compareDocumentPosition(view.querySelector("img")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(view.querySelector("img")!.className).toMatch(/h-16 w-24/);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "‹ Back to results" })); });
    expect(onFocus).toHaveBeenLastCalledWith(null);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "More about Ponte del Diavolo" })); });
    onFocus.mockClear();
    r.unmount();
    expect(onFocus).toHaveBeenCalledWith(null); // closing Find takes the pin away
  });

  it("on the phone the controls scroll away with the results, scrolling raises the sheet, opening a place drops it back (2 Oct 2026)", async () => {
    await act(async () => { render(<FindSheet trip={trip} days={[]} cards={[] as Card[]} onClose={vi.fn()} onSaved={vi.fn()} />); });
    const sheet = screen.getByRole("dialog", { name: "Find places" });
    const scroller = screen.getByTestId("find-scroll");
    // The Activity/Food switch and the search box are inside the one scroller, above the results.
    expect(scroller.contains(screen.getByRole("tablist", { name: "Activity or food" }))).toBe(true);
    expect(scroller.contains(screen.getByText("Trattoria Da Enzo"))).toBe(true);
    expect(sheet.style.height).toBe("50dvh");
    await act(async () => { scroller.scrollTop = 40; fireEvent.scroll(scroller); });
    expect(sheet.style.height).toBe("88dvh");
    // A place opened: half height again, so the map above shows its pin.
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "More about Trattoria Da Enzo" })); });
    expect(sheet.style.height).toBe("50dvh");
    expect(screen.getByRole("region", { name: "Trattoria Da Enzo" })).toBeTruthy();
  });

  it("tells the phone Map when the half sheet rises and falls, so its bottom row can ride above it (2 Oct 2026)", async () => {
    const onTall = vi.fn();
    await act(async () => { render(<FindSheet trip={trip} days={[]} cards={[] as Card[]} onClose={vi.fn()} onSaved={vi.fn()} onTall={onTall} />); });
    expect(onTall).toHaveBeenLastCalledWith(false);
    const scroller = screen.getByTestId("find-scroll");
    await act(async () => { scroller.scrollTop = 40; fireEvent.scroll(scroller); });
    expect(onTall).toHaveBeenLastCalledWith(true);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "More about Trattoria Da Enzo" })); });
    expect(onTall).toHaveBeenLastCalledWith(false);
  });

  it("on the phone a save drops the raised sheet to half, so the pin is seen landing; the bottom row follows (2 Oct 2026)", async () => {
    const onTall = vi.fn(), onSaved = vi.fn();
    await act(async () => { render(<FindSheet trip={trip} days={[]} cards={[] as Card[]} onClose={vi.fn()} onSaved={onSaved} onTall={onTall} />); });
    const sheet = screen.getByRole("dialog", { name: "Find places" });
    const scroller = screen.getByTestId("find-scroll");
    await act(async () => { scroller.scrollTop = 40; fireEvent.scroll(scroller); });
    expect(sheet.style.height).toBe("88dvh");
    expect(onTall).toHaveBeenLastCalledWith(true);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(sheet.style.height).toBe("50dvh");
    expect(onTall).toHaveBeenLastCalledWith(false);
  });

  it("never reports a height when docked on a computer", async () => {
    const onTall = vi.fn();
    await act(async () => { render(<FindSheet trip={trip} days={[]} cards={[] as Card[]} dock="beside" onClose={vi.fn()} onSaved={vi.fn()} onTall={onTall} />); });
    expect(onTall).not.toHaveBeenCalled();
  });

  it("on a computer the controls stay put and only the results scroll", async () => {
    await act(async () => { render(<FindSheet trip={trip} days={[]} cards={[] as Card[]} dock="beside" onClose={vi.fn()} onSaved={vi.fn()} />); });
    expect(screen.getByTestId("find-scroll").className).toBe("contents");
    const list = screen.getByText("Trattoria Da Enzo").closest(".overflow-y-auto")!;
    expect(list.contains(screen.getByRole("tablist", { name: "Activity or food" }))).toBe(false);
  });

  it("warms every category on open, so tapping across the chips never waits", async () => {
    await act(async () => { render(<FindSheet trip={trip} days={[]} cards={[] as Card[]} onClose={vi.fn()} onSaved={vi.fn()} />); });
    const google = new Set(finds().filter((c) => c.body.mode === "google").map((c) => c.body.subType));
    const travellers = new Set(finds().filter((c) => c.body.mode === "travellers").map((c) => c.body.subType));
    expect(google.size).toBe(11);
    expect(Array.from(travellers).sort()).toEqual(["bar", "coffee", "dessert", "restaurant", "self_directed"]);
    const before = finds().length;
    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: "Food" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Coffee" })); });
    expect(finds().length).toBe(before); // already there
    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: "Activity" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Tour" })); });
    expect(finds().slice(before).map((c) => [c.body.subType, c.body.mode])).toEqual([["guided", "travellers"]]); // only the half not warmed
  });

  it("Save imports the place with the category's type and adds one saved pin", async () => {
    const onSaved = vi.fn();
    await act(async () => { render(<FindSheet trip={trip} days={[]} cards={[] as Card[]} onClose={vi.fn()} onSaved={onSaved} />); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    expect(calls.find((c) => c.url === "/api/places/bulk-import")).toMatchObject({ body: { google_place_ids: ["g1"], defaults: { type: "activity", sub_type: "self_directed" } } });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ trip_id: "t1", day_id: null, place_id: "p1", status: "interested", position: 0 });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(toasts[0].message).toBe("Saved Trattoria Da Enzo to your map");
    expect(screen.getByRole("button", { name: "Saved ✓" })).toBeTruthy();
  });

  it("a Ticketmaster show links to buy, and Save looks its venue up on Google first (1 Oct 2026)", async () => {
    const show: FindResult = { placeId: "tm:e1", title: "Foo Fighters", name: "Acrisure Arena", address: "75-702 Ritz Cove Dr, Palm Desert", lat: 41.9, lng: 12.5, rating: null, reviews: null,
      why: "Sun 14 Mar: Rock, 8:00 PM.", source: { name: "Ticketmaster", url: "https://www.ticketmaster.com/event/e1" }, from: "google", kids: false, photo: null };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body: string }) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body) : {} });
      if (url === "/api/find") return { ok: true, json: async () => ({ results: [show] }) };
      if (url.startsWith("/api/places/autocomplete")) return { ok: true, json: async () => ({ predictions: [{ place_id: "gArena" }] }) };
      return { ok: true, json: async () => ({ imported: [{ place_id: "p9", google_place_id: "gArena", title: "Acrisure Arena", created: true }] }) };
    }));
    await act(async () => { render(<FindSheet trip={trip} days={[]} cards={[] as Card[]} onClose={vi.fn()} onSaved={vi.fn()} />); });
    expect(screen.getByRole("link", { name: "Ticketmaster" }).getAttribute("href")).toBe("https://www.ticketmaster.com/event/e1");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    expect(calls.find((c) => c.url.startsWith("/api/places/autocomplete"))?.url).toContain(encodeURIComponent("Acrisure Arena, 75-702 Ritz Cove Dr, Palm Desert"));
    expect(calls.find((c) => c.url === "/api/places/bulk-import")?.body).toMatchObject({ google_place_ids: ["gArena"] });
    // The new pin carries the show's name, not the arena's.
    expect(updated[0]).toMatchObject({ row: { title: "Foo Fighters" }, id: "p9" });
  });

  it("shows Google's places at once and puts the travellers' on top when they land", async () => {
    const waiting: ((v: unknown) => void)[] = [];
    const google: FindResult = { ...result, placeId: "g2", name: "Colosseum", from: "google", source: null, why: "Rated 4.8 on Google." };
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      if (body.mode === "google") return { ok: true, json: async () => ({ results: [google] }) };
      await new Promise((r) => { waiting.push(r); });
      return { ok: true, json: async () => ({ results: [result] }) };
    }));
    await act(async () => { render(<FindSheet trip={trip} days={[]} cards={[] as Card[]} onClose={vi.fn()} onSaved={vi.fn()} />); });
    expect(screen.getByText("Colosseum")).toBeTruthy();
    expect(screen.getByText("Adding what travellers recommend…")).toBeTruthy();
    await act(async () => { waiting.forEach((r) => r(null)); });
    const names = screen.getAllByText(/Colosseum|Trattoria Da Enzo/).map((e) => e.textContent);
    expect(names).toEqual(["Trattoria Da Enzo", "Colosseum"]);
    expect(screen.queryByText("Adding what travellers recommend…")).toBeNull();
  });

  it("a tap opens the place: photos, why and where from, the days it is shut, and Save", async () => {
    const days = ["2026-04-22", "2026-04-23", "2026-04-24", "2026-04-25", "2026-04-26", "2026-04-27", "2026-04-28"].map((date, i) => ({ id: "d" + i, trip_id: "t1", day_number: i + 1, date })) as unknown as Day[];
    const onSaved = vi.fn();
    await act(async () => { render(<FindSheet trip={trip} days={days} cards={[] as Card[]} onClose={vi.fn()} onSaved={onSaved} />); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "More about Trattoria Da Enzo" })); });
    const view = screen.getByRole("region", { name: "Trattoria Da Enzo" });
    await waitFor(() => expect(view.querySelector("img")?.getAttribute("src")).toBe("https://photos.example/1.jpg"));
    expect(screen.getByText("★ 4.6 · 9,000 reviews · $$")).toBeTruthy();
    expect(screen.getByText("Closed Mon 27 Apr")).toBeTruthy();
    expect(screen.getByRole("link", { name: "From r/rome" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Google Maps" })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save to your map" })); });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Saved to your map ✓" })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "‹ Back to results" })); });
    expect(screen.queryByRole("region", { name: "Trattoria Da Enzo" })).toBeNull();
    expect(screen.getByRole("button", { name: "Saved ✓" })).toBeTruthy();
  });

  it("coffee and dessert are looked for near the sights already on the journey; events by date", async () => {
    const colosseum = { id: "c1", trip_id: "t1", day_id: null, status: "interested", position: 0, details: {}, place_id: "p9",
      place: { id: "p9", title: "Colosseum", type: "activity", sub_type: "self_directed", lat: 41.8902, lng: 12.4922, address: null } } as unknown as Card;
    await act(async () => { render(<FindSheet trip={trip} days={[]} cards={[colosseum]} onClose={vi.fn()} onSaved={vi.fn()} />); });
    const coffee = finds().find((c) => c.body.subType === "coffee" && c.body.mode === "travellers")!;
    expect(coffee.body.nearNames).toEqual(["Colosseum"]);
    expect((coffee.body.near as { lat: number }[])[0].lat).toBeCloseTo(41.8902, 3);
    expect(finds().find((c) => c.body.subType === "restaurant")!.body.near).toBeUndefined();
  });

  it("says so when a search fails, and tapping the category tries again", async () => {
    let down = true;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body: string }) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      calls.push({ url, body });
      if (body.subType === "event" && body.mode === "google") return { ok: true, status: 200, json: async () => ({ results: [] }) };
      if (body.subType === "event") return down ? { ok: false, status: 502, json: async () => ({ error: "unavailable" }) } : { ok: true, status: 200, json: async () => ({ results: [result] }) };
      return { ok: true, status: 200, json: async () => ({ results: [] }) };
    }));
    await act(async () => { render(<FindSheet trip={trip} days={[]} cards={[] as Card[]} onClose={vi.fn()} onSaved={vi.fn()} />); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Event" })); });
    expect(screen.getByText("Couldn't find places just now. Tap the category to try again.")).toBeTruthy();
    down = false;
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Event" })); });
    expect(screen.getByText("Trattoria Da Enzo")).toBeTruthy();
  });

  it("the photos have arrows, so a mouse can move through them", async () => {
    // jsdom has no layout: a strip wider than its box, and a scrollBy to watch.
    const scrolled: number[] = [];
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    const saved = { sw: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth"), cw: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth") };
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", { configurable: true, get: () => 1000 });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 400 });
    proto.scrollBy = function (o: { left: number }) { scrolled.push(o.left); };
    try {
      await act(async () => { render(<FindSheet trip={trip} days={[]} cards={[] as Card[]} onClose={vi.fn()} onSaved={vi.fn()} />); });
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "More about Trattoria Da Enzo" })); });
      const next = await screen.findByRole("button", { name: "Next photo" });
      expect(screen.queryByRole("button", { name: "Previous photo" })).toBeNull(); // at the start
      await act(async () => { fireEvent.click(next); });
      expect(scrolled).toEqual([104]); // one small photo at a time
    } finally {
      if (saved.sw) Object.defineProperty(HTMLElement.prototype, "scrollWidth", saved.sw); else delete (proto as Record<string, unknown>).scrollWidth;
      if (saved.cw) Object.defineProperty(HTMLElement.prototype, "clientWidth", saved.cw); else delete (proto as Record<string, unknown>).clientWidth;
      delete proto.scrollBy;
    }
  });
});

describe("an event carries its own name", { timeout: 20000 }, () => {
  it("the Bravio shows as itself, at its venue, and its new pin is named after it", async () => {
    const bravio: FindResult = { ...result, placeId: "gmp", name: "Comune di Montepulciano", title: "Bravio delle Botti", why: "Sun 29 Aug: eight districts race 80 kg wine barrels uphill." };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body: string }) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body) : {} });
      if (url === "/api/find") return { ok: true, json: async () => ({ results: [bravio] }) };
      return { ok: true, json: async () => ({ imported: [{ place_id: "pmp", google_place_id: "gmp", title: "Comune di Montepulciano", created: true }] }) };
    }));
    const onSaved = vi.fn();
    await act(async () => { render(<FindSheet trip={trip} days={[]} cards={[] as Card[]} onClose={vi.fn()} onSaved={onSaved} />); });
    expect(screen.getByText("Bravio delle Botti")).toBeTruthy();
    expect(screen.getByText("At Comune di Montepulciano")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    expect(updated).toEqual([{ row: { title: "Bravio delle Botti" }, id: "pmp" }]);
    expect((onSaved.mock.calls[0][0] as Card).place!.title).toBe("Bravio delle Botti");
    expect(toasts[0].message).toBe("Saved Bravio delle Botti to your map");
  });
});
