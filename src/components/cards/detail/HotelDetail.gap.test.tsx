// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HotelDetail from "./HotelDetail";
import CardSurface from "../CardSurface";
import type { Card } from "@/types/database";

// 27 Nov 2026 (simple version approved): the flights against the hotel's hours.
const howard = {
  id: "howard", day_id: "d1", trip_id: "t", list_id: null, start_time: "14:00:00", end_time: null, position: 2,
  status: "in_itinerary", source_url: null, details: { check_out: "2026-07-26", confirmation: "73325127596243" },
  ai_generated: false, confirmed: true, created_at: "", place_id: "p",
  place: { id: "p", title: "11 Howard", type: "logistics", sub_type: "hotel", lat: 40.7, lng: -74, address: "11 Howard St, New York, NY 10013, USA" },
} as unknown as Card;

describe("the hotel's hours against the flights (27 Nov 2026)", () => {
  it("New York: under Check-in, 'You land 10:55 AM · 3 h early' and what to ask; under Check-out, the flight and when you leave", () => {
    render(<HotelDetail card={howard} checkInDay="2026-07-23" gaps={{
      arrive: { cardId: "in", land: "10:55", hours: 3 },
      leave: { cardId: "out", flight: "16:00", leaveAt: "13:00", hours: 2, checkOut: "11:00" },
    }} />);
    expect(screen.getByTestId("gap-arrive").textContent).toBe("You land 10:55 AM · 3 h earlyAsk for early check-in, or leave your bags.");
    expect(screen.getByTestId("gap-leave").textContent).toBe("Flight 4:00 PM · leave at 1:00 PMAsk for late check-out, or leave your bags.");
  });

  it("nothing to say, nothing drawn", () => {
    render(<HotelDetail card={howard} checkInDay="2026-07-23" gaps={{ arrive: null, leave: null }} />);
    expect(screen.queryByTestId("gap-arrive")).toBeNull();
    expect(screen.queryByTestId("gap-leave")).toBeNull();
  });

  it("the day's row: the orange line takes the address's place, two lines still", () => {
    render(<CardSurface card={howard} dayDate="2026-07-23" stayFlag="You land 3 h early" />);
    expect(screen.getByTestId("stay-flag").textContent).toBe("You land 3 h early");
    expect(screen.queryByText(/11 Howard St/)).toBeNull();
  });

  it("no flag: the address as before", () => {
    render(<CardSurface card={howard} dayDate="2026-07-23" />);
    expect(screen.queryByTestId("stay-flag")).toBeNull();
    expect(screen.getByText(/11 Howard St, New York/)).toBeTruthy();
  });
});
