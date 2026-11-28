// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DayGrid from "./DayGrid";
import CardTimeline from "./CardTimeline";
import type { Card } from "@/types/database";

// His New York day, 23 Jul 2026 (28 Nov 2026, clickable mock approved).
const card = (id: string, title: string, sub: string, start: string, end: string | null, confirmed: boolean, address = "", details: Record<string, unknown> = {}) =>
  ({ id, day_id: "d1", trip_id: "t", list_id: null, position: 0, status: "in_itinerary", source_url: null, ai_generated: false, created_at: "", place_id: "p" + id,
    start_time: start, end_time: end, confirmed, details,
    place: { id: "p" + id, title, type: "activity", sub_type: sub, lat: 40.7, lng: -74, address } }) as unknown as Card;
const day = [
  card("in", "LaGuardia Airport", "flight_arrival", "09:20:00", "10:55:00", true, "", { origin_airport: "YYZ", arriving_at: "LGA", departure_time: "09:20" }),
  card("howard", "11 Howard", "hotel", "14:00:00", null, true, "11 Howard St, New York, NY 10013, USA"),
  card("sloomoo", "Sloomoo Institute", "museum", "15:30:00", "17:00:00", true, "475 Broadway, New York, NY 10013, USA"),
  card("figo", "Figo il Gelato Italiano", "dessert", "19:30:00", "20:00:00", false, "178 Mulberry St, New York, NY 10012, USA"),
  card("morg", "Morgenstern's Finest Ice Cream", "dessert", "19:30:00", "20:00:00", false, "2 Rivington St, New York, NY 10002, USA"),
];
const nums = new Map(day.map((c, i) => [c.id, i + 1]));

describe("the phone Day view (28 Nov 2026)", () => {
  it("each block carries its pin number and name; long blocks show where, short ones only the name", () => {
    render(<DayGrid cards={day} cardNumberById={nums} onCardTap={() => {}} />);
    const blocks = screen.getAllByTestId("day-grid-block");
    // The icon is a Material Symbols ligature: its name is text, so it is left out here.
    const text = (id: string) => { const b = blocks.find((x) => x.dataset.cardId === id)!; const icon = b.querySelector(".material-symbols-outlined")?.textContent ?? ""; return b.textContent!.replace(icon, ""); };
    expect(text("in")).toBe("1 ·LaGuardia AirportYYZ → LGA");
    expect(text("sloomoo")).toBe("3 ·Sloomoo Institute475 Broadway, New York");
    expect(text("howard")).toBe("2 ·11 Howard");
  });

  it("booked blocks are solid, the rest outlined; the two 7:30 ice creams share the width", () => {
    render(<DayGrid cards={day} cardNumberById={nums} />);
    const by = Object.fromEntries(screen.getAllByTestId("day-grid-block").map((b) => [b.dataset.cardId, b]));
    expect([by.sloomoo.dataset.booked, by.figo.dataset.booked]).toEqual(["1", "0"]);
    expect(by.figo.style.width).toBe(by.morg.style.width);
    expect(by.figo.style.width).toContain("0.5");
    expect(by.figo.style.left).not.toBe(by.morg.style.left);
  });

  it("each half-hour line sits exactly halfway between two hour lines (28 Nov 2026: they looked off)", () => {
    render(<DayGrid cards={day} cardNumberById={nums} />);
    const hrs = screen.getAllByTestId("day-grid-hour").map((e) => parseFloat(e.style.top));
    const halves = screen.getAllByTestId("day-grid-half").map((e) => parseFloat(e.style.top));
    expect(halves).toHaveLength(hrs.length - 1);
    halves.forEach((y, i) => expect(y).toBe((hrs[i] + hrs[i + 1]) / 2));
  });

  it("round 2: no outlines (unbooked is a pale fill); travel is one quiet strip: 'Leave for Florence · drive + train'", () => {
    const leg = (id: string, mode: string, s: string, e: string) => card(id, id, "transit", s, e, false, "", { mode, from: { title: "x" } });
    const travel = [{ cards: [leg("drive", "drive", "08:00:00", "08:10:00"), leg("train", "train", "08:25:00", "09:25:00")], startMin: 480, endMin: 565, dest: "Florence", leave: true }];
    render(<DayGrid cards={day} travel={travel} cardNumberById={nums} />);
    const strip = screen.getByTestId("day-grid-travel");
    const icon = strip.querySelector(".material-symbols-outlined")?.textContent ?? "";
    expect(strip.textContent!.replace(icon, "")).toBe("Leave for Florence · drive + train");
    const figo = screen.getAllByTestId("day-grid-block").find((b) => b.dataset.cardId === "figo")!;
    expect(figo.style.boxShadow).toBe("none");
  });

  it("a tap opens the card", () => {
    const onTap = vi.fn();
    render(<DayGrid cards={day} cardNumberById={nums} onCardTap={onTap} />);
    fireEvent.click(screen.getAllByTestId("day-grid-block").find((b) => b.dataset.cardId === "sloomoo")!);
    expect(onTap).toHaveBeenCalledWith(day[2]);
  });

  it("hours down the side from the first card's hour; no 'free' labels in the gaps", () => {
    render(<DayGrid cards={day} cardNumberById={nums} />);
    const grid = screen.getByTestId("day-grid");
    expect(grid.textContent).toContain("9 AM");
    expect(grid.textContent).toContain("9 PM");
    expect(grid.textContent).not.toMatch(/free/i);
  });

  it("the timeline draws the grid only when asked; the list otherwise", () => {
    const dwc = { id: "d1", trip_id: "t", date: "2026-07-23", day_number: 1, day_name: null, narrative_position: null, theme: null, created_at: "", cards: day } as never;
    const { rerender } = render(<CardTimeline dayWithCards={dwc} cardNumberById={nums} />);
    expect(screen.queryByTestId("day-grid")).toBeNull();
    rerender(<CardTimeline dayWithCards={dwc} cardNumberById={nums} asDay />);
    expect(screen.getByTestId("day-grid")).toBeTruthy();
  });
});
