// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import type { Day } from "@/types/database";

/**
 * Saving a hotel onto a day asks when you check out (1 Oct 2026). Sandra, a
 * tester, put her Fort Lauderdale hotel on four days one at a time because
 * nothing asked; the check-out is written once, on the check-in card.
 */

const scheduled: { dayId: string; startTime?: string | null; details: Record<string, unknown> }[] = [];
vi.mock("@/lib/scheduleCard", () => ({ scheduleCardOnDay: vi.fn(async (_s: unknown, args: { dayId: string; startTime?: string | null; details: Record<string, unknown> }) => { scheduled.push(args); return { id: "new" }; }) }));
vi.mock("@/lib/supabase/authUser", () => ({ getAuthUser: async () => ({ id: "u1" }) }));
const chain = () => {
  const q: Record<string, unknown> = {};
  for (const k of ["select", "eq", "upsert"]) q[k] = () => q;
  q.limit = () => Promise.resolve({ data: [] });
  q.single = () => Promise.resolve({ data: { id: "p1" }, error: null });
  return q;
};
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from: () => chain() }) }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/ui/CardImage", () => ({ default: () => null }));

import AddToTripSheet from "./AddToTripSheet";

const days = ["2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30"]
  .map((date, i) => ({ id: `d${i + 1}`, trip_id: "t", day_number: i + 1, date })) as unknown as Day[];
const conrad = { placeId: "g1", name: "Conrad Fort Lauderdale Beach", address: "551 N Fort Lauderdale Beach Blvd", lat: 26.13, lng: -80.1, details: { types: ["lodging"] } };
const bakery = { placeId: "g2", name: "Pinelli Bakery", address: "Via Beccheria", lat: 43.8, lng: 10.5, details: { types: ["bakery"] } };

afterEach(() => { cleanup(); scheduled.length = 0; });

describe("saving a hotel onto a day", () => {
  it("asks for check-in and check-out, and writes the check-out on the card", async () => {
    render(<AddToTripSheet place={conrad} tripId="t" days={days} onClose={vi.fn()} onCardCreated={vi.fn()} />);
    expect(screen.getByText("Check in (optional)")).toBeTruthy();
    expect(screen.queryByLabelText("Check out")).toBeNull();
    fireEvent.change(screen.getByLabelText("Put it on a day"), { target: { value: "d1" } });
    const out = screen.getByLabelText("Check out") as HTMLSelectElement;
    // Only days after check-in; the last day by default.
    expect(Array.from(out.options).map((o) => o.value)).toEqual(["d2", "d3", "d4", "d5", "d6"]);
    expect(out.value).toBe("d6");
    fireEvent.change(out, { target: { value: "d5" } });
    const save = screen.getByRole("button", { name: /^Stay / });
    await act(async () => { fireEvent.click(save); });
    // Two events, as Brennan writes them: in at 3 pm, out at 11 am on the day you leave.
    expect(scheduled).toHaveLength(2);
    expect(scheduled[0]).toMatchObject({ dayId: "d1", startTime: "15:00" });
    expect(scheduled[0].details.check_out).toBe("2026-11-29");
    expect(scheduled[1]).toMatchObject({ dayId: "d5", startTime: "11:00" });
    expect(scheduled[1].details.title).toBe("Check out of Conrad Fort Lauderdale Beach");
  });

  it("anything else is put on a day as before, with no check-out", async () => {
    render(<AddToTripSheet place={bakery} tripId="t" days={days} onClose={vi.fn()} onCardCreated={vi.fn()} />);
    expect(screen.getByText("Put on a day (optional)")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Put it on a day"), { target: { value: "d1" } });
    expect(screen.queryByLabelText("Check out")).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Put on / })); });
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].details.check_out).toBeUndefined();
  });
});
