// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { Card, DayWithCards, Trip } from "@/types/database";

/**
 * Travel from the week's empty hour (25 Nov 2026, mock approved). Brennan: on
 * a computer a drive took four steps (type a note, Enter, open it, change its
 * kind), while the phone has had "Add a place → Travel" since 14 Nov. The same
 * Travel row now sits under "What's the plan?" and opens the same Add travel
 * sheet, for that day, leaving at the hour that was clicked.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/hooks/useCardNotes", () => ({ useCardNotes: () => {}, withNotes: (c: Card) => c, warmNotes: () => {} }));
vi.mock("@/components/day/EntryLine", () => ({ default: () => null }));
vi.mock("./WeekMap", () => ({ default: () => null }));
vi.mock("./DocumentsSheet", () => ({ default: () => null }));
vi.mock("@/components/cards/CardBottomSheet", () => ({ default: () => null }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/offline/queuedWrite", () => ({ queuedUpdate: vi.fn(), queuedInsert: vi.fn(), queuedDelete: vi.fn() }));
vi.mock("@/components/trip/useBookingUpload", () => ({ useBookingUpload: () => ({ pick: vi.fn(), reading: false, element: null }) }));
const scheduled: unknown[] = [];
vi.mock("@/lib/scheduleCard", () => ({ unscheduleCard: vi.fn(), scheduleCardOnDay: vi.fn(async (_s: unknown, a: unknown) => { scheduled.push(a); return null; }) }));
// The Add travel sheet, played by a stand-in that shows what it was handed.
type SheetProps = { dayId: string; tripId: string; leaveAt?: string | null; onClose: () => void; onBack: () => void; onCardCreated: (c: Card) => void };
const sheet = vi.hoisted(() => ({ props: null as SheetProps | null }));
vi.mock("./AddTravelSheet", () => ({
  default: (p: SheetProps) => { sheet.props = p; return <div data-testid="add-travel-sheet">{p.dayId} {p.tripId} {String(p.leaveAt)}<button onClick={p.onClose}>close travel</button></div>; },
}));

import WeekBoard from "./WeekBoard";

const dates = ["2027-03-14", "2027-03-15", "2027-03-16"];
const days = dates.map((date, i) => ({ id: `d${i + 1}`, trip_id: "t", day_number: i + 1, date, theme: null, cards: [] as Card[] })) as unknown as DayWithCards[];
const trip = { id: "t", title: "Chris Voss Training", destination: "Irving, TX, USA", start_date: dates[0], end_date: dates[2], destination_lat: 32.8, destination_lng: -96.9 } as unknown as Trip;

beforeEach(() => { scheduled.length = 0; sheet.props = null; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function openEmptyHour() {
  render(<WeekBoard trip={trip} initialDays={days} initialSaved={[]} />);
  fireEvent.click(document.querySelector<HTMLElement>("[data-daycol='d2']")!, { clientY: 0 });
  return screen.getByLabelText("Name the plan");
}

describe("Travel from the week's empty hour", () => {
  it("the empty box offers a Travel row, in the phone's own words", () => {
    openEmptyHour();
    const row = screen.getByTestId("week-travel-row");
    expect(row.textContent).toContain("Travel");
    expect(row.textContent).toContain("Drive, train, bus or ferry between two places");
  });

  it("Travel opens Add travel for that day, leaving at the hour clicked, and makes no note", async () => {
    openEmptyHour();
    fireEvent.click(screen.getByTestId("week-travel-row"));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("add-travel-sheet")).toBeTruthy();
    expect(sheet.props).toMatchObject({ dayId: "d2", tripId: "t" });
    // A click at the very top of the column is the week's first hour, 7 am.
    expect(sheet.props!.leaveAt).toMatch(/^07:00/);
    expect(screen.queryByLabelText("Name the plan")).toBeNull();
    expect(scheduled).toEqual([]);
  });

  it("pressing the row does not blur the box (a blur would make a note first)", () => {
    openEmptyHour();
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    screen.getByTestId("week-travel-row").dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });

  it("once you start typing a name the row steps aside for the place suggestions", () => {
    const box = openEmptyHour();
    fireEvent.change(box, { target: { value: "Dinner" } });
    expect(screen.queryByTestId("week-travel-row")).toBeNull();
  });

  it("closing Add travel leaves the week as it was", async () => {
    openEmptyHour();
    fireEvent.click(screen.getByTestId("week-travel-row"));
    fireEvent.click(screen.getByText("close travel"));
    expect(screen.queryByTestId("add-travel-sheet")).toBeNull();
    expect(scheduled).toEqual([]);
  });

  it("a guest's read-only week has no empty-hour box, so no Travel row", () => {
    render(<WeekBoard trip={trip} initialDays={days} initialSaved={[]} readOnly />);
    fireEvent.click(document.querySelector<HTMLElement>("[data-daycol='d2']")!, { clientY: 0 });
    expect(screen.queryByTestId("week-travel-row")).toBeNull();
  });
});
