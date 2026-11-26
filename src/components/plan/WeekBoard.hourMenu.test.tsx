// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { Card, DayWithCards, Trip } from "@/types/database";

/**
 * Adding from the week's empty hour (26 Nov 2026, clickable mock approved).
 * Brennan: "when they click, then they need to decide, what is the thing that
 * I want to do; then the card type pops up for whatever type they selected,
 * and from that they can populate the card or use a sub category." And: "why
 * can't we reuse the existing cards we've already built". So a click asks
 * Activity / Food / Logistics / Travel (and a quiet Note); a type makes a
 * blank card of that kind at that hour and opens the card he already has;
 * Travel opens Add travel; Note is the old box. A card closed blank is removed.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/hooks/useCardNotes", () => ({ useCardNotes: () => {}, withNotes: (c: Card) => c, warmNotes: () => {} }));
vi.mock("@/components/day/EntryLine", () => ({ default: () => null }));
vi.mock("./WeekMap", () => ({ default: () => null }));
vi.mock("./DocumentsSheet", () => ({ default: () => null }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
const deleted = vi.hoisted(() => [] as unknown[]);
vi.mock("@/lib/offline/queuedWrite", () => ({ queuedUpdate: vi.fn(), queuedInsert: vi.fn(), queuedDelete: vi.fn(async (_t: string, w: unknown) => { deleted.push(w); return { error: null }; }) }));
vi.mock("@/components/trip/useBookingUpload", () => ({ useBookingUpload: () => ({ pick: vi.fn(), reading: false, element: null }) }));
type Args = { dayId: string; placeId: string | null; details?: Record<string, unknown>; startTime?: string | null; endTime?: string | null };
const scheduled = vi.hoisted(() => [] as Args[]);
vi.mock("@/lib/scheduleCard", () => ({
  unscheduleCard: vi.fn(),
  scheduleCardOnDay: vi.fn(async (_s: unknown, a: Args) => {
    scheduled.push(a);
    return { id: "new" + scheduled.length, trip_id: "t", day_id: a.dayId, place_id: null, place: null, status: "in_itinerary", start_time: a.startTime, end_time: a.endTime, position: 0, details: a.details ?? {} };
  }),
}));
// The card he already has, played by a stand-in that shows what it was handed.
type CardProps = { card: Card; askKind?: boolean; onClose: () => void; onCardUpdate?: (c: Card) => void };
const opened = vi.hoisted(() => ({ props: null as CardProps | null }));
vi.mock("@/components/cards/CardBottomSheet", () => ({
  default: (p: CardProps) => { opened.props = p; return <div data-testid="card-sheet">{JSON.stringify(p.card.details)}<button onClick={p.onClose}>close card</button></div>; },
}));
type SheetProps = { dayId: string; tripId: string; leaveAt?: string | null; onClose: () => void };
const travel = vi.hoisted(() => ({ props: null as SheetProps | null }));
vi.mock("./AddTravelSheet", () => ({
  default: (p: SheetProps) => { travel.props = p; return <div data-testid="add-travel-sheet"><button onClick={p.onClose}>close travel</button></div>; },
}));

import WeekBoard from "./WeekBoard";

const dates = ["2027-03-14", "2027-03-15", "2027-03-16"];
const days = dates.map((date, i) => ({ id: `d${i + 1}`, trip_id: "t", day_number: i + 1, date, theme: null, cards: [] as Card[] })) as unknown as DayWithCards[];
const trip = { id: "t", title: "Chris Voss Training", destination: "Irving, TX, USA", start_date: dates[0], end_date: dates[2], destination_lat: 32.8, destination_lng: -96.9 } as unknown as Trip;

beforeEach(() => { scheduled.length = 0; deleted.length = 0; opened.props = null; travel.props = null; toast.mockReset(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function clickEmptyHour(readOnly = false) {
  render(<WeekBoard trip={trip} initialDays={days} initialSaved={[]} readOnly={readOnly} />);
  fireEvent.click(document.querySelector<HTMLElement>("[data-daycol='d2']")!, { clientY: 0 });
}
const pick = async (name: string) => {
  fireEvent.click(screen.getByRole("menuitem", { name }));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};
const settle = async () => { await act(async () => { vi.advanceTimersByTime(10); await Promise.resolve(); }); };

describe("the week's empty hour asks what it is", () => {
  it("a click opens a menu, not a text box: Activity, Food, Logistics, Travel, then Note", () => {
    clickEmptyHour();
    expect(screen.getAllByRole("menuitem").map((b) => b.lastChild!.textContent)).toEqual(["Activity", "Food", "Logistics", "Travel", "Note"]);
    expect(screen.queryByLabelText("Name the plan")).toBeNull();
    // it says which hour: a click at the very top of the column is 7 am
    expect(screen.getByRole("menu").textContent).toContain("7am");
    expect(scheduled).toEqual([]);
  });

  it.each([["Activity", "activity"], ["Food", "food"], ["Logistics", "logistics"]])("%s makes a blank card of that kind at that hour and opens the existing card", async (label, kind) => {
    clickEmptyHour();
    await pick(label);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toMatchObject({ dayId: "d2", placeId: null, details: { kind } });
    expect(scheduled[0].startTime).toMatch(/^07:00/);
    expect(scheduled[0].endTime).toMatch(/^08:00/);
    expect(screen.getByTestId("card-sheet")).toBeTruthy();
    expect(opened.props!.card.id).toBe("new1");
    // …and the card is told to open asking what kind (27 Nov 2026)
    expect(opened.props!.askKind).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closed with nothing filled in, the blank card is removed", async () => {
    clickEmptyHour();
    await pick("Food");
    fireEvent.click(screen.getByText("close card"));
    await settle();
    expect(deleted).toEqual([{ id: "new1" }]);
    expect(document.querySelector("[data-block-id='new1'], [data-card-id='new1']")).toBeNull();
  });

  it.each([
    ["a name", { kind: "food", title: "Dinner near the Duomo" }],
    ["a kind", { kind: "food", kind_type: "food", kind_sub: "coffee" }],
    ["a note", { kind: "food", notes: "ask the villa" }],
  ])("closed with %s on it, the card stays", async (_what, details) => {
    clickEmptyHour();
    await pick("Food");
    await act(async () => { opened.props!.onCardUpdate!({ ...opened.props!.card, details } as unknown as Card); });
    fireEvent.click(screen.getByText("close card"));
    await settle();
    expect(deleted).toEqual([]);
  });

  it("a place attached means the card stays", async () => {
    clickEmptyHour();
    await pick("Activity");
    await act(async () => { opened.props!.onCardUpdate!({ ...opened.props!.card, place_id: "p1", place: { id: "p1", title: "Uffizi", type: "activity", sub_type: "museum" } } as unknown as Card); });
    fireEvent.click(screen.getByText("close card"));
    await settle();
    expect(deleted).toEqual([]);
  });

  it("Travel opens Add travel for that day, leaving at the hour clicked, and makes no card", async () => {
    clickEmptyHour();
    await pick("Travel");
    expect(screen.getByTestId("add-travel-sheet")).toBeTruthy();
    expect(travel.props).toMatchObject({ dayId: "d2", tripId: "t" });
    expect(travel.props!.leaveAt).toMatch(/^07:00/);
    expect(scheduled).toEqual([]);
  });

  it("Note is the box it always was", async () => {
    clickEmptyHour();
    await pick("Note");
    expect(screen.getByLabelText("Name the plan")).toBeTruthy();
    expect(scheduled).toEqual([]);
  });

  it("Escape closes the menu with nothing made", () => {
    clickEmptyHour();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(scheduled).toEqual([]);
  });

  it("a guest's read-only week has no menu", () => {
    clickEmptyHour(true);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
