// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor, fireEvent } from "@testing-library/react";
import type { Trip, Day, DayWithCards, Card } from "@/types/database";

/**
 * Several bookings at once on the PHONE (6 Oct 2026, taps audit follow-up;
 * mock m10-upload-several). The phone's day had its own single-file upload:
 * one pick, one file, no toast. It now goes through useBookingUpload like the
 * week: Start here reads "Upload bookings / Pick all your confirmations at
 * once", the picker takes several, every file is read through the same route,
 * ONE sheet lists them, and the toast says how many and which days, with Undo.
 */

vi.mock("@/hooks/useHowToVideos", () => ({ SUPABASE_BASE: "", useHowToVideos: () => ({ ready: true, available: {}, seen: {}, markSeen: () => {} }), useVisitorVideo: () => ({ ready: true, available: {}, gone: true, dismiss: () => {} }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }) }));
const toast = vi.fn();
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/lib/supabase/client", () => {
  const make = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const k of ["from", "select", "not", "order", "limit", "eq", "in", "is", "update", "insert", "delete", "upsert"]) chain[k] = self;
    chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    chain.single = () => Promise.resolve({ data: null, error: null });
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
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
vi.mock("@/components/plan/DocumentsSheet", none);
vi.mock("@/components/plan/CreateCardSheet", none);
vi.mock("@/components/companion/Companion", none);
vi.mock("@/components/trip/JourneyNotes", () => ({ JourneyNotesSheet: () => null }));
vi.mock("@/components/search/GlobalSearch", () => ({ useGlobalSearch: () => ({ open: vi.fn() }) }));
vi.mock("@/hooks/useCardNotes", () => ({ useCardNotes: () => ({}), withNotes: (c: unknown) => c }));
vi.mock("@/lib/offline/queuedWrite", () => ({
  queuedInsert: vi.fn(async () => ({ queued: false, error: null })),
  queuedUpdate: vi.fn(async () => ({ queued: false, error: null })),
  queuedDelete: vi.fn(async () => ({ queued: false, error: null })),
}));
// The check-and-add sheet is its own suite (ConfirmationPreviewSheet.test, useBookingUpload.test).
// Here it shows what the hook handed it, and Add hands back two cards: one on this day, one on the next.
const { made } = vi.hoisted(() => ({
  made: [
    { id: "n1", day_id: "d1", trip_id: "t1", status: "in_itinerary", start_time: "10:40", details: { title: "AC 890" }, place: null },
    { id: "n2", day_id: "d2", trip_id: "t1", status: "in_itinerary", start_time: "15:00", details: { title: "Uffizi" }, place: null },
  ],
}));
vi.mock("@/components/plan/ConfirmationPreviewSheet", () => ({
  default: ({ items, files, onCardsCreated }: { items: unknown[]; files?: { name: string }[]; onCardsCreated: (c: unknown[], d: string[], docs?: string[]) => void }) => (
    <div data-testid="preview">
      <span data-testid="preview-count">{`${items.length} bookings from ${(files ?? []).map((f) => f.name).join(", ")}`}</span>
      <button type="button" onClick={() => onCardsCreated(made, [], ["doc1", "doc2"])}>Add them</button>
    </div>
  ),
}));

import DayViewClient from "./DayViewClient";

const trip = { id: "t1", title: "Lisbon", destination: "Lisbon, Portugal", destination_lat: 38.72, destination_lng: -9.14, start_date: "2027-05-10", end_date: "2027-05-12", user_id: "u1" } as unknown as Trip;
const days = [
  { id: "d1", trip_id: "t1", date: "2027-05-10", day_number: 1 },
  { id: "d2", trip_id: "t1", date: "2027-05-11", day_number: 2 },
] as unknown as Day[];
const day1 = { ...days[0], cards: [] as Card[] } as unknown as DayWithCards;

const b = (type: string, title: string, date: string) => ({ type, title, date, time: "10:00", end_time: null, confirmation_number: null, address: null, phone: null, website: null, notes: null });
const PARSED: Record<string, unknown> = {
  "ac890.pdf": { parsed: [b("flight_arrival", "AC 890", "2027-05-10")] },
  "uffizi.png": { parsed: [b("activity", "Uffizi", "2027-05-11")] },
};
const fetchMock = vi.fn(async (url: string, init?: { body?: FormData }) => {
  if (url === "/api/confirmations/parse") {
    const f = init!.body!.get("file") as File;
    return { ok: true, json: async () => PARSED[f.name] };
  }
  return { ok: true, json: async () => ({}) };
});

beforeEach(() => {
  toast.mockReset(); fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} })) as unknown as typeof window.matchMedia;
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("the phone's day uploads several bookings at once", { timeout: 30000 }, () => {
  it("Start here says Upload bookings · Pick all your confirmations at once", async () => {
    await act(async () => { render(<DayViewClient trip={trip} days={days} dayWithCards={day1} hotelCards={[]} initialNotes={null} />); });
    const row = await screen.findByRole("button", { name: /Upload bookings/ });
    expect(row.textContent).toContain("Pick all your confirmations at once");
  });

  it("the picker takes several; each is read, ONE sheet lists them, and the toast says how many with Undo", async () => {
    await act(async () => { render(<DayViewClient trip={trip} days={days} dayWithCards={day1} hotelCards={[]} initialNotes={null} />); });
    const input = screen.getByLabelText("Booking confirmation") as HTMLInputElement;
    expect(input.multiple).toBe(true);
    const files = [new File(["x"], "ac890.pdf", { type: "application/pdf" }), new File(["x"], "uffizi.png", { type: "image/png" })];
    await act(async () => { fireEvent.change(input, { target: { files } }); });
    expect(fetchMock.mock.calls.filter(([u]) => u === "/api/confirmations/parse")).toHaveLength(2);
    expect((await screen.findByTestId("preview-count", {}, { timeout: 5000 })).textContent).toBe("2 bookings from ac890.pdf, uffizi.png");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add them" })); });
    await waitFor(() => expect(toast).toHaveBeenCalled());
    const opts = toast.mock.calls.at(-1)![0] as { message: string; undo?: () => unknown };
    expect(opts.message).toBe("Added 2 bookings · Mon 10 May – Tue 11 May");
    expect(typeof opts.undo).toBe("function");
    expect(screen.queryByTestId("preview")).toBeNull();
  });
});
