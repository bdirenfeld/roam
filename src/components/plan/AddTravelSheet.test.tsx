// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, waitFor, cleanup } from "@testing-library/react";

/**
 * Add travel (14 Nov 2026): Where to? → the ways with Google's times → Add.
 * Brennan's real Thu 26 Aug: last night's stay is Villa Zambaldi, the day's
 * first stop is the 9:15 Lucca walk at San Michele.
 */

const db = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  updates: [] as string[],
  existingPlace: null as Record<string, unknown> | null,
}));

const VILLA = { id: "p-villa", title: "Villa Zambaldi", type: "logistics", sub_type: "hotel", lat: 43.8298808, lng: 10.4497198, google_place_id: "g-villa", address: "Via Fonda, 403, 55100 Lucca LU, Italy" };
const TABLES: Record<string, unknown[]> = {
  days: [{ id: "d25", date: "2027-08-25" }, { id: "d26", date: "2027-08-26" }],
  cards: [{ id: "c-villa", day_id: "d25", place_id: "p-villa", status: "in_itinerary", start_time: "15:00:00", details: { check_in_date: "Wed, Aug 25", check_out_date: "Sun, Sep 5" }, place: VILLA }],
  dayStops: [{ start_time: "09:15:00", end_time: "15:30:00", details: { title: "Lucca Wandering" }, place: { title: "San Michele in Foro", lat: 43.8430, lng: 10.5050 } }],
};

vi.mock("@/lib/supabase/client", () => {
  const make = (table: string) => {
    const f: Record<string, unknown> = {};
    let insertRow: Record<string, unknown> | null = null;
    const chain: Record<string, unknown> = {};
    for (const k of ["select", "not", "order", "limit", "in", "is", "neq", "update", "delete", "upsert"]) chain[k] = () => { if (k === "update" || k === "upsert") db.updates.push(table); return chain; };
    chain.eq = (col: string, v: unknown) => { f[col] = v; return chain; };
    chain.insert = (row: Record<string, unknown>) => { insertRow = row; db.inserts.push({ table, row }); return chain; };
    const rows = () => {
      if (table === "days") return f.id ? TABLES.days.find((d) => (d as { id: string }).id === f.id) ?? null : TABLES.days;
      if (table === "cards") return f.day_id ? TABLES.dayStops : TABLES.cards;
      if (table === "places") return f.google_place_id ? db.existingPlace : null;
      return [];
    };
    chain.maybeSingle = () => Promise.resolve({ data: rows(), error: null });
    chain.single = () => Promise.resolve({ data: insertRow ? { id: `new-${table}` } : rows(), error: null });
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: insertRow ? null : rows(), error: null }).then(ok);
    return chain;
  };
  return { createClient: () => ({ from: (t: string) => make(t), auth: { getSession: () => Promise.resolve({ data: { session: null } }) } }) };
});
vi.mock("@/lib/supabase/authUser", () => ({ getAuthUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/offline/queuedWrite", () => ({ queuedDelete: vi.fn(async () => ({ error: null })) }));
const toasts = vi.hoisted(() => [] as string[]);
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: (t: { message: string }) => toasts.push(t.message) }) }));

import AddTravelSheet, { isTransitName } from "./AddTravelSheet";

type Pick = { id: string; name: string; secondary: string; lat: number; lng: number; address: string };
let picks: Pick[] = [];
let estimate: Record<string, unknown> | null = null;
let parks: Record<string, unknown>[] = [];
const parkCalls: string[] = [];

beforeEach(() => {
  db.inserts = []; db.updates = []; db.existingPlace = null; toasts.length = 0;
  estimate = { key: "k", drive: 10, transit: 39, rides: 2, via: "bus" };
  parks = []; parkCalls.length = 0;
  global.fetch = vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.startsWith("/api/places/autocomplete")) {
      return new Response(JSON.stringify({ predictions: picks.map((p) => ({ place_id: p.id, structured_formatting: { main_text: p.name, secondary_text: p.secondary } })) }));
    }
    if (u.startsWith("/api/places/details")) {
      const id = new URL(u, "http://x").searchParams.get("place_id");
      const p = picks.find((x) => x.id === id)!;
      return new Response(JSON.stringify({ result: { name: p.name, geometry: { location: { lat: p.lat, lng: p.lng } }, formatted_address: p.address } }));
    }
    if (u.startsWith("/api/travel/park")) { parkCalls.push(u); return new Response(JSON.stringify({ parks })); }
    if (u.startsWith("/api/travel/estimate")) return estimate ? new Response(JSON.stringify(estimate)) : new Response("{}", { status: 500 });
    return new Response("{}");
  }) as unknown as typeof fetch;
});
afterEach(() => cleanup());

const created: unknown[] = [];
async function openAndGo(to: Pick) {
  picks = [to];
  await act(async () => {
    render(<AddTravelSheet dayId="d26" tripId="t1" endPosition={5} dayLabel="Thu 26" onBack={() => {}} onClose={() => {}} onCardCreated={(c) => created.push(c)} />);
  });
  fireEvent.change(screen.getByPlaceholderText("Search a place, town or station"), { target: { value: to.name.slice(0, 5) } });
  const hit = await screen.findByText(to.name, {}, { timeout: 2000 });
  await act(async () => { fireEvent.click(hit.closest("button")!); });
}

const STATION: Pick = { id: "g-station", name: "Lucca station car park", secondary: "Viale Cavour", lat: 43.8374125, lng: 10.5061477, address: "Viale Camillo Benso Cavour, 15, Lucca" };
const TRATTORIA: Pick = { id: "g-giulio", name: "Trattoria da Giulio", secondary: "Lucca", lat: 43.8456, lng: 10.4979, address: "Via delle Conce, 45, Lucca" };

describe("Add travel (14 Nov 2026)", () => {
  it("starts at last night's stay without asking", async () => {
    picks = [];
    await act(async () => { render(<AddTravelSheet dayId="d26" tripId="t1" endPosition={0} onBack={() => {}} onClose={() => {}} onCardCreated={() => {}} />); });
    await waitFor(() => expect(screen.getByTestId("add-travel-from").textContent).toContain("Villa Zambaldi"));
    expect(screen.getByTestId("add-travel-from").textContent).toContain("last night");
  });

  it("villa → Lucca station car park: drive and bus times show, and the drive arrives by the 9:15 walk", async () => {
    await openAndGo(STATION);
    const ways = await screen.findByTestId("add-travel-ways");
    await waitFor(() => expect(ways.textContent).toContain("10 min"));
    expect(ways.textContent).toContain("Bus");
    expect(screen.getByTestId("add-travel-leave").textContent).toContain("9:05 AM");
    expect(screen.getByTestId("add-travel-leave").textContent).toContain("arrive by 9:15 AM for Lucca Wandering");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Add drive · 9:05 AM – 9:15 AM$/ })); });
    const card = db.inserts.find((i) => i.table === "cards")!.row;
    expect(card.start_time).toBe("09:05:00");
    expect(card.end_time).toBe("09:15:00");
    expect(card.position).toBe(5);
    const d = card.details as Record<string, unknown>;
    expect(d.title).toBe("Villa Zambaldi → Lucca station car park");
    expect(d.mode).toBe("drive");
    expect((d.from as { title: string }).title).toBe("Villa Zambaldi");
    // A station nobody has saved yet becomes the shared transit place.
    const place = db.inserts.find((i) => i.table === "places")!.row;
    expect(place).toMatchObject({ google_place_id: "g-station", type: "logistics", sub_type: "transit" });
    expect(toasts[0]).toBe("Added Villa Zambaldi → Lucca station car park to Thu 26");
  });

  it("picking the bus sets the bus and its own times", async () => {
    await openAndGo(STATION);
    const ways = await screen.findByTestId("add-travel-ways");
    await waitFor(() => expect(ways.textContent).toContain("Bus"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Bus/ })); });
    expect(screen.getByTestId("add-travel-leave").textContent).toContain("8:35 AM");
  });

  it("a saved restaurant as the end is never retyped: the trip gets its own travel end at the same spot", async () => {
    db.existingPlace = { id: "p-giulio", type: "food", sub_type: "restaurant" };
    await openAndGo(TRATTORIA);
    await waitFor(() => expect(screen.getByTestId("add-travel-ways").textContent).toContain("10 min"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Add drive/ })); });
    const place = db.inserts.find((i) => i.table === "places")!.row;
    expect(place).toMatchObject({ google_place_id: null, type: "logistics", sub_type: "transit", title: "Trattoria da Giulio", details: { travel_end_of: "g-giulio" } });
    expect(db.updates).not.toContain("places");
    expect(db.inserts.find((i) => i.table === "cards")!.row.place_id).toBe("new-places");
  });

  it("no travel times: the four modes show, and the card has a start but no made-up end", async () => {
    estimate = null;
    await openAndGo(STATION);
    await waitFor(() => expect(screen.getAllByRole("radio")).toHaveLength(4));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Add/ })); });
    const card = db.inserts.find((i) => i.table === "cards")!.row;
    expect(card.end_time).toBeNull();
    expect((card.details as Record<string, unknown>).mode).toBeUndefined();
  });
});

describe("isTransitName", () => {
  it("knows a station, car park or port by its name, in Italian too", () => {
    for (const n of ["Lucca station car park", "Stazione di Firenze", "Parcheggio Carducci", "Porto di Livorno", "Levanto"]) {
      expect([n, isTransitName(n)]).toEqual([n, n !== "Levanto"]);
    }
  });
});

const SAN_MICHELE: Pick = { id: "g-sm", name: "Piazza San Michele", secondary: "Lucca", lat: 43.8430, lng: 10.5050, address: "Piazza San Michele, 55100 Lucca LU, Italy" };
const STATION_PARK = { title: "Lucca station car park", lat: 43.8374125, lng: 10.5061477, address: "Viale Cavour", google_place_id: "g-station", drive: 10, walk: 15 };
const MAZZINI_PARK = { title: "Parcheggio Mazzini", lat: 43.8395, lng: 10.4985, address: "Via Mazzini", google_place_id: "g-mazzini", drive: 9, walk: 9 };

describe("Drive, park, walk (14 Nov 2026, step 3)", () => {
  it("villa → San Michele (old town): drive, park, walk leads, timed to arrive by the 9:15 walk, with the ZTL line", async () => {
    parks = [STATION_PARK, MAZZINI_PARK];
    await openAndGo(SAN_MICHELE);
    const park = await screen.findByTestId("add-travel-park", {}, { timeout: 2000 });
    expect(park.textContent).toBe("10 min drive → park at Lucca station car park → 15 min walk");
    expect(screen.getByTestId("add-travel-ztl").textContent).toContain("ZTL");
    await waitFor(() => expect(screen.getByTestId("add-travel-leave").textContent).toContain("8:50 AM"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Add drive · 8:50 AM – 9:15 AM$/ })); });
    const d = db.inserts.find((i) => i.table === "cards")!.row.details as Record<string, unknown>;
    expect(d.mode).toBe("drive");
    expect(d.park).toMatchObject({ title: "Lucca station car park", drive: 10, walk: 15 });
  });

  it("'Different car park' moves to the next one and its times", async () => {
    parks = [STATION_PARK, MAZZINI_PARK];
    await openAndGo(SAN_MICHELE);
    await screen.findByTestId("add-travel-park", {}, { timeout: 2000 });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Different car park" })); });
    expect(screen.getByTestId("add-travel-park").textContent).toContain("Parcheggio Mazzini");
    await waitFor(() => expect(screen.getByTestId("add-travel-leave").textContent).toContain("8:55 AM"));
  });

  it("picking the plain drive saves no car park", async () => {
    parks = [STATION_PARK];
    await openAndGo(SAN_MICHELE);
    await screen.findByTestId("add-travel-park", {}, { timeout: 2000 });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^🚗 Drive\s*10 min$/ })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Add drive/ })); });
    expect((db.inserts.find((i) => i.table === "cards")!.row.details as Record<string, unknown>).park).toBeUndefined();
  });

  it("a car park or station as the destination never asks for car parks", async () => {
    await openAndGo(STATION);
    await waitFor(() => expect(screen.getByTestId("add-travel-ways").textContent).toContain("10 min"));
    expect(parkCalls).toHaveLength(0);
    expect(screen.queryByTestId("add-travel-park")).toBeNull();
  });
});
