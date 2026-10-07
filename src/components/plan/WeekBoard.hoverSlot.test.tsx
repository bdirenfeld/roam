// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Card, DayWithCards, Trip } from "@/types/database";
import { PX_PER_HOUR } from "@/lib/week/layout";

/**
 * The hover slot (6 Oct 2026, Brennan): on a computer, the empty hour under
 * the mouse shows a faint dashed box exactly where a click would make a block,
 * labelled "2:30 – 3:30 PM". Never over a block, while a draft is open, on a
 * folded day, after the mouse leaves, or on a device without hover.
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

import WeekBoard from "./WeekBoard";

const villa = { id: "villa", title: "Villa Zambaldi", type: "logistics", sub_type: "hotel", lat: 43.87, lng: 10.45, address: "Via Fonda" };
const dates = ["2027-08-24", "2027-08-25", "2027-08-26"];
const days = dates.map((date, i) => ({ id: `d${i + 1}`, trip_id: "t", day_number: i + 1, date, theme: null, cards: [] as Card[] })) as unknown as DayWithCards[];
days[0].cards.push({ id: "in", trip_id: "t", day_id: "d1", place_id: villa.id, place: villa, status: "in_itinerary", position: 1, details: {}, start_time: "14:00:00", end_time: null } as unknown as Card);
const trip = { id: "t", title: "Tuscany", destination: "Tuscany, Italy", start_date: dates[0], end_date: dates[2] } as unknown as Trip;

let hoverDevice = true;
const rect = { top: 0, bottom: 2000, left: 0, right: 2000, width: 2000, height: 2000, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;

beforeEach(() => {
  hoverDevice = true;
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: hoverDevice && q === "(hover: hover) and (pointer: fine)", media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(rect);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const col = (id: string) => document.querySelector<HTMLElement>(`[data-daycol='${id}']`)!;
// 2:30 pm is 7.5 hours below the 7 am top row.
const y230 = 7.5 * PX_PER_HOUR + 5;

describe("the week's hover slot", () => {
  it("shows the hour a click would make, snapped, one hour tall, with its range", () => {
    render(<WeekBoard trip={trip} initialDays={days} initialSaved={[]} />);
    fireEvent.mouseMove(col("d2"), { clientY: y230 });
    const slot = screen.getByTestId("hover-slot");
    expect(slot.textContent).toBe("2:30 – 3:30 PM");
    expect(slot.style.top).toBe(`${7.5 * PX_PER_HOUR}px`);
    expect(slot.style.height).toBe(`${PX_PER_HOUR}px`);
    expect(slot.className).toContain("pointer-events-none");
    expect(col("d2").contains(slot)).toBe(true);
    // A move inside the same half hour keeps the same box.
    fireEvent.mouseMove(col("d2"), { clientY: y230 + 4 });
    expect(screen.getByTestId("hover-slot")).toBe(slot);
    // And it lands where the click does.
    fireEvent.click(col("d2"), { clientY: y230 });
    expect(screen.queryByTestId("hover-slot")).toBeNull();          // the draft hides it
    expect(col("d2").textContent).toContain("2:30pm – 3:30pm");
  });

  it("hides over a block and when the mouse leaves", () => {
    render(<WeekBoard trip={trip} initialDays={days} initialSaved={[]} />);
    fireEvent.mouseMove(col("d1"), { clientY: 3 * PX_PER_HOUR });
    expect(screen.getByTestId("hover-slot")).toBeTruthy();
    fireEvent.mouseMove(screen.getByText(/Villa Zambaldi/), { clientY: 7 * PX_PER_HOUR });
    expect(screen.queryByTestId("hover-slot")).toBeNull();
    fireEvent.mouseMove(col("d1"), { clientY: 3 * PX_PER_HOUR });
    fireEvent.mouseLeave(col("d1"));
    expect(screen.queryByTestId("hover-slot")).toBeNull();
  });

  it("hides mid-drag, with a block in hand", () => {
    render(<WeekBoard trip={trip} initialDays={days} initialSaved={[]} />);
    const block = screen.getByText(/Villa Zambaldi/).closest(".cursor-grab")!;
    fireEvent.pointerDown(block, { clientX: 10, clientY: 7 * PX_PER_HOUR, button: 0, pointerId: 1 });
    fireEvent.mouseMove(col("d2"), { clientY: y230 });
    expect(screen.queryByTestId("hover-slot")).toBeNull();
    fireEvent.pointerUp(window, { clientX: 10, clientY: 7 * PX_PER_HOUR, pointerId: 1 });
    fireEvent.mouseMove(col("d2"), { clientY: y230 });
    expect(screen.getByTestId("hover-slot")).toBeTruthy();
  });

  it("hides on a folded day", () => {
    render(<WeekBoard trip={trip} initialDays={days} initialSaved={[]} />);
    fireEvent.click(screen.getAllByTestId("day-header")[0]);           // widen Tuesday; the others fold
    fireEvent.mouseMove(col("d2"), { clientY: y230 });
    expect(screen.queryByTestId("hover-slot")).toBeNull();
    fireEvent.mouseMove(col("d1"), { clientY: y230 });
    expect(screen.getByTestId("hover-slot")).toBeTruthy();
  });

  it("never shows on a device without hover", () => {
    hoverDevice = false;
    render(<WeekBoard trip={trip} initialDays={days} initialSaved={[]} />);
    fireEvent.mouseMove(col("d2"), { clientY: y230 });
    expect(screen.queryByTestId("hover-slot")).toBeNull();
  });
});
