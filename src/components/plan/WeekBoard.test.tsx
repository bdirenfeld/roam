// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
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
vi.mock("./WeekMap", () => ({ default: () => null }));
vi.mock("./DocumentsSheet", () => ({ default: () => null }));
vi.mock("@/components/cards/CardBottomSheet", () => ({ default: ({ card }: { card: Card }) => <div data-testid="sheet">{card.place?.title}</div> }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/offline/queuedWrite", () => ({ queuedUpdate: vi.fn(), queuedInsert: vi.fn(), queuedDelete: vi.fn() }));

import WeekBoard from "./WeekBoard";

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
  it("shows the villa as one band across the week's nights, and no Anytime lane", () => {
    render(<WeekBoard trip={trip} initialDays={days} initialSaved={[]} />);
    const band = screen.getByTestId("stay-band");
    const stays = within(band).getAllByTestId("stay");
    expect(stays).toHaveLength(1);
    expect(stays[0].textContent).toContain("Villa Zambaldi");
    expect(stays[0].textContent).toMatch(/Villa Zambaldi· 24 Aug – 4 Sept? · 11 nights$/);
    // It runs on into next week.
    expect(stays[0].style.borderRightStyle).toBe("dashed");
    expect(screen.queryByText("Anytime")).toBeNull();
  });

  it("puts the untimed Cathedral in Friday's header", () => {
    render(<WeekBoard trip={trip} initialDays={days} initialSaved={[]} />);
    const untimed = screen.getAllByTestId("day-untimed");
    expect(untimed).toHaveLength(1);
    expect(untimed[0].textContent).toBe("Cathedral of Santa Maria");
    expect(untimed[0].closest("[data-testid='day-header']")?.textContent).toContain("Fri");
  });

  it("opens the hotel from the band", () => {
    render(<WeekBoard trip={trip} initialDays={days} initialSaved={[]} />);
    fireEvent.click(screen.getByTestId("stay"));
    expect(screen.getByTestId("sheet").textContent).toBe("Villa Zambaldi");
  });

  it("next week, the band carries on from the left and stops before check-out", () => {
    render(<WeekBoard trip={trip} initialDays={days} initialSaved={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    const stay = screen.getByTestId("stay");
    expect(stay.style.borderLeftStyle).toBe("dashed");
    expect(stay.style.borderRightStyle).toBe("solid");
  });

  it("a journey with no hotel has no band row at all", () => {
    const bare = days.map((d) => ({ ...d, cards: d.cards.filter((c) => c.place?.sub_type !== "hotel") }));
    render(<WeekBoard trip={trip} initialDays={bare} initialSaved={[]} />);
    expect(screen.queryByTestId("stay-band")).toBeNull();
  });
});
