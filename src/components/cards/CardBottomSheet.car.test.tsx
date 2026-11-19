// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import type { Card, Day } from "@/types/database";

/**
 * The boarding-pass flight card and its layover row (19 Nov 2026, Brennan
 * approved the mocks). The Rome card is his AC890 as stored; the connection is
 * the Tuscany example, AC 876 YYZ → FRA then LH 330 FRA → PSA.
 */

const writes = vi.hoisted(() => ({ calls: [] as Array<{ table: string; patch: Record<string, unknown> }> }));
vi.mock("@/lib/offline/queuedWrite", () => ({
  queuedUpdate: vi.fn(async (table: string, _m: unknown, patch: Record<string, unknown>) => { writes.calls.push({ table, patch }); return { error: null }; }),
  queuedDelete: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const rows = vi.hoisted(() => ({ data: [] as unknown[] }));
vi.mock("@/lib/supabase/client", () => {
  const make = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const k of ["from", "select", "not", "order", "limit", "eq", "in", "is", "update", "insert", "delete", "upsert", "neq"]) chain[k] = self;
    chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    chain.single = () => Promise.resolve({ data: null, error: null });
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows.data, error: null, count: 0 }).then(ok);
    chain.auth = { getSession: () => Promise.resolve({ data: { session: null } }) };
    chain.storage = { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null }) }) };
    return chain;
  };
  return { createClient: () => make() };
});
vi.mock("./PlacePhotoGallery", () => ({ default: () => <div data-testid="photo" /> }));
vi.mock("@/lib/supabase/authUser", () => ({ getAuthUser: async () => ({ id: "u1" }) }));

import CardBottomSheet from "./CardBottomSheet";


/** The rental voucher (19 Nov 2026): the Vegas rental as stored, and the Tuscany van placeholder. */
const desk = { id: "hz", title: "Hertz Car Rental - Las Vegas - Harry Reid International Airport (LAS)", type: "logistics", sub_type: "car_rental", address: "7135 Gilespie St, Las Vegas, NV 89119, USA", lat: 36.07, lng: -115.15, rating: 3.6, price_level: null, hours: null, google_place_id: "g", details: {} };
const car = (id: string, day: string, start: string, details: Record<string, unknown>, confirmed = true, place = desk): Card =>
  ({ id, trip_id: "t1", day_id: day, place_id: place.id, status: "in_itinerary", start_time: start, end_time: null, confirmed, position: 0, source_url: null, details, place } as unknown as Card);
const vDays = [{ id: "n4", trip_id: "t1", date: "2026-11-04", day_number: 1 }, { id: "n8", trip_id: "t1", date: "2026-11-08", day_number: 5 }] as unknown as Day[];
const pickup = car("pu", "n4", "13:30:00", { title: "Pick up rental car · Alamo · Harry Reid International Airport", phone: "844-370-7395", drop_off: "2026-11-08", paid_total: 279.31, paid_currency: "USD", notes: "Standard Elite SUV (AUDI Q3, CADILLAC XT4 or similar)", drop_off_location: "Harry Reid International Airport, 7135 Gilespie St, Las Vegas, NV 89119, US" });
const back = car("rt", "n8", "12:00:00", { title: "Return the rental car · Harry Reid International Airport", phone: "844-370-7395", drop_off: "2026-11-08" });

beforeEach(() => { writes.calls = []; rows.data = []; });

describe("the rental voucher card (19 Nov 2026)", () => {
  it("Vegas pick-up: Alamo, Wed 4 Nov 1:30 PM → Sun 8 Nov 12:00 PM, 4 days, US$279.31; no desk photo", async () => {
    rows.data = [pickup, back];
    await act(async () => { render(<CardBottomSheet card={pickup} onClose={() => {}} days={vDays} />); });
    await waitFor(() => expect(screen.getByTestId("car-voucher").textContent).toContain("Sun 8 Nov"));
    const v = screen.getByTestId("car-voucher").textContent!;
    for (const s of ["Pick up", "Wed 4 Nov", "1:30 PM", "Drop off", "12:00 PM", "Harry Reid International Airport (LAS)", "US$279.31", "844-370-7395"]) expect(v).toContain(s);
    expect(screen.getByTestId("voucher-days").textContent).toBe("4 days");
    expect(screen.getByTestId("voucher-company").textContent).toContain("Alamo");
    expect(screen.getByTestId("voucher-company").textContent).not.toContain("not booked");
    expect(screen.queryByTestId("photo")).toBeNull();
    expect(v).toContain("Pick-up");
  });

  it("the return card: the drop-off side is its own, the price can't be changed there, no Pick-up line", async () => {
    rows.data = [pickup, back];
    await act(async () => { render(<CardBottomSheet card={back} onClose={() => {}} days={vDays} />); });
    await waitFor(() => expect(screen.getByTestId("car-voucher").textContent).toContain("Wed 4 Nov"));
    expect(screen.getByTestId("voucher-company").textContent).toContain("Return it");
    expect(screen.queryByRole("button", { name: "Change paid" })).toBeNull();
    expect(screen.getByTestId("car-voucher").textContent).not.toContain("Pick-up");
    expect(screen.getByTestId("car-voucher").textContent).toContain("Fuel");
  });

  it("the Tuscany van, not booked yet: typing '€450' saves the price and currency in one write", async () => {
    const pisa = { ...desk, id: "pr", title: "Pisa Airport car rental", address: "Pisa" };
    const van = car("v1", "n4", "12:30:00", { title: "Pick up rental van", car_class: "Van for 5 + luggage", drop_off: "2026-11-08", drop_off_location: "Pisa Airport" }, false, pisa);
    rows.data = [van];
    await act(async () => { render(<CardBottomSheet card={van} onClose={() => {}} days={vDays} />); });
    expect(screen.getByTestId("voucher-company").textContent).toContain("not booked yet");
    expect(screen.getByTestId("car-voucher").textContent).toContain("Van for 5 + luggage");
    fireEvent.click(screen.getByRole("button", { name: "Add paid" }));
    const box = screen.getByRole("textbox", { name: "paid" });
    fireEvent.change(box, { target: { value: "€450" } });
    await act(async () => { fireEvent.keyDown(box, { key: "Enter" }); });
    const d = writes.calls.map((w) => w.patch.details as Record<string, unknown> | undefined).find((x) => x?.paid_total === 450);
    expect(d?.paid_currency).toBe("EUR");
    expect(d?.car_class).toBe("Van for 5 + luggage");
  });
});
