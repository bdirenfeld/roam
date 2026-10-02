// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import type { Trip, Day, DayWithCards, Card } from "@/types/database";

/**
 * The phone's day and Start here (Brennan, 2 Oct 2026, a new journey on his
 * phone): "Upload a booking" on every day — "it makes sense to have it on the
 * first day if you haven't uploaded anything, but I don't want it on the
 * other ones." Find places still shows on any day until something is saved.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
// The journey's cards: whatever the test puts here (nothing booked by default).
let journeyCards: unknown[] = [];
vi.mock("@/lib/supabase/client", () => {
  const make = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const k of ["from", "select", "not", "order", "limit", "eq", "in", "is", "update", "insert", "delete", "upsert"]) chain[k] = self;
    chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    chain.single = () => Promise.resolve({ data: null, error: null });
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: journeyCards, error: null }).then(ok);
    chain.auth = { getSession: () => Promise.resolve({ data: { session: null } }) };
    chain.channel = () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) });
    chain.removeChannel = () => undefined;
    return chain;
  };
  return { createClient: () => make() };
});
const { none } = vi.hoisted(() => ({ none: () => ({ default: () => null }) }));
vi.mock("@/components/day/DayMap", none);
vi.mock("@/components/day/DayStrip", none);
vi.mock("@/components/day/DayPicker", none);
vi.mock("@/components/day/PhoneDayCalendar", none);
vi.mock("@/components/day/EntryLine", none);
vi.mock("@/components/day/TimeSheet", none);
vi.mock("@/components/cards/CardBottomSheet", none);
vi.mock("@/components/ui/AppMenu", none);
vi.mock("@/components/plan/ConfirmationPreviewSheet", none);
vi.mock("@/components/plan/DocumentsSheet", none);
vi.mock("@/components/plan/CreateCardSheet", none);
vi.mock("@/components/companion/Companion", none);
vi.mock("@/components/trip/JourneyNotes", () => ({ JourneyNotesSheet: () => null }));
vi.mock("@/components/search/GlobalSearch", () => ({ useGlobalSearch: () => ({ open: vi.fn() }) }));
vi.mock("@/hooks/useCardNotes", () => ({ useCardNotes: () => ({}), withNotes: (c: unknown) => c }));

import DayViewClient from "./DayViewClient";

const trip = { id: "t1", title: "Lisbon", destination: "Lisbon, Portugal", destination_lat: 38.72, destination_lng: -9.14, start_date: "2027-05-10", end_date: "2027-05-12", user_id: "u1" } as unknown as Trip;
// Out of order on purpose: the first day is the earliest date, not the first row.
const days = [
  { id: "d2", trip_id: "t1", date: "2027-05-11", day_number: 2 },
  { id: "d1", trip_id: "t1", date: "2027-05-10", day_number: 1 },
  { id: "d3", trip_id: "t1", date: "2027-05-12", day_number: 3 },
] as unknown as Day[];
const dayOf = (id: string) => ({ ...days.find((d) => d.id === id)!, cards: [] as Card[] }) as unknown as DayWithCards;

beforeEach(() => {
  journeyCards = [];
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} })) as unknown as typeof window.matchMedia;
});
afterEach(() => { vi.unstubAllGlobals(); });

async function open(dayId: string) {
  await act(async () => {
    render(<DayViewClient trip={trip} days={days} dayWithCards={dayOf(dayId)} hotelCards={[]} initialNotes={null} />);
  });
  await waitFor(() => expect(screen.getByTestId("start-here")).toBeTruthy());
}

describe("Start here on the phone's day", { timeout: 30000 }, () => {
  it("the journey's first day, nothing uploaded: Upload a booking and Find places", async () => {
    await open("d1");
    expect(screen.getByRole("button", { name: /Upload a booking/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Find places/ })).toBeTruthy();
  });

  it("any other day: Find places only, no Upload a booking", async () => {
    await open("d2");
    expect(screen.queryByRole("button", { name: /Upload a booking/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Find places/ })).toBeTruthy();
  });

  it("the first day once a booking is on the journey: no Upload a booking there either", async () => {
    journeyCards = [{ day_id: "d1", status: "in_itinerary", details: null, place: { type: "logistics", sub_type: "hotel" } }];
    await open("d1");
    expect(screen.queryByRole("button", { name: /Upload a booking/ })).toBeNull();
  });
});
