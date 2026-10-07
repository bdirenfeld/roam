// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { DayWithCards } from "@/types/database";
import CardTimeline from "./CardTimeline";

// "Give these times" (7 Oct 2026, taps audit): Fill in missing times lived only
// on a long-press of the day strip. A quiet link under the untimed group runs
// the same action, when two or more places on the day have no time.
afterEach(cleanup);
const card = (id: string, start: string | null, withPlace = true) => ({
  id, day_id: "d1", trip_id: "t", start_time: start, end_time: null, position: 0,
  status: null, source_url: null, ai_generated: false, confirmed: false,
  place_id: withPlace ? `p-${id}` : null,
  place: withPlace ? { id: `p-${id}`, title: id, type: "activity", sub_type: "museum", lat: 43.77, lng: 11.25 } : null,
  details: { title: id },
});
const day = (cards: unknown[]) => ({ id: "d1", trip_id: "t", day_number: 1, date: "2026-10-13", theme: null, cards }) as unknown as DayWithCards;

describe("Give these times", () => {
  it("two untimed places: the link shows and runs the action once", () => {
    const go = vi.fn();
    render(<CardTimeline dayWithCards={day([card("Uffizi", "08:15"), card("Ponte Vecchio", null), card("Mercato", null)])} onGapTap={vi.fn()} onGiveTimes={go} />);
    const link = screen.getByRole("button", { name: "Give these times" });
    expect(link.className).toContain("md:hidden");
    fireEvent.click(link);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("also on a day where nothing has a time yet", () => {
    render(<CardTimeline dayWithCards={day([card("A", null), card("B", null)])} onGapTap={vi.fn()} onGiveTimes={vi.fn()} />);
    expect(screen.getByText("Give these times")).toBeTruthy();
  });

  it("only one untimed place: no link", () => {
    render(<CardTimeline dayWithCards={day([card("Uffizi", "08:15"), card("Ponte Vecchio", null)])} onGapTap={vi.fn()} onGiveTimes={vi.fn()} />);
    expect(screen.queryByText("Give these times")).toBeNull();
  });

  it("untimed cards without a place don't count", () => {
    render(<CardTimeline dayWithCards={day([card("Note", null, false), card("Ponte Vecchio", null)])} onGapTap={vi.fn()} onGiveTimes={vi.fn()} />);
    expect(screen.queryByText("Give these times")).toBeNull();
  });

  it("read-only guests never see it", () => {
    render(<CardTimeline dayWithCards={day([card("A", null), card("B", null)])} readOnly onGiveTimes={vi.fn()} />);
    expect(screen.queryByText("Give these times")).toBeNull();
  });
});

describe("DayViewClient wires it to the same Fill in missing times action", () => {
  it("passes arrangeDayCards(…, \"rest\") and keeps the long-press menu item", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync(require.resolve("./DayViewClient.tsx"), "utf8");
    expect(src).toMatch(/onGiveTimes=\{readOnly \? undefined : \(\) => void arrangeDayCards\([^)]*, "rest"\)\}/);
    expect(src).toContain(">Fill in missing times</button>");
  });
});
