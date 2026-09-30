// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import fixture from "@/lib/plan/fixtures/trips.json";
import type { Card, Day, Trip } from "@/types/database";

/**
 * Plan my trip, rendered on Japan's saved pins (28 Sep 2026): 48 places that
 * need about 21 days for a 14-day journey, so the regions are listed and the
 * ones that fit are ticked. "Plan the trip" writes one insert of ordinary cards.
 */

const inserted: Record<string, unknown>[][] = [];
const deleted: string[][] = [];
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      insert: (rows: Record<string, unknown>[]) => { inserted.push(rows); return Promise.resolve({ error: null }); },
      delete: () => ({ in: (_k: string, ids: string[]) => { deleted.push(ids); return Promise.resolve({ error: null }); } }),
      select: () => ({ eq: () => Promise.resolve({ data: [] }) }),
    }),
  }),
}));
const toasts: { message: string }[] = [];
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: (t: { message: string }) => toasts.push(t) }) }));

import PlanMyTripSheet from "./PlanMyTripSheet";

const DAYNAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
type Row = { t: string; ty: string; st: string | null; la: number | null; ln: number | null; open?: string | null; types?: string[] };
const cards = (fixture.trips.find((t) => t.title === "Japan")!.pins as Row[]).map((p, i) => ({
  id: `c${i}`, trip_id: "t1", day_id: null, status: "interested", position: 0, details: {}, start_time: null, end_time: null, place_id: `p${i}`,
  place: { id: `p${i}`, title: p.t, type: p.ty, sub_type: p.st, lat: p.la, lng: p.ln, address: null, types: p.types ?? [],
    hours: p.open ? { weekday_text: DAYNAMES.map((d, k) => `${d}: ${p.open![k] === "1" ? "9:00 AM – 6:00 PM" : "Closed"}`) } : null },
})) as unknown as Card[];
const days = Array.from({ length: 14 }, (_, i) => ({ id: `d${i + 1}`, trip_id: "t1", day_number: i + 1, date: new Date(Date.UTC(2028, 3, 2 + i)).toISOString().slice(0, 10) })) as unknown as Day[];
// As in the database: five travelling, no ages saved.
const trip = { id: "t1", title: "Japan", destination: "Japan", party_ages: null, party_size: 5, start_date: "2028-04-02" } as unknown as Trip;

afterEach(() => { cleanup(); inserted.length = 0; deleted.length = 0; toasts.length = 0; });

describe("Plan my trip sheet", () => {
  it("lists the regions with the days each needs, and ticks what fits", () => {
    render(<PlanMyTripSheet trip={trip} days={days} cards={cards} onClose={vi.fn()} onDrafted={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Plan my trip" })).toBeTruthy();
    const regions = screen.getAllByRole("button", { pressed: true });
    expect(regions.length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole("button", { pressed: false }).length).toBeGreaterThanOrEqual(1);
    // 14 days less settling in, the last half day and two days off (lib/plan/pace).
    expect(screen.getByText(/of 10.5 free days/)).toBeTruthy();
  });

  it("plans the trip in one insert and hands the cards back", async () => {
    const onDrafted = vi.fn(), onClose = vi.fn();
    const asked: { url: string; body: { tripId: string; cardIds: string[] } }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: { body: string }) => { asked.push({ url, body: JSON.parse(init.body) }); return { json: async () => ({ written: 0 }) }; }));
    render(<PlanMyTripSheet trip={trip} days={days} cards={cards} onClose={onClose} onDrafted={onDrafted} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Plan the trip" })); });
    expect(inserted).toHaveLength(1);
    // Every new card's Intent and Know before you go is asked for, in one request.
    expect(asked).toHaveLength(1);
    expect(asked[0].url).toBe("/api/plan/notes");
    expect(asked[0].body.cardIds.sort()).toEqual(inserted[0].map((r) => r.id as string).sort());
    vi.unstubAllGlobals();
    const rows = inserted[0];
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((r) => (r.details as { plan?: { day: string } }).plan?.day === r.day_id && r.status === "in_itinerary" && typeof r.id === "string")).toBe(true);
    expect(onDrafted).toHaveBeenCalledTimes(1);
    expect((onDrafted.mock.calls[0][0] as Card[])[0].place).toBeTruthy();
    expect(toasts[0].message).toMatch(/^Planned \d+ places on \d+ days$/);
    expect(onClose).toHaveBeenCalled();
    // A party of five with no ages saved may have children: bars are a late evening, from nine.
    const bars = cards.filter((c) => c.place!.sub_type === "bar").map((c) => c.place_id);
    const barRows = rows.filter((r) => bars.includes(r.place_id as string));
    expect(barRows.length).toBeGreaterThan(0);
    for (const r of barRows) if (r.start_time) expect((r.start_time as string) >= "21:00").toBe(true);
  });

  it("unticking a region leaves its places out", async () => {
    render(<PlanMyTripSheet trip={trip} days={days} cards={cards} onClose={vi.fn()} onDrafted={vi.fn()} />);
    const ticked = screen.getAllByRole("button", { pressed: true });
    fireEvent.click(ticked[0]);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Plan the trip" })); });
    const one = inserted[0].length;
    cleanup(); inserted.length = 0;
    render(<PlanMyTripSheet trip={trip} days={days} cards={cards} onClose={vi.fn()} onDrafted={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Plan the trip" })); });
    expect(inserted[0].length).toBeGreaterThan(one);
  });

  it("removes what Plan my trip added and nobody has moved, and leaves what was moved", async () => {
    const put = { ...cards[0], id: "k1", status: "in_itinerary", day_id: "d3", start_time: "10:00:00", details: { plan: { day: "d3", start: "10:00:00" } } } as Card;
    const moved = { ...cards[1], id: "k2", status: "in_itinerary", day_id: "d5", start_time: "10:00:00", details: { plan: { day: "d4", start: "10:00:00" } } } as Card;
    render(<PlanMyTripSheet trip={trip} days={days} cards={[...cards, put, moved]} onClose={vi.fn()} onDrafted={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Remove what Plan my trip added (1 place)" })); });
    expect(deleted).toEqual([["k1"]]);
    expect(toasts[0].message).toBe("Removed 1 place Plan my trip added");
  });

  it("when the places need more days than the trip has, it says some stay saved, not 'N of fewer days'", () => {
    // Tokyo alone: one area, many days of places, a two-day journey.
    const tokyo = cards.filter((c) => c.place && Math.abs(c.place.lat! - 35.68) < 0.3 && Math.abs(c.place.lng! - 139.7) < 0.4);
    render(<PlanMyTripSheet trip={trip} days={days.slice(0, 2)} cards={tokyo} onClose={vi.fn()} onDrafted={vi.fn()} />);
    expect(screen.getByText(/so some stay saved/)).toBeTruthy();
    expect(screen.queryByText(/of 1 free days/)).toBeNull();
  });
});
