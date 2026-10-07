// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { DayWithCards } from "@/types/database";
import CardTimeline from "./CardTimeline";

/** An empty day (1 Oct 2026): under a new journey's Start here it drops "Nothing planned yet" and keeps Add a place. */

afterEach(cleanup);
const day = { id: "d1", trip_id: "t", day_number: 1, date: "2027-08-24", theme: null, cards: [] } as unknown as DayWithCards;

describe("an empty day", () => {
  it("says nothing is planned, with Add a place", () => {
    render(<CardTimeline dayWithCards={day} onGapTap={vi.fn()} />);
    expect(screen.getByText("Nothing planned yet")).toBeTruthy();
    expect(screen.getByText(/Add a place/)).toBeTruthy();
  });
  it("under Start here: no 'Nothing planned yet', Add a place stays", () => {
    render(<CardTimeline dayWithCards={day} onGapTap={vi.fn()} quietEmpty />);
    expect(screen.queryByText("Nothing planned yet")).toBeNull();
    expect(screen.getByText(/Add a place/)).toBeTruthy();
  });
});

describe("the day's words (6 Oct 2026, delight audit)", () => {
  it("while the journey is under way, an empty day is 'A free day'", () => {
    render(<CardTimeline dayWithCards={day} onGapTap={vi.fn()} underway />);
    expect(screen.getByText("A free day")).toBeTruthy();
    expect(screen.queryByText("Nothing planned yet")).toBeNull();
  });

  it("untimed cards sit under 'Any time', not an instruction", () => {
    const card = (id: string, start: string | null) => ({
      id, day_id: "d1", trip_id: "t", start_time: start, end_time: null, position: 0,
      status: null, source_url: null, ai_generated: false, confirmed: false,
      place_id: null, place: null, details: { title: id },
    });
    const full = { ...day, cards: [card("Breakfast", "09:00"), card("Gelato", null)] } as unknown as DayWithCards;
    render(<CardTimeline dayWithCards={full} onGapTap={vi.fn()} />);
    expect(screen.getByText("Any time")).toBeTruthy();
    expect(screen.queryByText(/tap the chip/)).toBeNull();
  });
});
