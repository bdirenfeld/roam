// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * The booking marks on a journey's card (25 Nov 2026): three quiet icons
 * BESIDE THE JOURNEY'S NAME, a tick on what is booked, and one link to that
 * journey's Bookings. The link can never sit inside the card's own link, so
 * the caption lies over the card and lets every click but the marks' through.
 */

vi.mock("@/lib/tripArchive", () => ({ setTripArchived: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/deleteJourney", () => ({ deleteJourney: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }) }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("./TripCover", () => ({ default: () => null }));

import TripCard from "./TripCard";
import BookingMarks from "./BookingMarks";
import type { BookingMark } from "@/lib/booking/marks";
import type { Trip } from "@/types/database";

const trip = { id: "t1", title: "Chris Voss Training", destination: "Irving, TX, USA", start_date: "2027-03-14", end_date: "2027-03-17", cover_image_url: null } as unknown as Trip;
const voss: BookingMark[] = [{ key: "flights", booked: false }, { key: "stays", booked: true }, { key: "car", booked: false }];
const WEEK = "/trips/t1/plan?bookings=1";

afterEach(cleanup);

describe("the booking marks", () => {
  it("draws flight, hotel, car in that order, and ticks only what is booked", () => {
    render(<BookingMarks href={WEEK} title="Chris Voss Training" marks={voss} />);
    const marks = Array.from(screen.getByTestId("booking-marks").querySelectorAll("[data-mark]"));
    expect(marks.map((m) => [m.getAttribute("data-mark"), m.getAttribute("data-booked")])).toEqual([["flights", "no"], ["stays", "yes"], ["car", "no"]]);
    expect(marks.map((m) => m.getAttribute("title"))).toEqual(["Flights: still to book", "Stays: booked", "Car: still to book"]);
  });

  it("is filled in when booked and a faint outline when not: no dot, no tick, nothing beside the icon", () => {
    // Brennan, 25 Nov 2026, after a tick in a dot (competed with the name), a plain green dot
    // ("pretty bad"), a tick beside (too wide) and green icons (he thought them the worst):
    // the phone's own on/off convention, a filled drawing against an outline, in white.
    render(<BookingMarks href={WEEK} title="Chris Voss Training" marks={voss} />);
    const marks = Array.from(screen.getByTestId("booking-marks").querySelectorAll("[data-mark]"));
    expect(marks.map((m) => m.getAttribute("data-drawn"))).toEqual(["outline", "filled", "outline"]);
    // one drawing each and nothing else inside the mark
    expect(marks.map((m) => m.children.length)).toEqual([1, 1, 1]);
    const paths = marks.map((m) => m.querySelector("path")!.getAttribute("d"));
    expect(paths[1]).not.toBe(paths[0]);
    const colours = marks.map((m) => (m.querySelector("svg") as SVGElement).style.color);
    expect(colours[1]).toBe("rgb(255, 255, 255)");
    expect(colours[0]).toBe(colours[2]);
    expect(colours[0]).not.toBe(colours[1]);
  });

  it("the same icon, booked and not, is two different drawings", () => {
    const { unmount } = render(<BookingMarks href={WEEK} title="x" marks={[{ key: "stays", booked: true }]} />);
    const filled = screen.getByTestId("booking-marks").querySelector("path")!.getAttribute("d");
    unmount();
    render(<BookingMarks href={WEEK} title="x" marks={[{ key: "stays", booked: false }]} />);
    expect(screen.getByTestId("booking-marks").querySelector("path")!.getAttribute("d")).not.toBe(filled);
  });

  it("is one link to that journey's Bookings, named in words, with a thumb-sized target", () => {
    render(<BookingMarks href={WEEK} title="Chris Voss Training" marks={voss} />);
    const link = screen.getByTestId("booking-marks");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe(WEEK);
    expect(link.getAttribute("aria-label")).toBe("Bookings for Chris Voss Training: flights still to book, stays booked, car still to book");
    expect(screen.getByTestId("booking-marks-target")).toBeTruthy();
  });

  it("with nowhere to go it still shows what is booked, but is not a link", () => {
    render(<BookingMarks href={null} title="Chris Voss Training" marks={voss} />);
    const marks = screen.getByTestId("booking-marks");
    expect(marks.tagName).not.toBe("A");
    expect(marks.getAttribute("aria-label")).toBe("Bookings for Chris Voss Training: flights still to book, stays booked, car still to book");
    expect(marks.querySelectorAll("[data-mark]")).toHaveLength(3);
  });

  it("no marks draws nothing", () => {
    const { container } = render(<BookingMarks href={WEEK} title="x" marks={[]} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("the marks on a journey's card", () => {
  it("sit at the photo's top left, on one line with the ⋯ at the top right", () => {
    // Brennan, 25 Nov 2026 (final): "The top left looks alright but it needs to be on the same
    // line as the three dots on the far right." Same top edge and same height as the ⋯ button.
    render(<TripCard trip={trip} href="/trips/t1/plan" owner marks={voss} />);
    const marks = screen.getByTestId("booking-marks");
    const dots = screen.getByLabelText("Options for Chris Voss Training");
    for (const cls of ["absolute", "top-1", "h-9"]) {
      expect(marks.className.split(" "), cls).toContain(cls);
      expect(dots.className.split(" "), cls).toContain(cls);
    }
    expect(marks.className).toContain("left-");
    expect(dots.className).toContain("right-1");
    // not in the heading any more: the name stands alone
    expect(screen.getByTestId("trip-caption").querySelector("h3")!.textContent).toBe("Chris Voss Training");
  });

  it("are never inside the card's own link: the caption lies over the card and lets clicks through, except on the marks", () => {
    const { container } = render(<TripCard trip={trip} href="/trips/t1/plan" owner marks={voss} />);
    expect(container.querySelectorAll("a a").length).toBe(0);
    const caption = screen.getByTestId("trip-caption");
    expect(caption.closest("a")).toBeNull();
    expect(caption.className).toContain("pointer-events-none");
    expect(screen.getByTestId("booking-marks").className).toContain("pointer-events-auto");
  });

  it("the card's link still says which journey it opens, now that the name is drawn over it", () => {
    render(<TripCard trip={trip} href="/trips/t1/plan" owner marks={voss} />);
    const cardLink = screen.getByTestId("trip-card-link");
    expect(cardLink.getAttribute("href")).toBe("/trips/t1/plan");
    expect(cardLink.getAttribute("aria-label")).toContain("Chris Voss Training");
  });

  it("on a computer they lead to the week with Bookings open", () => {
    render(<TripCard trip={trip} href="/trips/t1/plan" owner marks={voss} />);
    expect(screen.getByTestId("booking-marks").getAttribute("href")).toBe(WEEK);
  });

  it("on a phone they lead to the day with Bookings open", () => {
    render(<TripCard trip={trip} href="/trips/t1/days/d2" owner marks={voss} phone marksPhoneDayId="d2" />);
    const link = screen.getByTestId("booking-marks");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/trips/t1/days/d2?bookings=1");
  });

  it("on a phone with no day to open, they show what is booked but are not a link", () => {
    render(<TripCard trip={trip} href="/trips/t1" owner marks={voss} phone marksPhoneDayId={null} />);
    const marks = screen.getByTestId("booking-marks");
    expect(marks.tagName).not.toBe("A");
    expect(marks.querySelectorAll("[data-mark]")).toHaveLength(3);
  });

  it("a card given no marks (a guest's journey) has its name and nothing beside it", () => {
    render(<TripCard trip={trip} href="/trips/t1/plan" />);
    expect(screen.queryByTestId("booking-marks")).toBeNull();
    expect(screen.getByTestId("trip-caption").querySelector("h3")!.textContent).toBe("Chris Voss Training");
  });
});
