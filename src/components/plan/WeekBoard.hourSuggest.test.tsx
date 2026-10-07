// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { Card, DayWithCards, Trip } from "@/types/database";

/**
 * The empty hour suggests places (6 Oct 2026, taps audit). Typing in the box
 * shows the journey's saved places first, then Google's; a pick makes the block
 * already linked (place_id set). Enter with no pick still makes a plain note.
 * Before: always a plain note, and linking it took 5 to 12 more taps.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/hooks/useCardNotes", () => ({ useCardNotes: () => {}, withNotes: (c: Card) => c, warmNotes: () => {} }));
vi.mock("@/components/day/EntryLine", () => ({ default: () => null }));
vi.mock("./WeekMap", () => ({ default: () => null }));
vi.mock("./DocumentsSheet", () => ({ default: () => null }));
vi.mock("@/components/cards/CardBottomSheet", () => ({ default: () => null }));
const toast = vi.fn();
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast }) }));
const santAntonio = { id: "p-sa", title: "Buca di Sant'Antonio", type: "food", sub_type: "restaurant", lat: 43.84, lng: 10.5, address: "Via della Cervia, Lucca", google_place_id: "g-sa" };
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: santAntonio }) }) }) }) }),
}));
vi.mock("@/lib/offline/queuedWrite", () => ({ queuedUpdate: vi.fn(), queuedInsert: vi.fn(), queuedDelete: vi.fn() }));
vi.mock("@/components/trip/useBookingUpload", () => ({ useBookingUpload: () => ({ pick: vi.fn(), reading: false, element: null }) }));
type Args = { placeId: string | null; place?: unknown; details?: unknown; dayId: string; startTime?: string | null };
const scheduled: Args[] = [];
vi.mock("@/lib/scheduleCard", () => ({
  unscheduleCard: vi.fn(),
  scheduleCardOnDay: vi.fn(async (_s: unknown, a: Args) => {
    scheduled.push(a);
    return { id: `new-${scheduled.length}`, trip_id: "t", day_id: a.dayId, place_id: a.placeId, place: a.place ?? null, details: a.details ?? {}, start_time: a.startTime, end_time: null, status: "in_itinerary", position: 9 };
  }),
}));

import WeekBoard from "./WeekBoard";

const mario = { id: "p-mario", title: "Buca Mario", type: "food", sub_type: "restaurant", lat: 43.77, lng: 11.25, address: "Piazza degli Ottaviani, Florence", google_place_id: "g-mario" };
const dates = ["2027-08-24", "2027-08-25", "2027-08-26"];
const days = dates.map((date, i) => ({ id: `d${i + 1}`, trip_id: "t", day_number: i + 1, date, theme: null, cards: [] as Card[] })) as unknown as DayWithCards[];
const savedMario = { id: "s1", trip_id: "t", day_id: null, place_id: mario.id, place: mario, status: "saved", details: {} } as unknown as Card;
const trip = { id: "t", title: "Tuscany", destination: "Tuscany, Italy", start_date: dates[0], end_date: dates[2], destination_lat: 43.5, destination_lng: 11.2 } as unknown as Trip;

const fetchMock = vi.fn(async (url: string) => {
  if (url.startsWith("/api/places/autocomplete")) return { ok: true, json: async () => ({ predictions: [
    { place_id: "g-mario", description: "Buca Mario, Florence", structured_formatting: { main_text: "Buca Mario", secondary_text: "Florence" } },
    { place_id: "g-sa", description: "Buca di Sant'Antonio, Lucca", structured_formatting: { main_text: "Buca di Sant'Antonio", secondary_text: "Via della Cervia, Lucca" } },
  ] }) };
  if (url === "/api/places/bulk-import") return { ok: true, json: async () => ({ imported: [{ place_id: "p-sa" }] }) };
  return { ok: false, json: async () => ({}) };
});

beforeEach(() => { scheduled.length = 0; toast.mockReset(); vi.stubGlobal("fetch", fetchMock); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function typeInEmptyHour(text: string) {
  render(<WeekBoard trip={trip} initialDays={days} initialSaved={[savedMario]} />);
  const col = document.querySelector<HTMLElement>("[data-daycol='d2']")!;
  fireEvent.click(col, { clientY: 0 });
  const box = screen.getByLabelText("Name the plan");
  fireEvent.change(box, { target: { value: text } });
  await act(async () => { vi.advanceTimersByTime(350); });
  await act(async () => { await Promise.resolve(); });
  return box;
}

describe("the empty hour's suggestions", () => {
  it("lists saved places first, then Google's without repeating a saved one", async () => {
    await typeInEmptyHour("Buca");
    const list = screen.getByTestId("hour-suggest");
    const names = Array.from(list.querySelectorAll("[role='option']")).map((o) => o.textContent);
    expect(names[0]).toContain("Buca Mario");
    expect(names[1]).toContain("Buca di Sant'Antonio");
    expect(names).toHaveLength(2);
    expect(list.textContent).toContain("Saved");
    expect(list.textContent).toContain("From Google");
  });

  it("picking a saved place makes a linked block and says '<name> at <time>'", async () => {
    await typeInEmptyHour("Buca");
    await act(async () => { fireEvent.click(screen.getByRole("option", { name: /Buca Mario/ })); });
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toMatchObject({ placeId: "p-mario", dayId: "d2" });
    expect(toast.mock.calls.at(-1)![0].message).toMatch(/^Buca Mario at /);
    expect(typeof toast.mock.calls.at(-1)![0].undo).toBe("function");
  });

  it("picking a Google row saves the place, then links the block to it", async () => {
    await typeInEmptyHour("Buca");
    await act(async () => { fireEvent.click(screen.getByRole("option", { name: /Sant'Antonio/ })); });
    expect(fetchMock).toHaveBeenCalledWith("/api/places/bulk-import", expect.anything());
    expect(scheduled[0]).toMatchObject({ placeId: "p-sa" });
    expect(toast.mock.calls.at(-1)![0].message).toMatch(/^Buca di Sant'Antonio at /);
  });

  it("Enter with nothing picked still makes a plain note", async () => {
    const box = await typeInEmptyHour("Buca");
    await act(async () => { fireEvent.keyDown(box, { key: "Enter" }); });
    expect(scheduled[0]).toMatchObject({ placeId: null, details: { title: "Buca" } });
  });
});
