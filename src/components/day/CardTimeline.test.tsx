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
