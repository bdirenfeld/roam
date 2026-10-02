// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

/**
 * Importing a booking, rendered. Until 23 Sep 2026 each card was inserted on
 * its own and a failure was only logged, so a round trip could land as the
 * outbound flight alone while the sheet closed as if both had imported.
 */

const queued = vi.fn();
vi.mock("@/lib/offline/queuedWrite", () => ({ queuedInsert: (...a: unknown[]) => queued(...a) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u1" } } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "pv", title: "Villa Zambaldi", type: "logistics", sub_type: "hotel", lat: 43.87, lng: 10.45, address: "Via Fonda 403, Lucca" } }) }) }) }),
  }),
}));

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
