// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

/**
 * Importing a booking, rendered. Until 23 Sep 2026 each card was inserted on
 * its own and a failure was only logged, so a round trip could land as the
 * outbound flight alone while the sheet closed as if both had imported.
 */

const queued = vi.fn();
const updated = vi.fn<(...a: unknown[]) => Promise<{ queued: boolean; error: null }>>(async () => ({ queued: false, error: null }));
vi.mock("@/lib/offline/queuedWrite", () => ({ queuedInsert: (...a: unknown[]) => queued(...a), queuedUpdate: (...a: unknown[]) => updated(...a) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u1" } } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "pv", title: "Villa Zambaldi", type: "logistics", sub_type: "hotel", lat: 43.87, lng: 10.45, address: "Via Fonda 403, Lucca" } }) }) }) }),
  }),
}));

const extendJourney = vi.fn();
vi.mock("@/lib/confirmations/extendJourney", () => ({ extendJourney: (...a: unknown[]) => extendJourney(...a) }));

import ConfirmationPreviewSheet, { type ParsedConfirmation } from "./ConfirmationPreviewSheet";
import type { DayWithCards } from "@/types/database";

afterEach(cleanup);
beforeEach(() => queued.mockReset());

const flight = (type: ParsedConfirmation["type"], date: string, title: string): ParsedConfirmation => ({
  type, title, date, time: "10:05", end_time: "12:40", confirmation_number: "ABC123",
  address: null, phone: null, website: null, notes: null,
});
const days = [
  { id: "d1", date: "2027-08-24", day_number: 1, cards: [] },
  { id: "d12", date: "2027-09-04", day_number: 12, cards: [] },
] as unknown as DayWithCards[];

function open(onCardsCreated = vi.fn()) {
  render(
    <ConfirmationPreviewSheet
      items={[flight("flight_arrival", "2027-08-24", "YYZ → PSA"), flight("flight_departure", "2027-09-04", "PSA → YYZ")]}
      fileName="aircanada.pdf" fileType="application/pdf" days={days} tripId="t1"
      onClose={vi.fn()} onCardsCreated={onCardsCreated}
    />,
  );
  fireEvent.click(screen.getByText("Add 2 to my days"));
  return onCardsCreated;
}

describe("importing a round trip", () => {
  it("writes both flights in one insert, then the document", async () => {
    queued.mockResolvedValue({ queued: false, error: null });
    const done = open();
    await waitFor(() => expect(done).toHaveBeenCalled());
    const [table, rows] = queued.mock.calls[0];
    expect(table).toBe("cards");
    expect(rows).toHaveLength(2);
    expect(rows.map((r: { day_id: string }) => r.day_id)).toEqual(["d1", "d12"]);
    expect(done.mock.calls[0][0]).toHaveLength(2);
  });

  it("on a refusal adds nothing, says so, and keeps the sheet open", async () => {
    queued.mockResolvedValue({ queued: false, error: { message: "refused" } });
    const done = open();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/Nothing was added/);
    expect(done).not.toHaveBeenCalled();
  });

  it("with no signal, the write is queued and counts as added", async () => {
    queued.mockResolvedValue({ queued: true, error: null });
    const done = open();
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("importing a hotel booking (1 Oct 2026)", () => {
  const villa: ParsedConfirmation = {
    type: "hotel", title: "Villa Zambaldi", date: "2027-08-24", time: "16:00", end_time: null, confirmation_number: "SV-88",
    address: "Via Fonda 403, Lucca", phone: null, website: null, notes: null, check_out_date: "2027-09-04", check_out_time: "10:00",
  };
  it("is the real place, with check-in and a check-out card on the day it says", async () => {
    queued.mockResolvedValue({ queued: false, error: null });
    const asked: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      asked.push(url);
      if (url.startsWith("/api/places/autocomplete")) return { json: async () => ({ predictions: [{ place_id: "gV" }] }) };
      return { json: async () => ({ imported: [{ place_id: "pv" }] }) };
    }));
    const done = vi.fn();
    render(<ConfirmationPreviewSheet items={[villa]} fileName="villa.pdf" fileType="application/pdf" days={days} tripId="t1" onClose={vi.fn()} onCardsCreated={done} />);
    expect((screen.getByLabelText(/Check out/) as HTMLSelectElement).value).toBe("d12");
    fireEvent.click(screen.getByText("Add to my days"));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(asked[0]).toContain(encodeURIComponent("Villa Zambaldi, Via Fonda 403, Lucca"));
    const rows = queued.mock.calls[0][1] as { day_id: string; place_id: string; start_time: string; details: Record<string, unknown> }[];
    expect(rows.map((r) => [r.day_id, r.place_id, r.start_time])).toEqual([["d1", "pv", "16:00:00"], ["d12", "pv", "10:00:00"]]);
    expect(rows[0].details.check_out).toBe("2027-09-04");
    expect(rows[1].details.title).toBe("Check out of Villa Zambaldi");
    vi.unstubAllGlobals();
  });
});

describe("a booking dated outside the journey (3 Oct 2026)", () => {
  const noPlace = () => vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ predictions: [] }) })));
  const sheet = (items: ParsedConfirmation[], extra: { onCardsCreated?: () => void; onDaysChanged?: () => void } = {}) =>
    render(<ConfirmationPreviewSheet items={items} fileName="ac.pdf" fileType="application/pdf" days={days} tripId="t1"
      onClose={vi.fn()} onCardsCreated={extra.onCardsCreated ?? vi.fn()} onDaysChanged={extra.onDaysChanged ?? vi.fn()} />);
  const ac = (type: ParsedConfirmation["type"], date: string) => ({ ...flight(type, date, "Air Canada · YYZ → PSA"), flight_number: "AC890" });

  it("a flight the day before goes on the first day, with one plain line and no error", () => {
    sheet([ac("flight_arrival", "2027-08-23")]);
    expect(screen.getByTestId("outside-note").textContent).toContain("AC 890 flies Mon 23 Aug, a day before the trip starts. It'll go on Tue 24 Aug.");
    expect(screen.getByRole("button", { name: "Extend the trip to Mon 23 Aug" })).toBeTruthy();
    expect((screen.getByLabelText(/^Day/) as HTMLSelectElement).value).toBe("d1");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a flight home after the end goes on the LAST day, not Day 1", () => {
    sheet([ac("flight_departure", "2027-09-05")]);
    expect((screen.getByLabelText(/^Day/) as HTMLSelectElement).value).toBe("d12");
    expect(screen.getByTestId("outside-note").textContent).toContain("a day after the trip ends. It'll go on Sat 4 Sep.");
  });

  it("nothing is said for bookings on the first and last day", () => {
    sheet([ac("flight_arrival", "2027-08-24"), ac("flight_departure", "2027-09-04")]);
    expect(screen.queryByTestId("outside-note")).toBeNull();
  });

  it("a stay that checks out after the end keeps its check-out, on the last day", async () => {
    queued.mockResolvedValue({ queued: false, error: null });
    noPlace();
    const done = vi.fn();
    const stay: ParsedConfirmation = { type: "hotel", title: "Villa Zambaldi", date: "2027-09-04", time: "16:00", end_time: null, confirmation_number: "SV-88",
      address: "Via Fonda 403, Lucca", phone: null, website: null, notes: null, check_out_date: "2027-09-05", check_out_time: "10:00" };
    sheet([stay], { onCardsCreated: done });
    expect(screen.getByTestId("outside-note").textContent).toContain("Check-out from Villa Zambaldi is Sun 5 Sep, a day after the trip ends.");
    expect((screen.getByLabelText(/Check out/) as HTMLSelectElement).value).toBe("d12");
    fireEvent.click(screen.getByText("Add to my days"));
    await waitFor(() => expect(done).toHaveBeenCalled());
    const rows = queued.mock.calls[0][1] as { day_id: string; details: Record<string, unknown> }[];
    expect(rows.map((r) => r.day_id)).toEqual(["d12", "d12"]);
    expect(rows[1].details.title).toBe("Check out of Villa Zambaldi");
    vi.unstubAllGlobals();
  });

  it("Extend the trip widens the journey and puts the flight on its real day", async () => {
    queued.mockResolvedValue({ queued: false, error: null });
    noPlace();
    extendJourney.mockResolvedValue({ days: [
      { id: "d0", date: "2027-08-23", day_number: 1, day_name: "Day 1" },
      { id: "d1", date: "2027-08-24", day_number: 2, day_name: "Day 1" },
      { id: "d12", date: "2027-09-04", day_number: 13, day_name: null },
    ] });
    const done = vi.fn(), changed = vi.fn();
    sheet([ac("flight_arrival", "2027-08-23")], { onCardsCreated: done, onDaysChanged: changed });
    fireEvent.click(screen.getByRole("button", { name: "Extend the trip to Mon 23 Aug" }));
    await waitFor(() => expect(screen.queryByTestId("outside-note")).toBeNull());
    expect(extendJourney.mock.calls[0].slice(1)).toEqual(["t1", "2027-08-23", "2027-09-04"]);
    expect((screen.getByLabelText(/^Day/) as HTMLSelectElement).value).toBe("d0");
    expect(screen.getByTestId("extended-note").textContent).toBe("The trip now runs Mon 23 Aug – Sat 4 Sep.");
    fireEvent.click(screen.getByText("Add to my days"));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect((queued.mock.calls[0][1] as { day_id: string }[])[0].day_id).toBe("d0");
    expect(changed).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("a refused extension says so plainly and keeps the booking on the nearest day", async () => {
    extendJourney.mockResolvedValue({ error: "Couldn't change the trip's dates. Try again." });
    const changed = vi.fn();
    sheet([ac("flight_arrival", "2027-08-23")], { onDaysChanged: changed });
    fireEvent.click(screen.getByRole("button", { name: "Extend the trip to Mon 23 Aug" }));
    expect(await screen.findByText("Couldn't change the trip's dates. Try again.")).toBeTruthy();
    expect((screen.getByLabelText(/^Day/) as HTMLSelectElement).value).toBe("d1");
    expect(changed).not.toHaveBeenCalled();
  });
});

describe("read from a confirmation = booked, and agendas (6 Oct 2026)", () => {
  it("every card it adds is booked, and a round trip says out and back", async () => {
    queued.mockResolvedValue({ queued: false, error: null });
    render(
      <ConfirmationPreviewSheet
        items={[flight("flight_arrival", "2027-08-24", "YYZ → PSA"), flight("flight_departure", "2027-09-04", "PSA → YYZ")]}
        fileName="aircanada.pdf" fileType="application/pdf" days={days} tripId="t1" onClose={vi.fn()} onCardsCreated={vi.fn()}
      />,
    );
    expect(screen.getByText("Round-trip flight · out and back")).toBeTruthy();
    fireEvent.click(screen.getByText("Add 2 to my days"));
    await waitFor(() => expect(queued).toHaveBeenCalled());
    expect((queued.mock.calls[0][1] as { confirmed: boolean }[]).map((r) => r.confirmed)).toEqual([true, true]);
  });

  it("a conference with an agenda becomes one card per day, with its times and schedule", async () => {
    queued.mockResolvedValue({ queued: false, error: null });
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ predictions: [] }) })));
    const summit = {
      type: "activity", title: "Negotiation Mastery Summit 2027", date: "2027-08-24", time: "07:30", end_time: null,
      confirmation_number: null, address: "500 W Las Colinas Blvd", phone: null, website: null, notes: null,
      agenda: [
        { date: "2027-08-24", start: "07:30", end: "17:00", items: [{ time: "07:30", title: "Breakfast" }, { time: "08:30", title: "Opening keynote" }] },
        { date: "2027-09-04", start: "07:30", end: "16:00", items: [{ time: "08:30", title: "Bargaining" }] },
      ],
    } as unknown as ParsedConfirmation;
    render(<ConfirmationPreviewSheet items={[summit]} fileName="summit.pdf" fileType="application/pdf" days={days} tripId="t1" onClose={vi.fn()} onCardsCreated={vi.fn()} />);
    fireEvent.click(screen.getByText("Add 2 to my days"));
    await waitFor(() => expect(queued).toHaveBeenCalled());
    const rows = queued.mock.calls[0][1] as { day_id: string; start_time: string; end_time: string; confirmed: boolean; details: { notes?: string } }[];
    expect(rows.map((r) => [r.day_id, r.start_time, r.end_time, r.confirmed])).toEqual([["d1", "07:30:00", "17:00:00", true], ["d12", "07:30:00", "16:00:00", true]]);
    expect(rows[0].details.notes).toContain(["**Day 1 schedule**", "- 7:30 Breakfast", "- 8:30 Opening keynote"].join(String.fromCharCode(10)));
    vi.unstubAllGlobals();
  });

  it("a booking already on that day (same place) is marked booked, not added twice", async () => {
    queued.mockResolvedValue({ queued: false, error: null });
    updated.mockClear();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.startsWith("/api/places/autocomplete")) return { json: async () => ({ predictions: [{ place_id: "gV" }] }) };
      return { json: async () => ({ imported: [{ place_id: "pv" }] }) };
    }));
    const withVilla = [
      { id: "d1", date: "2027-08-24", day_number: 1, cards: [{ id: "old", place_id: "pv", status: "in_itinerary", start_time: null, end_time: null, confirmed: false }] },
      { id: "d12", date: "2027-09-04", day_number: 12, cards: [] },
    ] as unknown as DayWithCards[];
    const villa = { type: "hotel", title: "Villa Zambaldi", date: "2027-08-24", time: "16:00", end_time: null, confirmation_number: "SV-88",
      address: "Via Fonda 403, Lucca", phone: null, website: null, notes: null, check_out_date: "2027-09-04", check_out_time: "10:00" } as ParsedConfirmation;
    const done = vi.fn();
    render(<ConfirmationPreviewSheet items={[villa]} fileName="villa.pdf" fileType="application/pdf" days={withVilla} tripId="t1" onClose={vi.fn()} onCardsCreated={done} onDaysChanged={vi.fn()} />);
    fireEvent.click(screen.getByText("Add to my days"));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(updated).toHaveBeenCalledWith("cards", { id: "old" }, expect.objectContaining({ confirmed: true, start_time: "16:00:00" }));
    const rows = queued.mock.calls[0][1] as { day_id: string }[];
    expect(rows.map((r) => r.day_id)).toEqual(["d12"]);
    vi.unstubAllGlobals();
  });
});
