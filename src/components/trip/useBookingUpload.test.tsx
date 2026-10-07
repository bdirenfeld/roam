// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import type { Day } from "@/types/database";

/**
 * Several confirmations in one pick (6 Oct 2026, taps audit). Five bookings
 * used to be five rounds of pick, wait, check, add: 15 taps. Now every file is
 * read (same parse route, three at a time), ONE sheet lists every booking as a
 * compact row, a file that can't be read is named with its reason, and the
 * toast says how many and which days, with Undo.
 */

const inserted: { table: string; rows: unknown }[] = [];
const deleted: { table: string; id: string }[] = [];
vi.mock("@/lib/offline/queuedWrite", () => ({
  queuedInsert: vi.fn(async (table: string, rows: unknown) => { inserted.push({ table, rows }); return { queued: false, error: null }; }),
  queuedDelete: vi.fn(async (table: string, m: { id: string }) => { deleted.push({ table, id: m.id }); return { queued: false, error: null }; }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u1" } } } }) } }),
}));
const toast = vi.fn();
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast }) }));

import { useBookingUpload } from "./useBookingUpload";

const days = [
  { id: "d1", trip_id: "t", day_number: 1, date: "2026-08-25" },
  { id: "d2", trip_id: "t", day_number: 2, date: "2026-08-26" },
  { id: "d5", trip_id: "t", day_number: 5, date: "2026-08-29" },
] as unknown as Day[];

const b = (type: string, title: string, date: string, extra: Record<string, unknown> = {}) =>
  ({ type, title, date, time: "10:00", end_time: null, confirmation_number: null, address: null, phone: null, website: null, notes: null, ...extra });
const PARSED: Record<string, unknown> = {
  "ac890.pdf": { parsed: [b("flight_arrival", "AC 890 Toronto → Florence", "2026-08-25", { end_time: "10:40", confirmation_number: "AC1" })] },
  "borgo.pdf": { parsed: [b("hotel", "Borgo San Felice", "2026-08-25", { check_out_date: "2026-08-29", check_out_time: "11:00", confirmation_number: "BSF" })] },
  "uffizi.png": { parsed: [b("activity", "Uffizi Gallery", "2026-08-26")] },
  "blurry.png": { error: "We couldn't read that file." },
};
let inFlight = 0, peak = 0;
const fetchMock = vi.fn(async (url: string, init?: { body?: FormData }) => {
  if (url === "/api/confirmations/parse") {
    const f = init!.body!.get("file") as File;
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    const body = PARSED[f.name] as { parsed?: unknown; error?: string };
    return { ok: !body.error, json: async () => body };
  }
  return { ok: true, json: async () => ({ predictions: [] }) };   // no place found: the booking stays a note
});

const onAdded = vi.fn();
function Host() {
  const u = useBookingUpload({ tripId: "t", days, onAdded });
  return <div><span data-testid="label">{u.reading ? u.readingLabel : ""}</span>{u.element}</div>;
}
const file = (name: string) => new File(["x"], name, { type: name.endsWith(".png") ? "image/png" : "application/pdf" });
async function pick(names: string[]) {
  render(<Host />);
  const input = screen.getByLabelText("Booking confirmation") as HTMLInputElement;
  expect(input.multiple).toBe(true);
  await act(async () => { fireEvent.change(input, { target: { files: names.map(file) } }); });
}

beforeEach(() => { inserted.length = 0; deleted.length = 0; toast.mockReset(); onAdded.mockReset(); peak = 0; vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe("uploading several bookings", () => {
  it("reads every file, three at a time, into one sheet of compact rows; a bad file is named", async () => {
    await pick(["ac890.pdf", "borgo.pdf", "uffizi.png", "blurry.png"]);
    await screen.findByText("3 bookings");
    expect(peak).toBeLessThanOrEqual(3);
    expect(screen.getByText("4 files read")).toBeTruthy();
    const rows = screen.getAllByTestId("booking-row");
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("AC 890 Toronto → Florence");
    expect(rows[0].textContent).toContain("Day 1 — Tue, Aug 25 · arrives 10:40 AM");
    expect(rows[1].textContent).toContain("Check in Tue, Aug 25 → out Sat, Aug 29");
    // Fields stay behind Edit until asked for.
    expect(screen.queryByLabelText("Title")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit Uffizi Gallery" }));
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Uffizi Gallery");
    expect(screen.getByTestId("read-failures").textContent).toBe("blurry.png · We couldn't read that file.");
  });

  it("Add 3 to my days writes them all, one record per file, and the toast offers Undo", async () => {
    await pick(["ac890.pdf", "borgo.pdf", "uffizi.png", "blurry.png"]);
    await screen.findByText("3 bookings");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add 3 to my days" })); });
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    const cards = inserted.find((i) => i.table === "cards")!.rows as { id: string; details: { confirmation?: string } }[];
    expect(cards).toHaveLength(4);   // flight, check-in, check-out, Uffizi
    const docs = inserted.filter((i) => i.table === "documents").map((d) => d.rows as { file_name: string; card_ids: string[] });
    expect(docs.map((d) => [d.file_name, d.card_ids.length])).toEqual([["ac890.pdf", 1], ["borgo.pdf", 2], ["uffizi.png", 1]]);
    const opts = toast.mock.calls.at(-1)![0];
    expect(opts.message).toBe("Added 3 bookings · Tue 25 Aug – Sat 29 Aug");
    await act(async () => { await opts.undo(); });
    expect(deleted.filter((d) => d.table === "cards").map((d) => d.id).sort()).toEqual(cards.map((c) => c.id).sort());
    expect(deleted.filter((d) => d.table === "documents")).toHaveLength(3);
    expect(onAdded.mock.calls.at(-1)).toEqual([[], cards.map((c) => c.id)]);
  });

  it("one file still opens the full form, and the toast reads singular", async () => {
    await pick(["uffizi.png"]);
    await screen.findByText("Confirmation parsed");
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Uffizi Gallery");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add to my days" })); });
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(toast.mock.calls.at(-1)![0].message).toBe("Added to your days · Wed 26 Aug");
  });

  it("one unreadable file says why, with no sheet", async () => {
    await pick(["blurry.png"]);
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ message: "We couldn't read that file." }));
    expect(screen.queryByTestId("booking-row")).toBeNull();
  });
});
