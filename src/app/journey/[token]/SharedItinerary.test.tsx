// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * The shared page, rendered — the page a family reads on the morning of day
 * three. Written with the 23 Sep 2026 change that put the organiser's
 * meeting point / bring / prep lines and "Tonight:" on it, and that opens
 * today's day instead of leaving it folded.
 */

vi.mock("@/lib/auth-actions", () => ({ signInWithGoogle: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import SharedItinerary, { type SharedJourney } from "./SharedItinerary";
import { localDate } from "@/lib/isSameLocalDay";

afterEach(cleanup);
// jsdom has no layout, so no scrollIntoView; the jump to today is a browser concern.
Element.prototype.scrollIntoView = vi.fn();

function journey(today: string): SharedJourney {
  const d = (n: number) => {
    const t = new Date(today + "T12:00:00");
    t.setDate(t.getDate() + n);
    return localDate(t);
  };
  return {
    title: "New York (Mia & Daddy)",
    destination: "New York",
    startDate: d(-2),
    endDate: d(1),
    cover: null,
    host: "Brennan Direnfeld",
    entry: [],
    days: [
      { id: "d1", date: d(-2), dayNumber: 1, title: null, tonight: { name: "11 Howard", address: "11 Howard St, New York" } },
      { id: "d2", date: d(-1), dayNumber: 2, title: null, tonight: { name: "11 Howard", address: "11 Howard St, New York" } },
      { id: "d3", date: d(0), dayNumber: 3, title: null, tonight: { name: "11 Howard", address: "11 Howard St, New York" } },
      { id: "d4", date: d(1), dayNumber: 4, title: null, tonight: null },
    ],
    cards: [
      {
        id: "c1", dayId: "d3", start: "10:00", end: "11:30",
        place: { title: "Sloomoo Institute", sub_type: "museum", address: "475 Broadway", photo: null },
        noteTitle: null, note: "Sign the waiver before you leave the hotel",
        // Real card fields the page must NOT show — cut 23 Sep 2026 to keep it simple.
        ...({ details: { meeting_point: "81st Street entrance" } } as object),
      },
    ],
  };
}

describe("the shared page", () => {
  const today = localDate(new Date());

  it("shows the card note — the one place for anything that matters", () => {
    render(<SharedItinerary token="t" journey={journey(today)} />);
    expect(screen.getByText("Sign the waiver before you leave the hotel")).toBeTruthy();
  });

  it("says where everyone sleeps, tappable into maps, and nothing on the leaving day", () => {
    const { container } = render(<SharedItinerary token="t" journey={journey(today)} />);
    const tonight = screen.getAllByText("11 Howard");
    expect(tonight).toHaveLength(3);
    expect(tonight[0].closest("a")?.getAttribute("href")).toMatch(/google\.com\/maps/);
    // Day 4 is a free day with no hotel line.
    const day4 = container.querySelectorAll("details")[3];
    expect(day4.textContent).toMatch(/a free day/);
    expect(day4.textContent).not.toMatch(/Tonight/);
  });

  it("stays simple: a start time, no end time and no meeting-point lines", () => {
    const { container } = render(<SharedItinerary token="t" journey={journey(today)} />);
    expect(screen.getByText("10:00 AM")).toBeTruthy();
    expect(container.textContent).not.toMatch(/to 11:30|11:30/);
    expect(container.textContent).not.toMatch(/Meet:|Before you go:|81st Street/);
  });

  it("opens today's day and leaves the others folded", () => {
    const { container } = render(<SharedItinerary token="t" journey={journey(today)} />);
    const open = Array.from(container.querySelectorAll("details")).map((d) => d.hasAttribute("open"));
    expect(open).toEqual([false, false, true, false]);
  });

  it("before the trip, opens day one", () => {
    const later = new Date();
    later.setDate(later.getDate() + 10);
    const { container } = render(<SharedItinerary token="t" journey={journey(localDate(later))} />);
    const open = Array.from(container.querySelectorAll("details")).map((d) => d.hasAttribute("open"));
    expect(open).toEqual([true, false, false, false]);
  });
});
