// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import type { Trip, Day, DayWithCards, Card } from "@/types/database";

/**
 * Video 4 on the phone's day (2 Oct 2026): "Your trip's started · Watch: Using
 * Roam on your trip" at the top of the day while the journey is under way, by
 * the phone's own date. Not before or after the trip, not once played or ✕'d,
 * not on a computer.
 */

const vids = vi.hoisted(() => ({ state: { ready: true, available: { "in-the-app": 1 } as Record<string, number>, seen: {} as Record<string, string> } }));
vi.mock("@/hooks/useHowToVideos", () => ({ SUPABASE_BASE: "", useHowToVideos: () => ({ ...vids.state, markSeen: () => {} }), useVisitorVideo: () => ({ ready: true, available: {}, gone: true, dismiss: () => {} }) }));
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
import japan from "@/lib/plan/fixtures/japan-start.json";

const trip = { id: "t1", title: "Lisbon", destination: "Lisbon, Portugal", destination_lat: 38.72, destination_lng: -9.14, start_date: "2027-05-10", end_date: "2027-05-12", user_id: "u1" } as unknown as Trip;
// Out of order on purpose: the first day is the earliest date, not the first row.
const days = [
  { id: "d2", trip_id: "t1", date: "2027-05-11", day_number: 2 },
  { id: "d1", trip_id: "t1", date: "2027-05-10", day_number: 1 },
  { id: "d3", trip_id: "t1", date: "2027-05-12", day_number: 3 },
] as unknown as Day[];
const dayOf = (id: string) => ({ ...days.find((d) => d.id === id)!, cards: [] as Card[] }) as unknown as DayWithCards;

beforeEach(() => {
  // Stops planned, so Start here stays away and this card is the only one.
  journeyCards = japan.cards.map((c) => ({ ...c, day_id: c.day_id === japan.first_day ? "d1" : c.day_id }));
  vids.state = { ready: true, available: { "in-the-app": 1 }, seen: {} };
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} })) as unknown as typeof window.matchMedia;
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

async function openOn(now: Date, phone = true, readOnly = false) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  await act(async () => {
    render(<DayViewClient trip={trip} days={days} dayWithCards={dayOf("d2")} hotelCards={[]} initialNotes={null} phone={phone} readOnly={readOnly} />);
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
}

describe("Your trip's started, on the phone's day", { timeout: 30000 }, () => {
  it("the journey under way: the card, with its words", async () => {
    await openOn(new Date(2027, 4, 11, 9, 0));
    const card = screen.getByTestId("trip-underway-video");
    expect(card.textContent).toContain("Your trip’s started");
    expect(card.textContent).toContain("Watch: Using Roam on your trip");
    expect(card.textContent).toContain("1 min");
    expect(screen.getByRole("button", { name: "Close video" })).toBeTruthy();
    expect(screen.queryByTestId("start-here")).toBeNull();
  });

  it("the last day, late evening: still under way", async () => {
    await openOn(new Date(2027, 4, 12, 22, 30));
    expect(screen.getByTestId("trip-underway-video")).toBeTruthy();
  });

  it("the evening before the trip: no card", async () => {
    await openOn(new Date(2027, 4, 9, 21, 0));
    expect(screen.queryByTestId("trip-underway-video")).toBeNull();
  });

  it("the day after it ends: no card", async () => {
    await openOn(new Date(2027, 4, 13, 8, 0));
    expect(screen.queryByTestId("trip-underway-video")).toBeNull();
  });

  it("already played or closed: no card", async () => {
    vids.state = { ready: true, available: { "in-the-app": 1 }, seen: { "in-the-app": "2027-05-10T12:00:00Z" } };
    await openOn(new Date(2027, 4, 11, 9, 0));
    expect(screen.queryByTestId("trip-underway-video")).toBeNull();
  });

  it("not on a computer", async () => {
    await openOn(new Date(2027, 4, 11, 9, 0), false);
    expect(screen.queryByTestId("trip-underway-video")).toBeNull();
  });

  it("a signed-in guest: no card, it's the organiser's video (2 Oct 2026)", async () => {
    await openOn(new Date(2027, 4, 11, 9, 0), true, true);
    expect(screen.queryByTestId("trip-underway-video")).toBeNull();
  });

  it("video 4 not switched on: no card", async () => {
    vids.state = { ready: true, available: {}, seen: {} };
    await openOn(new Date(2027, 4, 11, 9, 0));
    expect(screen.queryByTestId("trip-underway-video")).toBeNull();
  });
});
