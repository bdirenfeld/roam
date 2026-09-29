// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import fixture from "@/lib/plan/fixtures/trips.json";
import type { Card, Day, Trip } from "@/types/database";

/**
 * Plan my trip, rendered on Japan's saved pins (28 Sep 2026): 48 places that
 * need about 21 days for a 14-day journey, so the regions are listed and the
 * ones that fit are ticked. "Make a draft" writes one insert of draft cards.
 */

const inserted: Record<string, unknown>[][] = [];
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      insert: (rows: Record<string, unknown>[]) => { inserted.push(rows); return Promise.resolve({ error: null }); },
      delete: () => ({ in: () => Promise.resolve({ error: null }) }),
      select: () => ({ eq: () => Promise.resolve({ data: [] }) }),
    }),
  }),
}));
const toasts: { message: string }[] = [];
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

afterEach(() => { cleanup(); inserted.length = 0; toasts.length = 0; });

describe("Plan my trip sheet", () => {
  it("lists the regions with the days each needs, and ticks what fits", () => {
    render(<PlanMyTripSheet trip={trip} days={days} cards={cards} onClose={vi.fn()} onDrafted={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Plan my trip" })).toBeTruthy();
    const regions = screen.getAllByRole("button", { pressed: true });
    expect(regions.length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole("button", { pressed: false }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/of 13 free days/)).toBeTruthy();
  });

  it("makes one insert of draft cards and hands them back", async () => {
    const onDrafted = vi.fn(), onClose = vi.fn();
    render(<PlanMyTripSheet trip={trip} days={days} cards={cards} onClose={onClose} onDrafted={onDrafted} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Make a draft" })); });
    expect(inserted).toHaveLength(1);
    const rows = inserted[0];
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((r) => (r.details as { draft?: boolean }).draft === true && r.status === "in_itinerary" && typeof r.id === "string")).toBe(true);
    expect(onDrafted).toHaveBeenCalledTimes(1);
    expect((onDrafted.mock.calls[0][0] as Card[])[0].place).toBeTruthy();
    expect(toasts[0].message).toMatch(/^Draft on \d+ days/);
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
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Make a draft" })); });
    const one = inserted[0].length;
    cleanup(); inserted.length = 0;
    render(<PlanMyTripSheet trip={trip} days={days} cards={cards} onClose={vi.fn()} onDrafted={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Make a draft" })); });
    expect(inserted[0].length).toBeGreaterThan(one);
  });
});
