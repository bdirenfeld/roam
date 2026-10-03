// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * The shared page, rendered — the page a family reads on the morning of day
 * three. Written with the 23 Sep 2026 change that put the organiser's
 * meeting point / bring / prep lines and "Tonight:" on it, and that opens
 * today's day instead of leaving it folded.
 */

// How-to videos are their own tests (components/videos); nothing is switched on here.
vi.mock("@/hooks/useHowToVideos", () => ({ SUPABASE_BASE: "", useHowToVideos: () => ({ ready: true, available: {}, seen: {}, markSeen: () => {} }), useVisitorVideo: () => ({ ready: true, available: {}, gone: true, dismiss: () => {} }) }));
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
    // Short enough to show whole: no fold, no "more".
    expect(screen.getByTestId("stop-note").tagName).toBe("P");
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

  it("folds the hotel's note (check-in, Wi-Fi) under Tonight, once per night, not printed out (2 Oct 2026)", () => {
    const j = journey(today);
    const note = "Check in from 4pm.\nWi-Fi: HowardGuest";
    j.days = j.days.map((d) => (d.tonight ? { ...d, tonight: { ...d.tonight, note } } : d));
    render(<SharedItinerary token="t" journey={j} />);
    const folds = screen.getAllByTestId("tonight-note");
    expect(folds).toHaveLength(3);
    expect(folds[0].tagName).toBe("DETAILS");
    expect(folds[0].textContent).toContain("Wi-Fi: HowardGuest");
    expect(folds[0].querySelector("summary")!.textContent).toMatch(/^Tonight: 11 Howard/);
  });

  it("folds a long stop note to its first sentence and more, without Intent or the planner's hedging (2 Oct 2026)", () => {
    const j = journey(today);
    j.cards = [{ ...j.cards[0], note: "**Intent**\nA small café and biscuit shop on Piazza San Frediano selling traditional Lucchese biscuits and coffee in a quiet square.\n\n**Know before you go**\n- Seating may be limited inside.\n- I have limited verified operational detail for this specific place beyond its name and location; confirm opening days locally on arrival." }];
    const { container } = render(<SharedItinerary token="t" journey={j} />);
    const note = screen.getByTestId("stop-note");
    expect(note.tagName).toBe("DETAILS");
    expect(note.querySelector("summary")!.textContent).toBe("A small café and biscuit shop on Piazza San Frediano selling traditional Lucchese biscuits and coffee in a quiet square. more");
    expect(note.textContent).toContain("• Seating may be limited inside.");
    expect(container.textContent).not.toMatch(/Intent|I have limited/);
  });

  it("stop photos load only as they come into view, not all 45 at once (speed, 3 Oct 2026)", () => {
    const j = journey(today);
    j.cards = [{ ...j.cards[0], place: { ...j.cards[0].place!, photo: "https://x/p.jpg" } }];
    const { container } = render(<SharedItinerary token="t" journey={j} />);
    const img = container.querySelector('img[src="https://x/p.jpg"]')!;
    expect(img.getAttribute("loading")).toBe("lazy");
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
