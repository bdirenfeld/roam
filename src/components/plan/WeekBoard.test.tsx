// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Card, DayWithCards, Trip } from "@/types/database";

/**
 * The week's top rows (1 Oct 2026): the Anytime lane became the hotel band,
 * and untimed cards moved into their own day's header. Tuscany as stored: the
 * villa on 24 Aug at 2 pm, a "Check out of the villa" card on 4 Sep, and the
 * Cathedral on Friday with no time.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/hooks/useCardNotes", () => ({ useCardNotes: () => {}, withNotes: (c: Card) => c, warmNotes: () => {} }));
vi.mock("@/components/day/EntryLine", () => ({ default: () => null }));
// The map, with its onDraftCreated kept so a test can play Plan my trip's part.
let mapDraftCreated: ((created: Card[]) => void) | null = null;
vi.mock("./WeekMap", () => ({ default: (p: { onDraftCreated: (c: Card[]) => void }) => { mapDraftCreated = p.onDraftCreated; return null; } }));
vi.mock("./DocumentsSheet", () => ({ default: () => null }));
vi.mock("@/components/cards/CardBottomSheet", () => ({ default: ({ card }: { card: Card }) => <div data-testid="sheet">{card.place?.title}</div> }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/offline/queuedWrite", () => ({ queuedUpdate: vi.fn(), queuedInsert: vi.fn(), queuedDelete: vi.fn() }));

// The booking upload, with its onAdded handed back so a test can play the sheet's part.
let uploadAdded: ((cards: Card[], deletedIds: string[]) => void) | null = null;
vi.mock("@/components/trip/useBookingUpload", () => ({
  useBookingUpload: (o: { onAdded: (cards: Card[], deletedIds: string[]) => void }) => { uploadAdded = o.onAdded; return { pick: vi.fn(), reading: false, element: null }; },
}));

import WeekBoard from "./WeekBoard";
import { act } from "@testing-library/react";

const villa = { id: "villa", title: "Villa Zambaldi", type: "logistics", sub_type: "hotel", lat: 43.87, lng: 10.45, address: "Via Fonda" };
const cathedral = { id: "cat", title: "Cathedral of Santa Maria", type: "activity", sub_type: "sight", lat: 43.77, lng: 11.25, address: "Piazza del Duomo" };
const card = (id: string, dayId: string, place: typeof villa, extra: Partial<Card> = {}) =>
  ({ id, trip_id: "t", day_id: dayId, place_id: place.id, place, status: "in_itinerary", position: 1, details: {}, start_time: null, end_time: null, ...extra }) as unknown as Card;

const dates = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2027, 7, 24 + i)).toISOString().slice(0, 10));
const days = dates.map((date, i) => ({ id: `d${i + 1}`, trip_id: "t", day_number: i + 1, date, theme: null, cards: [] as Card[] })) as unknown as DayWithCards[];
days[0].cards.push(card("in", "d1", villa, { start_time: "14:00:00" }));
days[3].cards.push(card("c1", "d4", cathedral));
days[11].cards.push(card("out", "d12", villa, { start_time: "08:00:00", details: { title: "Check out of the villa" } }));
const trip = { id: "t", title: "Tuscany", destination: "Tuscany, Italy", start_date: dates[0], end_date: dates[11] } as unknown as Trip;

afterEach(cleanup);

describe("the week's top rows", () => {
  it("has no Anytime lane and no hotel band; the villa is its check-in block", () => {
    render(<WeekBoard trip={trip} initialDays={days} initialSaved={[]} />);
    expect(screen.queryByText("Anytime")).toBeNull();
    expect(screen.queryByTestId("stay-band")).toBeNull();
    expect(screen.getByText("Check in · Villa Zambaldi")).toBeTruthy();
  });

  it("puts the untimed Cathedral in Friday's header", () => {
    render(<WeekBoard trip={trip} initialDays={days} initialSaved={[]} />);
    const untimed = screen.getAllByTestId("day-untimed");
    expect(untimed).toHaveLength(1);
    expect(untimed[0].textContent).toBe("Cathedral of Santa Maria");
    expect(untimed[0].closest("[data-testid='day-header']")?.textContent).toContain("Fri");
  });

  it("Tuscany has its villa and a place: no Start here", () => {
    render(<WeekBoard trip={trip} initialDays={days} initialSaved={[]} />);
    expect(screen.queryByTestId("start-here")).toBeNull();
  });

  it("a new journey: Start here over the week, and Find places opens Find on the map (1 Oct 2026)", () => {
    const empty = dates.map((date, i) => ({ id: `n${i + 1}`, trip_id: "t", day_number: i + 1, date, theme: null, cards: [] as Card[] })) as unknown as DayWithCards[];
    const opened = vi.fn();
    window.addEventListener("roam:open-find", opened);
    render(<WeekBoard trip={trip} initialDays={empty} initialSaved={[]} />);
    const start = screen.getByTestId("start-here");
    // The week's picker takes several files (6 Oct 2026, taps audit).
    expect(start.textContent).toContain("Upload bookings");
    fireEvent.click(screen.getByRole("button", { name: /Find places/ }));
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener("roam:open-find", opened);
    // Only the hotel booked: Find places is all that is left.
    cleanup();
    const booked = empty.map((d, i) => (i === 0 ? { ...d, cards: [card("in2", d.id, villa, { start_time: "14:00:00" })] } : d)) as DayWithCards[];
    render(<WeekBoard trip={trip} initialDays={booked} initialSaved={[]} />);
    expect(screen.queryByRole("button", { name: /Upload (a )?booking/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Find places/ })).toBeTruthy();
  });

  it("a stop planned but nothing booked: no Start here over the week (2 Oct 2026)", () => {
    const planned = dates.map((date, i) => ({ id: `p${i + 1}`, trip_id: "t", day_number: i + 1, date, theme: null, cards: i === 2 ? [card("cat2", `p${i + 1}`, cathedral, { start_time: "10:00:00" })] : [] })) as unknown as DayWithCards[];
    render(<WeekBoard trip={trip} initialDays={planned} initialSaved={[]} />);
    expect(screen.queryByTestId("start-here")).toBeNull();
  });

  it("Start here steps aside while Find is open, and comes back when it closes (2 Oct 2026)", () => {
    const empty = dates.map((date, i) => ({ id: `f${i + 1}`, trip_id: "t", day_number: i + 1, date, theme: null, cards: [] as Card[] })) as unknown as DayWithCards[];
    render(<WeekBoard trip={trip} initialDays={empty} initialSaved={[]} />);
    const holder = () => screen.getByTestId("start-here").parentElement!.parentElement!.parentElement!;
    expect(holder().className).not.toMatch(/\bhidden\b/);
    act(() => { window.dispatchEvent(new CustomEvent("roam:find-open", { detail: true })); });
    expect(holder().className).toMatch(/\bhidden\b/);
    act(() => { window.dispatchEvent(new CustomEvent("roam:find-open", { detail: false })); });
    expect(holder().className).not.toMatch(/\bhidden\b/);
  });

  it("the plan's bar counts days in plain English: one day, two days", () => {
    const { container } = render(<WeekBoard trip={trip} initialDays={days} initialSaved={[]} />);
    act(() => { mapDraftCreated!([card("p1", "d2", cathedral, { start_time: "10:00:00" })]); });
    expect(container.querySelector("[data-plan-tray]")!.textContent).toMatch(/Planned 1 place on 1 day(?!s)/);
    act(() => { mapDraftCreated!([card("p2", "d2", cathedral, { start_time: "10:00:00" }), card("p3", "d3", cathedral, { start_time: "11:00:00" })]); });
    expect(container.querySelector("[data-plan-tray]")!.textContent).toMatch(/Planned 2 places on 2 days/);
  });

  it("an uploaded booking lands on its day without Plan my trip's tray (2 Oct 2026)", () => {
    const empty = dates.map((date, i) => ({ id: `u${i + 1}`, trip_id: "t", day_number: i + 1, date, theme: null, cards: [] as Card[] })) as unknown as DayWithCards[];
    const { container } = render(<WeekBoard trip={trip} initialDays={empty} initialSaved={[]} />);
    act(() => { uploadAdded!([card("bk", "u1", villa, { start_time: "15:00:00" })], []); });
    expect(screen.getByText("Check in · Villa Zambaldi")).toBeTruthy();
    expect(container.querySelector("[data-plan-tray]")).toBeNull();
  });

  it("next week, the last morning's villa card reads as the check-out", () => {
    render(<WeekBoard trip={trip} initialDays={days} initialSaved={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByText("Check out · Villa Zambaldi")).toBeTruthy();
    expect(screen.queryByText("Check in · Villa Zambaldi")).toBeNull();
  });
});
describe("day names on the week (6 Oct 2026, designer audit)", () => {
  // Tuscany as stored: no day has a typed name (days.theme is null on all 12),
  // and the old header printed the automatic one — "Piazza San Michele" over
  // the Piazza San Michele card in the same column.
  const piazza = { id: "psm", title: "Piazza San Michele", type: "activity", sub_type: "self_directed", lat: 43.84, lng: 10.5, address: "Piazza San Michele, Lucca" };
  const named = dates.map((date, i) => ({
    id: `n${i + 1}`, trip_id: "t", day_number: i + 1, date,
    theme: i === 1 ? "Rest, Lucca evening" : null,
    cards: i === 0 ? [card("p1", "n1", piazza as unknown as typeof villa, { start_time: "10:00:00", end_time: "12:30:00" })] : [] as Card[],
  })) as unknown as DayWithCards[];

  it("prints a name he typed, and no automatic one", () => {
    render(<WeekBoard trip={trip} initialDays={named} initialSaved={[]} />);
    const names = screen.getAllByTestId("day-name").map((n) => n.textContent?.trim());
    expect(names[0]).toBe("");                  // automatic "Piazza San Michele": hidden
    expect(names[1]).toBe("Rest, Lucca evening"); // typed: shown
    // The card itself is still on the board.
    expect(screen.getAllByText("Piazza San Michele").length).toBeGreaterThan(0);
  });

  it("Rename this day still opens with the automatic name as the hint", () => {
    render(<WeekBoard trip={trip} initialDays={named} initialSaved={[]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Day actions" })[0]);
    fireEvent.click(screen.getByText("Rename this day"));
    expect((screen.getByLabelText("Name this day") as HTMLInputElement).placeholder).toBe("Piazza San Michele");
  });
});

describe("the opened day's note line (6 Oct 2026 bug: a raw **Intent**)", () => {
  it("shows the note's first sentence, not its heading", () => {
    const piazza = { id: "psm2", title: "Piazza San Michele", type: "activity", sub_type: "self_directed", lat: 43.84, lng: 10.5, address: null };
    const withNote = dates.map((date, i) => ({
      id: `w${i + 1}`, trip_id: "t", day_number: i + 1, date, theme: null,
      cards: i === 0 ? [card("pn", "w1", piazza as unknown as typeof villa, { start_time: "10:00:00", end_time: "12:30:00", details: { notes: "**Intent**\nThe heart of Lucca, a Romanesque church in a wide square.\n\n**Know before you go**\n- Free." } })] : [] as Card[],
    })) as unknown as DayWithCards[];
    const { container } = render(<WeekBoard trip={trip} initialDays={withNote} initialSaved={[]} />);
    fireEvent.click(screen.getAllByTestId("day-header")[0]);
    expect(screen.getByTestId("day-focused")).toBeTruthy();
    expect(container.textContent).not.toMatch(/\*\*Intent\*\*/);
    expect(screen.getAllByText("The heart of Lucca, a Romanesque church in a wide square.").length).toBeGreaterThan(0);
  });
});
