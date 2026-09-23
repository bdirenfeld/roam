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
  fireEvent.click(screen.getByText("Add 2 cards to plan"));
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
