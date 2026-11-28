// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import DayGrid from "./DayGrid";
import TravelSheet from "./TravelSheet";
import CardTimeline from "./CardTimeline";
import type { Card } from "@/types/database";

// His Florence day, 28 Aug 2027 (28 Nov 2026, round-3 mock approved).
const card = (id: string, title: string, sub: string, start: string | null, end: string | null, details: Record<string, unknown> = {}) =>
  ({ id, day_id: "d1", trip_id: "t", list_id: null, position: 0, status: "in_itinerary", source_url: null, ai_generated: false, created_at: "", place_id: "p" + id,
    start_time: start, end_time: end, confirmed: false, details,
    place: { id: "p" + id, title, type: sub === "transit" ? "logistics" : "activity", sub_type: sub, lat: 43.77, lng: 11.25, address: "" } }) as unknown as Card;
const david = card("david", "Galleria dell'Accademia", "museum", "09:45:00", "11:15:00");
const flight = card("in", "Pisa Airport", "flight_arrival", "12:00:00", "13:30:00", { departure_time: "12:00" });
const legs = [
  card("drive", "Lucca station", "transit", "08:00:00", "08:10:00", { mode: "drive", from: { title: "Villa Zambaldi", lat: 43.85, lng: 10.5 } }),
  card("train", "Firenze Santa Maria Novella", "transit", "08:25:00", "09:25:00", { mode: "train", from: { title: "Lucca station", lat: 43.84, lng: 10.5 } }),
];
const run = { cards: legs, startMin: 480, endMin: 565, dest: "Florence", leave: true };
const block = (id: string) => screen.getAllByTestId("day-grid-block").find((b) => b.dataset.cardId === id)!;

afterEach(() => vi.useRealTimers());

describe("Day view gestures (28 Nov 2026)", () => {
  it("press, hold and drag down an hour: David moves 9:45 → 10:45 and the time rides on the block", () => {
    vi.useFakeTimers();
    const onMove = vi.fn(), onTap = vi.fn();
    render(<DayGrid cards={[david]} onCardTap={onTap} onMove={onMove} />);
    fireEvent.pointerDown(block("david"), { clientY: 200, button: 0, pointerId: 1 });
    act(() => { vi.advanceTimersByTime(400); });
    expect(block("david").dataset.lifted).toBe("1");
    fireEvent.pointerMove(block("david"), { clientY: 240, pointerId: 1 });
    expect(screen.getByTestId("day-grid-drag-time").textContent).toBe("10:45 AM");
    fireEvent.pointerUp(block("david"), { clientY: 240, pointerId: 1 });
    fireEvent.click(block("david"));
    expect(onMove).toHaveBeenCalledWith(david, "10:45", "12:15");
    expect(onTap).not.toHaveBeenCalled();
  });

  it("a quick tap still opens the card; a finger that moves first is scrolling, not moving", () => {
    vi.useFakeTimers();
    const onMove = vi.fn(), onTap = vi.fn();
    render(<DayGrid cards={[david]} onCardTap={onTap} onMove={onMove} />);
    fireEvent.pointerDown(block("david"), { clientY: 200, button: 0, pointerId: 1 });
    fireEvent.pointerMove(block("david"), { clientY: 230, pointerId: 1 });
    act(() => { vi.advanceTimersByTime(500); });
    expect(block("david").dataset.lifted).toBeUndefined();
    fireEvent.pointerUp(block("david"), { clientY: 230, pointerId: 1 });
    fireEvent.click(block("david"));
    expect(onMove).not.toHaveBeenCalled();
    expect(onTap).toHaveBeenCalledWith(david);
  });

  it("a flight does not lift", () => {
    vi.useFakeTimers();
    render(<DayGrid cards={[flight]} onCardTap={() => {}} onMove={vi.fn()} />);
    fireEvent.pointerDown(block("in"), { clientY: 200, button: 0, pointerId: 1 });
    act(() => { vi.advanceTimersByTime(500); });
    expect(block("in").dataset.lifted).toBeUndefined();
  });

  it("a tap on empty time gives its quarter hour; a tap on a block does not", () => {
    const onEmpty = vi.fn();
    render(<DayGrid cards={[david]} onCardTap={() => {}} onEmptyTap={onEmpty} />);
    // The grid starts at 7 AM, 40 px an hour: 450 px down is 6:15 PM.
    fireEvent.click(screen.getByTestId("day-grid"), { clientX: 200, clientY: 450 });
    expect(onEmpty).toHaveBeenCalledWith(18 * 60 + 15);
    fireEvent.click(block("david"), { clientX: 200, clientY: 120 });
    expect(onEmpty).toHaveBeenCalledTimes(1);
  });

  it("the timeline turns that tap into the regular Add sheet's times", () => {
    const onGap = vi.fn();
    const dwc = { id: "d1", trip_id: "t", date: "2027-08-28", day_number: 5, day_name: null, narrative_position: null, theme: null, created_at: "", cards: [david] } as never;
    render(<CardTimeline dayWithCards={dwc} onCardTap={() => {}} onGapTap={onGap} asDay />);
    fireEvent.click(screen.getByTestId("day-grid"), { clientX: 200, clientY: 450 });
    expect(onGap).toHaveBeenCalledWith("18:15", "19:15");
  });

  it("the travel strip opens one travel card with the steps, A to B", () => {
    const dwc = { id: "d1", trip_id: "t", date: "2027-08-28", day_number: 5, day_name: null, narrative_position: null, theme: null, created_at: "", cards: [...legs, david] } as never;
    render(<CardTimeline dayWithCards={dwc} onCardTap={() => {}} asDay />);
    fireEvent.click(screen.getByTestId("day-grid-travel"));
    const sheet = screen.getByTestId("travel-sheet");
    expect(sheet.textContent).toContain("Leave for Firenze Santa Maria Novella");
    expect(screen.getAllByTestId("travel-step")).toHaveLength(2);
    expect(screen.getByTestId("travel-step-change").textContent).toBe("15 min to change");
    expect(screen.getByTestId("travel-step-arrive").textContent).toContain("9:25 AMArrive Firenze");
  });

  it("a step opens that leg's own card, where it is edited", () => {
    const onOpen = vi.fn(), onClose = vi.fn();
    render(<TravelSheet {...run} onOpen={onOpen} onClose={onClose} />);
    fireEvent.click(screen.getAllByTestId("travel-step")[1]);
    expect(onOpen).toHaveBeenCalledWith(legs[1]);
    expect(onClose).toHaveBeenCalled();
  });
});
