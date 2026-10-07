// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import type { Trip, Day, DayWithCards, Card } from "@/types/database";

/**
 * Welcome home (7 Oct 2026, delight audit): the first time the organiser opens
 * a journey on the phone in the 14 days after it ends, a small card adds the
 * trip up. The ✕ closes it for good on that phone. Never guests, never a
 * computer, never before, during or after the 14 days.
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

const trip = { id: "t1", title: "Lisbon", destination: "Lisbon, Portugal", destination_lat: 38.72, destination_lng: -9.14, start_date: "2027-05-10", end_date: "2027-05-12", user_id: "u1" } as unknown as Trip;
// Out of order on purpose: the first day is the earliest date, not the first row.
const days = [
  { id: "d2", trip_id: "t1", date: "2027-05-11", day_number: 2 },
  { id: "d1", trip_id: "t1", date: "2027-05-10", day_number: 1 },
  { id: "d3", trip_id: "t1", date: "2027-05-12", day_number: 3 },
] as unknown as Day[];
const dayOf = (id: string) => ({ ...days.find((d) => d.id === id)!, cards: [] as Card[] }) as unknown as DayWithCards;

// Ends 12 May 2027: three days, three places on the days (one twice), two loved.
const welcomeCards = [
  { day_id: "d1", status: "in_itinerary", details: {}, place: { id: "p1", loved: true, type: "activity", sub_type: "self_directed" } },
  { day_id: "d2", status: "in_itinerary", details: {}, place: { id: "p2", loved: false, type: "food", sub_type: "restaurant" } },
  { day_id: "d3", status: "in_itinerary", details: {}, place: { id: "p3", loved: true, type: "activity", sub_type: "self_directed" } },
  { day_id: "d3", status: "in_itinerary", details: {}, place: { id: "p1", loved: true, type: "activity", sub_type: "self_directed" } },
];

beforeEach(() => {
  journeyCards = welcomeCards;
  vids.state = { ready: true, available: { "in-the-app": 1 }, seen: {} };
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} })) as unknown as typeof window.matchMedia;
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function openOn(now: Date, phone = true, readOnly = false) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  await act(async () => {
    render(<DayViewClient trip={trip} days={days} dayWithCards={dayOf("d2")} hotelCards={[]} initialNotes={null} phone={phone} readOnly={readOnly} />);
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
}

describe("Welcome home, after the journey (7 Oct 2026, delight audit)", { timeout: 30000 }, () => {
  it("two days after: the card adds the trip up, and the ✕ hides it for good", async () => {
    await openOn(new Date(2027, 4, 14, 19, 0));
    const card = screen.getByTestId("welcome-home");
    expect(card.textContent).toContain("Welcome home");
    expect(card.textContent).toContain("3 days, 3 places, 2 you loved ♥");
    expect(screen.queryByTestId("trip-underway-video")).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Close welcome home" })); });
    expect(screen.queryByTestId("welcome-home")).toBeNull();
    cleanup();
    await openOn(new Date(2027, 4, 15, 9, 0));
    expect(screen.queryByTestId("welcome-home")).toBeNull();
  });

  it("the 14th day after: still shown; the 15th: not", async () => {
    await openOn(new Date(2027, 4, 26, 9, 0));
    expect(screen.getByTestId("welcome-home")).toBeTruthy();
    cleanup();
    await openOn(new Date(2027, 4, 27, 9, 0));
    expect(screen.queryByTestId("welcome-home")).toBeNull();
  });

  it("not during the trip, not on its last day", async () => {
    await openOn(new Date(2027, 4, 12, 22, 0));
    expect(screen.queryByTestId("welcome-home")).toBeNull();
  });

  it("not for a signed-in guest, not on a computer", async () => {
    await openOn(new Date(2027, 4, 14, 9, 0), true, true);
    expect(screen.queryByTestId("welcome-home")).toBeNull();
    cleanup();
    await openOn(new Date(2027, 4, 14, 9, 0), false);
    expect(screen.queryByTestId("welcome-home")).toBeNull();
  });

  it("storage that can't be read: not shown", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    await openOn(new Date(2027, 4, 14, 9, 0));
    expect(screen.queryByTestId("welcome-home")).toBeNull();
    vi.restoreAllMocks();
  });
});
