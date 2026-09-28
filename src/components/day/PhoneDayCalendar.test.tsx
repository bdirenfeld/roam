// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { Card, Day } from "@/types/database";

/**
 * The phone's calendar, rendered (27 Sep 2026). Before it the phone had no
 * way to reach day 47 of a 62-day summer except swiping the date strip; the
 * calendar that existed lived on a board the phone has no door to.
 */

// Rows as the calendar reads them, from the Europe summer journey: 1 July
// lands at Heathrow, 2 July is the British Museum, 3 July has nothing.
const rows = [{ day_id: "d-2027-07-01" }, { day_id: "d-2027-07-02" }];
const calls: { method: string; args: unknown[] }[] = [];
vi.mock("@/lib/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "not"]) {
    chain[m] = (...args: unknown[]) => { calls.push({ method: m, args }); return chain; };
  }
  chain.then = (fn: (r: { data: unknown; error: null }) => void) => fn({ data: rows, error: null });
  return { createClient: () => chain };
});

import PhoneDayCalendar from "./PhoneDayCalendar";

// jsdom does not lay out, so it has no scrollIntoView; the open calendar
// calls it to bring the current day into view.
Element.prototype.scrollIntoView = () => {};

afterEach(() => { cleanup(); calls.length = 0; vi.useRealTimers(); });

const days: Day[] = Array.from({ length: 62 }, (_, i) => {
  const date = new Date(Date.UTC(2027, 6, 1) + i * 86_400_000).toISOString().slice(0, 10);
  return { id: `d-${date}`, trip_id: "t1", day_number: i + 1, date } as unknown as Day;
});

// The Europe summer's hotel cards (live, 27 Sep 2026).
const hotel = (day: number, title: string, address: string, status = "in_itinerary") => ({
  id: `h${day}${status}`, day_id: days[day - 1].id, status, place: { title, address, sub_type: "hotel" },
}) as unknown as Card;
const EUROPE = [
  hotel(1, "Presidential Apartments, Kensington", "Kensington Apartments, 6-12 Barkston Gardens, London SW5 0EN, UK"),
  hotel(10, "Citadines Saint-Germain-des-Prés Paris (Apart hotel Paris)", "53 ter Quai des Grands Augustins, 75006 Paris, France"),
  hotel(20, "Hotel Ilaria - Lucca", "Via del Fosso, 26, 55100 Lucca LU, Italy"),
  hotel(41, "Lugaris Rambla - Barcelona Beach Apartments", "Rambla del Poblenou, 16-20, Sant Martí, 08005 Barcelona, Spain"),
];

function open(activeDayId = "d-2027-07-02", hotelCards: Card[] = []) {
  const onSelect = vi.fn(), onClose = vi.fn();
  render(<PhoneDayCalendar tripId="t1" days={days} hotelCards={hotelCards} activeDayId={activeDayId} top={58} onSelect={onSelect} onClose={onClose} />);
  return { onSelect, onClose };
}

describe("the phone day calendar", () => {
  it("shows the journey's months and goes to the day that is tapped", () => {
    const { onSelect, onClose } = open();
    expect(screen.getByText("July 2027")).toBeTruthy();
    expect(screen.getByText("August 2027")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Tuesday 24 August/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "d-2027-08-24" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("two states and no key: planned, or nothing planned — no travel arrow", async () => {
    open();
    await waitFor(() => expect(screen.getByRole("button", { name: "Thursday 1 July, planned" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Friday 2 July, planned" })).toBeTruthy();
    expect(screen.queryByText("→")).toBeNull();
    expect(screen.getByRole("button", { name: "Saturday 3 July, nothing planned" })).toBeTruthy();
  });

  it("never counts a removed card: the read carries the archived guard", () => {
    open();
    expect(calls).toContainEqual({ method: "not", args: ["archived", "is", true] });
  });

  it("offers Jump to today while the journey is on, and not on today itself", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2027, 6, 20, 12));
    const { onSelect } = open();
    fireEvent.click(screen.getByRole("button", { name: "Jump to today" }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "d-2027-07-20" }));
    cleanup();
    open("d-2027-07-20");
    expect(screen.queryByRole("button", { name: "Jump to today" })).toBeNull();
  });

  it("Escape and a tap outside both close it", () => {
    const { onClose } = open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("a long journey with two or more stays is laid out by stay, each under its name, no bar on top", () => {
    const { onSelect } = open("d-2027-07-20", EUROPE);
    expect(screen.queryByText("July 2027")).toBeNull();
    for (const t of ["London", "Paris", "Lucca", "Barcelona"]) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.getByText(/1 Jul – 9 Jul · 9 days/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Lucca, / })).toBeNull();
    expect(screen.getByText("Hotel Ilaria - Lucca")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Tuesday 24 August/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "d-2027-08-24" }));
  });

  it("a saved hotel is not a stay: one booked hotel stays a plain calendar", () => {
    open("d-2027-07-02", [EUROPE[0], { ...EUROPE[1], status: "interested" } as Card]);
    expect(screen.getByText("July 2027")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Paris, / })).toBeNull();
  });

  it("a short journey is a plain calendar even with two hotels (Rome, 7 days)", () => {
    const week = days.slice(0, 7);
    const rome = [hotel(1, "Hotel NH Collection Roma", "Via Cavour, 00184 Roma RM, Italy"), hotel(3, "Banco 19 B&B", "Via del Banco di Santo Spirito, 00186 Roma RM, Italy")];
    render(<PhoneDayCalendar tripId="t1" days={week} hotelCards={rome} activeDayId={week[1].id} top={58} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("July 2027")).toBeTruthy();
    expect(screen.queryByText("Banco 19 B&B")).toBeNull();
  });
});
