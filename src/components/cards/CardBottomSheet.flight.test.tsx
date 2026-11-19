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

const airport = (id: string, title: string, sub = "flight_arrival") => ({ id, title, type: "logistics", sub_type: sub, address: title, lat: 1, lng: 1, rating: 4.2, price_level: null, hours: null, google_place_id: "g", details: {} });
const flight = (id: string, day: string, start: string, end: string | null, details: Record<string, unknown>, place: ReturnType<typeof airport>): Card =>
  ({ id, trip_id: "t1", day_id: day, place_id: place.id, status: "in_itinerary", start_time: start, end_time: end, confirmed: true, position: 0, source_url: null, details, place } as unknown as Card);

const romeDays = [{ id: "r1", trip_id: "t1", date: "2026-04-22", day_number: 1 }, { id: "r2", trip_id: "t1", date: "2026-04-23", day_number: 2 }] as unknown as Day[];
const ac890 = flight("ac890", "r1", "19:45:00", "10:20:00", {
  airline: "Air Canada", flight_number: "AC890", aircraft: "777-300ER", origin_airport: "Toronto-Pearson Int. (YYZ)", arriving_at: "Roma Fiumicino Airport (FCO)",
  departure_time: "19:45", arrival_time: "10:20+1day", duration: "8hr35", terminal: "Terminal 1", seat: "39C", confirmation: "B24EDV",
}, airport("fco", "Flight to Rome — Air Canada"));

const tusDays = [{ id: "t24", trip_id: "t1", date: "2027-08-24", day_number: 1 }, { id: "t25", trip_id: "t1", date: "2027-08-25", day_number: 2 }] as unknown as Day[];
const ac876 = flight("ac876", "t24", "19:00:00", "08:35:00", { airline: "Air Canada", flight_number: "AC876", origin_airport: "Toronto Pearson (YYZ)", arriving_at: "Frankfurt (FRA)" }, airport("fra", "Frankfurt Airport"));
const lh330 = flight("lh330", "t25", "10:00:00", "11:30:00", { flight_number: "LH330", origin_airport: "Frankfurt FRA", arriving_at: "Pisa PSA" }, airport("psa", "Pisa International Airport"));

beforeEach(() => { writes.calls = []; rows.data = []; vi.unstubAllGlobals(); });

describe("the boarding-pass flight card (19 Nov 2026)", () => {
  it("his Rome flight reads like a boarding pass: YYZ 7:45 PM Tue 21 Apr → FCO 10:20 AM Wed 22 Apr (kept on its landing day), 8 h 35; no photo, no repeated time rows", async () => {
    rows.data = [ac890];
    await act(async () => { render(<CardBottomSheet card={ac890} onClose={() => {}} days={romeDays} />); });
    const pass = screen.getByTestId("flight-pass");
    expect(pass.textContent).toContain("YYZ");
    expect(pass.textContent).toContain("FCO");
    expect(pass.textContent).toContain("Roma Fiumicino");
    expect(pass.textContent).toContain("7:45 PM");
    expect(pass.textContent).toContain("10:20 AM");
    expect(pass.textContent).toContain("Tue 21 Apr");
    expect(pass.textContent).toContain("Wed 22 Apr · next day");
    expect(screen.getByTestId("pass-length").textContent).toBe("8 h 35");
    expect(pass.textContent).toContain("39C");
    expect(pass.textContent).toContain("B24EDV");
    expect(screen.getByTestId("pass-airline").textContent).toBe("Air Canada·AC 890");
    expect(screen.queryByTestId("photo")).toBeNull();
    expect(screen.queryByText("10:20+1day")).toBeNull();
    expect(screen.queryByText("Departing From")).toBeNull();
    expect(screen.getByText("777-300ER")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Change the time" })).toBeNull();
  });

  it("a guest sees no confirmation and nothing to tap", async () => {
    rows.data = [ac890];
    await act(async () => { render(<CardBottomSheet card={ac890} onClose={() => {}} days={romeDays} readOnly />); });
    expect(screen.getByTestId("flight-pass").textContent).not.toContain("B24EDV");
    expect(screen.queryByRole("button", { name: "Change seat" })).toBeNull();
    expect(screen.queryByTestId("add-connecting")).toBeNull();
  });

  it("tap the seat to change it: saved to details.seat", async () => {
    rows.data = [ac890];
    await act(async () => { render(<CardBottomSheet card={ac890} onClose={() => {}} days={romeDays} />); });
    fireEvent.click(screen.getByRole("button", { name: "Change seat" }));
    const box = screen.getByRole("textbox", { name: "seat" });
    fireEvent.change(box, { target: { value: "40A" } });
    await act(async () => { fireEvent.keyDown(box, { key: "Enter" }); });
    expect(writes.calls.some((w) => (w.patch.details as Record<string, unknown> | undefined)?.seat === "40A")).toBe(true);
  });

  it("a connecting flight: AC 876 shows '1 h 25 layover in Frankfurt · Then LH 330 to Pisa', and the row opens LH 330", async () => {
    rows.data = [ac876, lh330];
    const opened: string[] = [];
    await act(async () => { render(<CardBottomSheet card={ac876} onClose={() => {}} days={tusDays} onOpenCard={(c) => opened.push(c.id)} />); });
    const row = await waitFor(() => screen.getByTestId("layover-after"));
    expect(row.textContent).toContain("1 h 25 layover in Frankfurt");
    expect(row.textContent).toContain("Then LH 330 to Pisa, 10:00 AM");
    expect(screen.queryByTestId("add-connecting")).toBeNull();
    fireEvent.click(row);
    expect(opened).toEqual(["lh330"]);
  });

  it("…and LH 330 shows the same layover the other way, after AC 876 from Toronto", async () => {
    rows.data = [ac876, lh330];
    await act(async () => { render(<CardBottomSheet card={lh330} onClose={() => {}} days={tusDays} />); });
    const row = await waitFor(() => screen.getByTestId("layover-before"));
    expect(row.textContent).toContain("1 h 25 layover in Frankfurt");
    expect(row.textContent).toContain("After AC 876 from Toronto Pearson");
  });

  it("a flight with nothing after it offers '+ Add a connecting flight', From and Day filled in from where and when it lands", async () => {
    rows.data = [ac876];
    await act(async () => { render(<CardBottomSheet card={ac876} onClose={() => {}} days={tusDays} />); });
    fireEvent.click(screen.getByTestId("add-connecting"));
    const form = screen.getByTestId("connecting-form");
    expect(form.textContent).toContain("After AC 876 lands in Frankfurt · Wed 25 Aug, 8:35 AM");
    expect((screen.getByLabelText("From") as HTMLInputElement).value).toBe("Frankfurt (FRA)");
    expect((screen.getByLabelText("Day") as HTMLSelectElement).value).toBe("t25");
  });

  it("'Land in Sydney' (no airports named) keeps the place card", async () => {
    const syd = flight("syd", "r1", "07:00:00", "09:30:00", { title: "Land in Sydney" }, airport("syd", "Sydney Kingsford Smith Airport"));
    await act(async () => { render(<CardBottomSheet card={syd} onClose={() => {}} days={romeDays} />); });
    expect(screen.queryByTestId("flight-pass")).toBeNull();
    expect(screen.getByTestId("photo")).toBeTruthy();
  });
});
