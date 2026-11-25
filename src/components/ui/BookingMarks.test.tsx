// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * The booking marks on a journey's card (25 Nov 2026, mock approved): three
 * quiet icons in the photo's corner, a tick on what is booked, and one link to
 * that journey's Bookings that sits beside the card's own link, not inside it.
 */

vi.mock("@/lib/tripArchive", () => ({ setTripArchived: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/deleteJourney", () => ({ deleteJourney: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }) }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("./TripCover", () => ({ default: () => null }));

import TripCard from "./TripCard";
import BookingMarks, { MARKS_ROOM } from "./BookingMarks";
import type { BookingMark } from "@/lib/booking/marks";
import type { Trip } from "@/types/database";

const trip = { id: "t1", title: "Chris Voss Training", destination: "Irving, TX, USA", start_date: "2027-03-14", end_date: "2027-03-17", cover_image_url: null } as unknown as Trip;
const voss: BookingMark[] = [{ key: "flights", booked: false }, { key: "stays", booked: true }, { key: "car", booked: false }];

afterEach(cleanup);

describe("the booking marks on a journey's card", () => {
  it("draws flight, hotel, car in that order, and ticks only what is booked", () => {
    render(<BookingMarks href="/trips/t1/plan?bookings=1" title="Chris Voss Training" marks={voss} />);
    const marks = Array.from(screen.getByTestId("booking-marks").querySelectorAll("[data-mark]"));
    expect(marks.map((m) => [m.getAttribute("data-mark"), m.getAttribute("data-booked")])).toEqual([["flights", "no"], ["stays", "yes"], ["car", "no"]]);
    // The tick is the small green dot: one, on the stay.
    expect(marks.map((m) => m.querySelectorAll("span").length)).toEqual([0, 1, 0]);
    expect(marks.map((m) => m.getAttribute("title"))).toEqual(["Flights: still to book", "Stays: booked", "Car: still to book"]);
  });

  it("is one link to that journey's Bookings, named in words", () => {
    render(<BookingMarks href="/trips/t1/plan?bookings=1" title="Chris Voss Training" marks={voss} />);
    const link = screen.getByTestId("booking-marks");
    expect(link.getAttribute("href")).toBe("/trips/t1/plan?bookings=1");
    expect(link.getAttribute("aria-label")).toBe("Bookings for Chris Voss Training: flights still to book, stays booked, car still to book");
  });

  it("a row marked Not needed arrives as no mark, and no marks draws nothing", () => {
    const { container } = render(<BookingMarks href="/trips/t1/plan?bookings=1" title="x" marks={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("on the card: beside the journey's link, never inside it, and the caption keeps clear", () => {
    render(<TripCard trip={trip} href="/trips/t1/plan" owner marks={voss} />);
    const link = screen.getByTestId("booking-marks");
    expect(link.closest("article")).toBeNull();
    expect(link.parentElement?.querySelectorAll("a a").length).toBe(0);
    expect(screen.getByTestId("trip-caption").className).toContain(MARKS_ROOM);
  });

  it("on the card on a computer the marks lead to the week with Bookings open", () => {
    render(<TripCard trip={trip} href="/trips/t1/plan" owner marks={voss} />);
    const link = screen.getByTestId("booking-marks");
    expect(link.getAttribute("href")).toBe("/trips/t1/plan?bookings=1");
    expect(link.getAttribute("data-corner")).toBe("bottom");
  });

  it("on a phone the marks sit in the photo's top corner, lead to the day with Bookings open, and the caption keeps its full width", () => {
    render(<TripCard trip={trip} href="/trips/t1/days/d2" owner marks={voss} phone marksPhoneDayId="d2" />);
    const link = screen.getByTestId("booking-marks");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("data-corner")).toBe("top");
    expect(link.className).toContain("top-[5px]");
    expect(link.getAttribute("href")).toBe("/trips/t1/days/d2?bookings=1");
    expect(link.closest("article")).toBeNull();
    expect(screen.getByTestId("trip-caption").className).not.toContain(MARKS_ROOM);
  });

  it("on a phone with no day to open, the marks still show what is booked but are not a link", () => {
    render(<TripCard trip={trip} href="/trips/t1" owner marks={voss} phone marksPhoneDayId={null} />);
    const marks = screen.getByTestId("booking-marks");
    expect(marks.tagName).not.toBe("A");
    expect(marks.getAttribute("href")).toBeNull();
    expect(marks.getAttribute("aria-label")).toBe("Bookings for Chris Voss Training: flights still to book, stays booked, car still to book");
    expect(marks.querySelectorAll("[data-mark]")).toHaveLength(3);
  });

  it("a card given no marks (a guest's journey) is the card as it was", () => {
    render(<TripCard trip={trip} href="/trips/t1/plan" />);
    expect(screen.queryByTestId("booking-marks")).toBeNull();
    expect(screen.getByTestId("trip-caption").className).not.toContain(MARKS_ROOM);
  });
});
