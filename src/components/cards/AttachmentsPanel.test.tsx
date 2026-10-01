// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { Card, CardAttachment } from "@/types/database";

/**
 * A booking attached to a pin (1 Oct 2026): Apply fills the pin from its own
 * booking, adds its check-out on the day it says, and offers the rest of the
 * package (the flights) in Bookings' own sheet.
 */

const updates: { table: string; patch: Record<string, unknown> }[] = [];
const att = {
  id: "a1", card_id: "c1", trip_id: "t1", file_name: "expedia.pdf", file_type: "application/pdf", file_size: 1000, file_path: null,
  parse_status: "parsed", created_at: "", parsed_data: { bookings: [
    { type: "flight_arrival", title: "AC890 YYZ → PSA", date: "2027-08-24", time: "07:45", end_time: "10:20", confirmation_number: "EX1", address: "Pisa Airport", phone: null, website: null, notes: null },
    { type: "hotel", title: "Villa Zambaldi", date: "2027-08-24", time: "16:00", end_time: null, confirmation_number: "EX1", address: "Via Fonda 403", phone: null, website: null, notes: null, check_out_date: "2027-09-04", check_out_time: "10:00" },
    { type: "flight_departure", title: "AC891 PSA → YYZ", date: "2027-09-04", time: "12:25", end_time: "16:00", confirmation_number: "EX1", address: "Pisa Airport", phone: null, website: null, notes: null },
  ] },
} as unknown as CardAttachment;

function q(table: string) {
  const b: Record<string, unknown> = {};
  const done = (data: unknown) => Promise.resolve({ data, error: null });
  b.select = () => b; b.eq = () => b; b.limit = () => done([]);
  b.order = () => done(table === "days" ? [{ id: "d1", trip_id: "t1", day_number: 1, date: "2027-08-24" }, { id: "d12", trip_id: "t1", day_number: 12, date: "2027-09-04" }] : [att]);
  b.update = (patch: Record<string, unknown>) => { updates.push({ table, patch }); return { eq: () => done(null) }; };
  return b;
}
// One client, as @supabase/ssr's browser client is: a new one per render
// re-runs the panel's fetch effect forever.
const client = { from: (t: string) => q(t), storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null, error: null }) }) } };
vi.mock("@/lib/supabase/client", () => ({ createClient: () => client }));
const scheduled: { dayId: string; startTime?: string; details: Record<string, unknown> }[] = [];
vi.mock("@/lib/scheduleCard", () => ({ scheduleCardOnDay: vi.fn(async (_s: unknown, a: { dayId: string; startTime?: string; details: Record<string, unknown> }) => { scheduled.push(a); return { id: "out", day_id: a.dayId, details: a.details }; }) }));
vi.mock("@/components/ui/FileViewer", () => ({ default: () => null }));
vi.mock("@/components/plan/ConfirmationPreviewSheet", () => ({
  default: ({ heading, items }: { heading?: string; items: { title: string }[] }) => <div data-testid="more">{heading}: {items.map((i) => i.title).join(", ")}</div>,
}));

import AttachmentsPanel from "./AttachmentsPanel";

const villaPin = { id: "c1", trip_id: "t1", day_id: "d1", place_id: "pv", start_time: null, end_time: null, details: {},
  place: { id: "pv", title: "Villa Zambaldi", type: "logistics", sub_type: "hotel", address: "Via Fonda 403" } } as unknown as Card;

afterEach(() => { cleanup(); updates.length = 0; scheduled.length = 0; });

describe("applying an attached package to the hotel's pin", () => {
  it("fills the pin, adds its check-out, and offers the two flights", async () => {
    const added = vi.fn();
    render(<AttachmentsPanel card={villaPin} onClose={vi.fn()} onCardsAdded={added} />);
    fireEvent.click(await screen.findByText("Parsed info"));
    expect(screen.getByTestId("parsed-bookings").textContent).toContain("AC891 PSA → YYZ");
    fireEvent.click(screen.getByText("Apply to card"));
    await waitFor(() => expect(screen.getByTestId("more")).toBeTruthy());
    const u = updates.find((x) => x.table === "cards")!.patch;
    expect((u.details as Record<string, unknown>).check_out).toBe("2027-09-04");
    expect((u.details as Record<string, unknown>).confirmation).toBe("EX1");
    expect(u.start_time).toBe("16:00:00");
    expect(scheduled).toEqual([expect.objectContaining({ dayId: "d12", startTime: "10:00", details: expect.objectContaining({ title: "Check out of Villa Zambaldi" }) })]);
    expect(added).toHaveBeenCalledWith([expect.objectContaining({ id: "out" })]);
    expect(screen.getByTestId("more").textContent).toBe("We also found these in your confirmation: AC890 YYZ → PSA, AC891 PSA → YYZ");
  });
});
