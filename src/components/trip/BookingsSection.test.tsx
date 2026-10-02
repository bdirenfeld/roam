// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import type { Day } from "@/types/database";

/** The Bookings row in Settings (1 Oct 2026): Upload when empty, one line per kind when booked. */

let rows: unknown[] = [];
const client = { from: () => { const q: Record<string, unknown> = {}; q.select = () => q; q.eq = () => q; q.not = () => Promise.resolve({ data: rows }); return q; } };
vi.mock("@/lib/supabase/client", () => ({ createClient: () => client }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/plan/ConfirmationPreviewSheet", () => ({ default: () => null }));
vi.mock("@/components/plan/DocumentsSheet", () => ({ default: () => null }));

import BookingsSection from "./BookingsSection";

const days = Array.from({ length: 12 }, (_, i) => ({ id: `d${i}`, trip_id: "t", day_number: i + 1, date: new Date(Date.UTC(2027, 7, 24 + i)).toISOString().slice(0, 10) })) as unknown as Day[];
afterEach(() => { cleanup(); rows = []; });

describe("the Bookings row", () => {
  it("with nothing booked, says so and offers Upload", async () => {
    render(<BookingsSection tripId="t" days={days} endDate="2027-09-04" />);
    await waitFor(() => expect(screen.getByText("No flight or hotel yet")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Upload" })).toBeTruthy();
  });

  it("with a flight there and back and a villa, one line each, and the row opens Bookings", async () => {
    rows = [
      { id: "f1", day_id: "d0", place_id: "a", status: "in_itinerary", start_time: null, details: { arriving_at: "Pisa International Airport (PSA)" }, place: { sub_type: "flight_arrival", title: "Pisa Airport", address: null } },
      { id: "v1", day_id: "d0", place_id: "v", status: "in_itinerary", start_time: "14:00:00", details: {}, place: { sub_type: "hotel", title: "Villa Zambaldi", address: "Via Fonda, Lucca" } },
      { id: "f2", day_id: "d11", place_id: "a", status: "in_itinerary", start_time: null, details: { arriving_at: "Toronto Pearson (YYZ)" }, place: { sub_type: "flight_departure", title: "Pisa Airport", address: null } },
    ];
    render(<BookingsSection tripId="t" days={days} endDate="2027-09-04" />);
    await waitFor(() => expect(screen.getByTestId("bookings-row").textContent).toContain("Villa Zambaldi"));
    const text = screen.getByTestId("bookings-row").textContent!;
    expect(text).toContain("Flights · Tue 24 Aug to Pisa · Sat 4 Sep to Toronto Pearson");
    expect(text).toContain("Hotel · Villa Zambaldi, 24 Aug – 4 Sep");
    expect(screen.queryByRole("button", { name: "Upload" })).toBeNull();
    expect(screen.getByTestId("bookings-row").getAttribute("role")).toBe("button");
  });
});
