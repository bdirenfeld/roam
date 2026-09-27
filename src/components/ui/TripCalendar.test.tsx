// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const q = { select: () => q, eq: () => q, not: () => q, then: (f: (r: { data: { day_id: string }[] }) => void) => f({ data: [{ day_id: "id-2027-08-16" }] }) };
    return { from: () => q };
  },
}));

import TripCalendar from "./TripCalendar";

afterEach(() => { cleanup(); push.mockReset(); });

const days = Array.from({ length: 62 }, (_, i) => {
  const d = new Date(Date.parse("2027-07-01T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10);
  return { id: `id-${d}`, date: d };
});

describe("the journey as a calendar", () => {
  it("shows both months and opens a day in the week", () => {
    render(<TripCalendar tripId="t1" days={days} onClose={() => {}} />);
    expect(screen.getByText("July 2027")).toBeTruthy();
    expect(screen.getByText("August 2027")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Monday 16 August/ }));
    expect(push).toHaveBeenCalledWith("/trips/t1/plan?day=id-2027-08-16");
  });
  it("a guest goes to the day page, having no week", () => {
    render(<TripCalendar tripId="t1" days={days} guest onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Thursday 1 July/ }));
    expect(push).toHaveBeenCalledWith("/trips/t1/days/id-2027-07-01");
  });
});
