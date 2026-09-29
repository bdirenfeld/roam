// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import type { Card, Trip } from "@/types/database";
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
const result: FindResult = { placeId: "g1", name: "Trattoria Da Enzo", address: "Via dei Vascellari 29", lat: 41.888, lng: 12.476, rating: 4.6, reviews: 9000, why: "Reddit's favourite in Trastevere.", source: { name: "r/rome", url: "https://reddit.com/r/rome/x" }, from: "travellers", kids: false };

const calls: { url: string; body: Record<string, unknown> }[] = [];
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    if (url === "/api/find") return { ok: true, json: async () => ({ results: [result], travellers: true }) };
    return { ok: true, json: async () => ({ imported: [{ place_id: "p1", google_place_id: "g1", title: "Da Enzo al 29" }] }) };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); inserted.length = 0; toasts.length = 0; calls.length = 0; });

describe("Find sheet", () => {
  it("on an empty map, searches the destination for the first gap straight away", async () => {
    await act(async () => { render(<FindSheet trip={trip} days={[]} cards={[] as Card[]} onClose={vi.fn()} onSaved={vi.fn()} />); });
    expect(screen.getByRole("dialog", { name: "Find places" })).toBeTruthy();
    expect(calls.map((c) => c.body.mode)).toEqual(["google", "travellers"]);
    expect(calls[0].body).toMatchObject({ tripId: "t1", base: { label: "Rome", lat: 41.9, lng: 12.5 }, subType: "self_directed" });
    expect(screen.getByText("Trattoria Da Enzo")).toBeTruthy();
    expect(screen.getByRole("link", { name: "r/rome" })).toBeTruthy();
    // Every category is Roam's own sub-type, shown as "have of want".
    expect(screen.getByRole("button", { name: /Restaurant · 0 of \d+/ })).toBeTruthy();
  });

  it("Save imports the place with the category's type and adds one saved pin", async () => {
    const onSaved = vi.fn();
    await act(async () => { render(<FindSheet trip={trip} days={[]} cards={[] as Card[]} onClose={vi.fn()} onSaved={onSaved} />); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    expect(calls[2]).toMatchObject({ url: "/api/places/bulk-import", body: { google_place_ids: ["g1"], defaults: { type: "activity", sub_type: "self_directed" } } });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ trip_id: "t1", day_id: null, place_id: "p1", status: "interested", position: 0 });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(toasts[0].message).toBe("Saved Trattoria Da Enzo to your map");
    expect(screen.getByRole("button", { name: "Saved ✓" })).toBeTruthy();
  });

  it("switching category searches again, and coming back uses what it found", async () => {
    await act(async () => { render(<FindSheet trip={trip} days={[]} cards={[] as Card[]} onClose={vi.fn()} onSaved={vi.fn()} />); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Restaurant/ })); });
    expect(calls.slice(2).map((c) => [c.body.subType, c.body.mode])).toEqual([["restaurant", "google"], ["restaurant", "travellers"]]);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Explore/ })); });
    expect(calls).toHaveLength(4);
  });

  it("shows Google's places at once and puts the travellers' on top when they land", async () => {
    let land: (v: unknown) => void = () => {};
    const google: FindResult = { ...result, placeId: "g2", name: "Colosseum", from: "google", source: null, why: "Rated 4.8 on Google." };
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      if (body.mode === "google") return { ok: true, json: async () => ({ results: [google] }) };
      await new Promise((r) => { land = r; });
      return { ok: true, json: async () => ({ results: [result] }) };
    }));
    await act(async () => { render(<FindSheet trip={trip} days={[]} cards={[] as Card[]} onClose={vi.fn()} onSaved={vi.fn()} />); });
    expect(screen.getByText("Colosseum")).toBeTruthy();
    expect(screen.getByText("Adding what travellers recommend…")).toBeTruthy();
    await act(async () => { land(null); });
    const names = screen.getAllByText(/Colosseum|Trattoria Da Enzo/).map((e) => e.textContent);
    expect(names).toEqual(["Trattoria Da Enzo", "Colosseum"]);
    expect(screen.queryByText("Adding what travellers recommend…")).toBeNull();
  });
});
