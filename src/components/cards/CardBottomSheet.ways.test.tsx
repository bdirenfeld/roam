// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { Card, Day } from "@/types/database";

/**
 * The card sheet of a travel leg (7 Oct 2026, mock d13): the title is the
 * route (renameable since 12 Nov 2026) with From and To rows and their
 * addresses under it (back on 12 Nov 2026 at his ask; mock t05 had cut them), the caption once, the mode
 * picker writes details.mode, and a transit card with no start offers one.
 * The leg is the G Adventures journey's Day 23 as converted.
 */

const writes = vi.hoisted(() => ({ calls: [] as Array<{ table: string; patch: Record<string, unknown> }> }));
vi.mock("@/lib/offline/queuedWrite", () => ({
  queuedUpdate: vi.fn(async (table: string, _m: unknown, patch: Record<string, unknown>) => { writes.calls.push({ table, patch }); return { error: null }; }),
  queuedDelete: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const singleBox = vi.hoisted(() => ({ data: null as unknown }));
vi.mock("@/lib/supabase/client", () => {
  const make = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const k of ["from", "select", "not", "order", "limit", "eq", "in", "is", "update", "insert", "delete", "upsert", "neq"]) chain[k] = self;
    chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    chain.single = () => Promise.resolve({ data: singleBox.data, error: null });
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
    chain.auth = { getSession: () => Promise.resolve({ data: { session: null } }) };
    chain.storage = { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null }) }) };
    return chain;
  };
  return { createClient: () => make() };
});
vi.mock("./PlacePhotoGallery", () => ({ default: () => null }));
vi.mock("@/lib/supabase/authUser", () => ({ getAuthUser: async () => ({ id: "u1" }) }));

import CardBottomSheet from "./CardBottomSheet";


// His Florence run, 28 Aug 2027: drive to Lucca station, then the train (28 Nov 2026, mock approved).
const days = [{ id: "d5", trip_id: "t1", date: "2027-08-28", day_number: 5 }] as unknown as Day[];
const villa = { title: "Villa Zambaldi", lat: 43.87, lng: 10.47 };
const lucca = { title: "Lucca station", lat: 43.837, lng: 10.507 };
const smn = { title: "Florence (Santa Maria Novella)", lat: 43.776, lng: 11.248 };
const leg = (id: string, start: string, end: string, mode: string, from: typeof villa, to: typeof villa, notes?: string): Card => ({
  id, trip_id: "t1", day_id: "d5", place_id: "p-" + id, status: "in_itinerary", start_time: start, end_time: end, confirmed: false, position: 0, source_url: null,
  details: { mode, from, ...(notes ? { notes } : {}) },
  place: { id: "p-" + id, title: to.title, type: "logistics", sub_type: "transit", address: to.title === smn.title ? "Piazza della Stazione, 50123 Firenze FI, Italy" : "Viale Cavour, Lucca", lat: to.lat, lng: to.lng, rating: null, price_level: null, hours: null, google_place_id: null, details: {} },
}) as unknown as Card;
const drive = leg("drive", "08:00:00", "08:10:00", "drive", villa, lucca);
const train = leg("train", "08:25:00", "09:25:00", "train", lucca, smn, "Regional train. SMN to the Duomo is a 10-min walk.");
const ways = [
  { kind: "drive", mins: 65, rides: 0, legs: [{ mode: "drive", from: villa, to: smn, at: 0, mins: 65 }] },
  { kind: "mix", mins: 80, rides: 1, via: "Lucca", legs: [{ mode: "drive", from: villa, to: lucca, at: 0, mins: 10 }, { mode: "train", from: lucca, to: smn, at: 20, mins: 60 }] },
  { kind: "transit", mins: 100, rides: 2, legs: [{ mode: "bus", from: villa, to: lucca, at: 6, mins: 24 }, { mode: "train", from: lucca, to: smn, at: 40, mins: 60 }] },
];
const asked: unknown[] = [];
beforeEach(() => {
  writes.calls = []; singleBox.data = null; asked.length = 0; vi.unstubAllGlobals();
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: { body?: string }) => { asked.push(JSON.parse(init?.body ?? "{}")); return { ok: true, json: async () => ({ key: "k", drive: 65, transit: 100, rides: 2, via: "train", ways }) }; }));
});
afterEach(cleanup);
const wayChip = (k: string) => screen.getAllByRole("button").find((b) => b.getAttribute("data-way") === k)!;

describe("one travel card holds every leg (28 Nov 2026)", () => {
  it("a run opens as one card: Villa, Lucca station, Florence; each leg on its line; the whole trip's time", async () => {
    await act(async () => { render(<CardBottomSheet card={drive} run={[drive, train]} onClose={() => {}} days={days} />); });
    const route = screen.getByTestId("leg-route");
    expect(route.textContent).toContain("Villa Zambaldi");
    expect(route.textContent).toContain("Lucca station");
    expect(route.textContent).toContain("Florence (Santa Maria Novella)");
    const lines = screen.getAllByTestId("leg-way-line").map((l) => l.textContent!.replace(/directions_car|train/g, "").trim());
    expect(lines[0]).toBe("Drive· 8:00 AM – 8:10 AM· 10 min");
    expect(lines[1]).toBe("15 min to changeTrain· 8:25 AM – 9:25 AM· 1 h");
    expect(screen.getByRole("button", { name: /Change the time/ }).textContent).toBe("8:00 AM – 9:25 AM");
    // The ways are asked for the whole trip, Villa to Florence.
    await waitFor(() => expect(asked).toHaveLength(1));
    expect(asked[0]).toMatchObject({ from: { lat: villa.lat }, to: { lat: smn.lat }, fromTitle: "Villa Zambaldi", toTitle: "Florence (Santa Maria Novella)" });
  });

  it("the ways show as chips; a tap joins the run into this card and archives the other", async () => {
    const joined = vi.fn();
    await act(async () => { render(<CardBottomSheet card={drive} run={[drive, train]} onClose={() => {}} days={days} onRunJoined={joined} />); });
    await waitFor(() => expect(wayChip("mix")).toBeTruthy());
    expect(wayChip("mix").textContent).toContain("1 h 20");
    expect(wayChip("mix").textContent).toContain("via Lucca");
    await act(async () => { fireEvent.click(wayChip("mix")); });
    const first = writes.calls.find((c) => (c.patch as { details?: unknown }).details)!.patch as { place_id: string; end_time: string; details: { legs: unknown[]; way: string; mode: string; notes: string } };
    expect(first.place_id).toBe("p-train");
    expect(first.end_time).toBe("09:20:00");
    expect(first.details.legs).toHaveLength(2);
    expect([first.details.way, first.details.mode]).toEqual(["mix", "drive"]);
    expect(first.details.notes).toContain("SMN to the Duomo");
    expect(writes.calls.some((c) => (c.patch as { archived?: boolean }).archived === true)).toBe(true);
    expect(joined).toHaveBeenCalledTimes(1);
    expect(joined.mock.calls[0][2].map((c: Card) => c.id)).toEqual(["train"]);
  });

  it("a card already holding legs shows them and the way it is on; picking the drive takes them off", async () => {
    const one = { ...drive, place: train.place, place_id: "p-train", end_time: "09:20:00", details: { mode: "drive", way: "mix", from: villa, legs: ways[1].legs, estimate: { key: "43.87,10.47>43.776,11.248", drive: 65, transit: 100, rides: 2, via: "train", ways } } } as unknown as Card;
    await act(async () => { render(<CardBottomSheet card={one} onClose={() => {}} days={days} />); });
    expect(screen.getAllByTestId("leg-way-line")).toHaveLength(2);
    expect(wayChip("mix").getAttribute("aria-pressed")).toBe("true");
    // The card is already one and has its ways: nothing is asked.
    expect(asked).toHaveLength(0);
    await act(async () => { fireEvent.click(wayChip("drive")); });
    const p = writes.calls[0].patch as { details: { legs?: unknown; way: string }; end_time: string };
    expect(p.details.legs).toBeUndefined();
    expect([p.details.way, p.end_time]).toEqual(["drive", "09:05:00"]);
  });
  it("a train reads Train, not Google's category code; a bus keeps its number", async () => {
    const legs = [{ mode: "bus", from: villa, to: lucca, at: 0, mins: 22, line: "53" }, { mode: "train", from: lucca, to: smn, at: 30, mins: 81, line: "REG" }];
    const one = { ...drive, place: train.place, place_id: "p-train", details: { mode: "bus", way: "transit", from: villa, legs } } as unknown as Card;
    await act(async () => { render(<CardBottomSheet card={one} onClose={() => {}} days={days} />); });
    const text = screen.getAllByTestId("leg-way-line").map((l) => l.textContent).join(" ");
    expect(text).toContain("Bus 53");
    expect(text).not.toContain("REG");
  });
});
