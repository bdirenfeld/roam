// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import type { Card, Day, Trip } from "@/types/database";
import type { FindResult } from "@/lib/find/merge";

/**
 * Find, rendered on an empty journey (29 Sep 2026): no pins yet, so the
 * destination is the one base, the first gap is searched on open, and Save
 * imports the place and puts one interested card on the map.
 */

const inserted: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({ insert: (row: Record<string, unknown>) => { inserted.push(row); return Promise.resolve({ error: null }); } }),
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
afterEach(() => { cleanup(); vi.unstubAllGlobals(); inserted.length = 0; toasts.length = 0; calls.length = 0; });

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
      expect(scrolled).toEqual([248]);
    } finally {
      if (saved.sw) Object.defineProperty(HTMLElement.prototype, "scrollWidth", saved.sw); else delete (proto as Record<string, unknown>).scrollWidth;
      if (saved.cw) Object.defineProperty(HTMLElement.prototype, "clientWidth", saved.cw); else delete (proto as Record<string, unknown>).clientWidth;
      delete proto.scrollBy;
    }
  });
});
