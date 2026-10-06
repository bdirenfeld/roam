// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BookingFile } from "@/lib/booking/files";

/**
 * Bookings (6 Oct 2026 redesign): the owner gets ToBookSection's three rows
 * with every upload placed in its own row (or Other files); anyone else gets
 * the files they always saw, as a plain list. No "Uploaded" section, no dark
 * upload button, no empty-state block. ToBookSection's own behaviour is in
 * ToBookSection.test.tsx; here it is a stand-in that reports what it was given.
 */

let docs: unknown[] = [];
let atts: unknown[] = [];
const q = (table: string) => {
  const o: Record<string, unknown> = {};
  o.select = () => o; o.eq = () => o;
  o.order = () => Promise.resolve({ data: table === "documents" ? docs : atts });
  return o;
};
const client = {
  from: q,
  storage: { from: () => ({ createSignedUrls: (paths: string[]) => Promise.resolve({ data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}` })) }) }) },
};
vi.mock("@/lib/supabase/client", () => ({ createClient: () => client }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const viewed = vi.fn();
vi.mock("@/components/ui/FileViewer", () => ({ default: ({ file }: { file: { url: string } }) => { viewed(file.url); return null; } }));

let isOwner = true;
let given: { files: BookingFile[] } | null = null;
vi.mock("./ToBookSection", async () => {
  const { useEffect } = await import("react");
  function ToBookStandIn(p: { tripId: string; files: BookingFile[]; onOwner?: (o: boolean) => void }) {
    given = p;
    useEffect(() => { p.onOwner?.(isOwner); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return isOwner ? <div data-testid="to-book-host">{p.tripId}</div> : null;
  }
  return { default: ToBookStandIn };
});

import DocumentsSheet from "./DocumentsSheet";

const FLIGHT_FILE = {
  id: "a1", card_id: "c1", file_name: "AC890.pdf", file_type: "application/pdf", file_url: null, file_path: "t1/AC890.pdf", created_at: "2026-07-01T00:00:00Z",
  cards: { details: { airline: "Air Canada" }, places: { title: "LaGuardia Airport", sub_type: "flight_arrival" } },
};
const TICKET = {
  id: "a2", card_id: "c2", file_name: "Uffizi.pdf", file_type: "application/pdf", file_url: null, file_path: "t1/Uffizi.pdf", created_at: "2026-07-02T00:00:00Z",
  cards: { details: {}, places: { title: "Uffizi Gallery", sub_type: "museum" } },
};
const HOTEL_DOC = { id: "d1", trip_id: "t1", file_name: "11 Howard.pdf", file_type: "application/pdf", document_type: "hotel", parsed_data: [{ type: "hotel", title: "11 Howard" }], card_ids: ["x"], created_at: "2026-07-03T00:00:00Z" };

beforeEach(() => { docs = []; atts = []; isOwner = true; given = null; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("the Bookings sheet, owner", () => {
  it("hosts the three rows and hands them every upload, placed in its row", async () => {
    atts = [FLIGHT_FILE, TICKET];
    docs = [HOTEL_DOC];
    render(<DocumentsSheet tripId="t1" onClose={() => {}} onImport={() => {}} />);
    await waitFor(() => expect(given?.files).toHaveLength(3));
    expect(screen.getByRole("heading", { name: "Bookings" })).toBeTruthy();
    expect(screen.getByTestId("to-book-host").textContent).toBe("t1");
    const byId = Object.fromEntries(given!.files.map((f) => [f.id, f]));
    expect(byId.a1).toMatchObject({ row: "flights", label: "Air Canada", url: "https://signed/t1/AC890.pdf", source: "attachment" });
    expect(byId.a2).toMatchObject({ row: null, detail: "on Uffizi Gallery" });
    expect(byId.d1).toMatchObject({ row: "stays", label: "11 Howard", url: null, source: "document" });
    // Gone: the section label, the dark upload button, the empty-state block, the plain list.
    expect(screen.queryByText("Uploaded")).toBeNull();
    expect(screen.queryByRole("button", { name: "Upload a booking" })).toBeNull();
    expect(screen.queryByText("No documents yet")).toBeNull();
    expect(screen.queryByTestId("bookings-files")).toBeNull();
  });
});

describe("the Bookings sheet, a guest", () => {
  it("sees the files as a plain list, no checklist; a file opens in the viewer", async () => {
    isOwner = false;
    atts = [FLIGHT_FILE];
    docs = [HOTEL_DOC];
    render(<DocumentsSheet tripId="t1" onClose={() => {}} />);
    const list = await screen.findByTestId("bookings-files");
    expect(screen.queryByTestId("to-book-host")).toBeNull();
    expect(list.textContent).toContain("AC890.pdf");
    expect(list.textContent).toContain("11 Howard.pdf");
    expect(screen.queryByRole("button", { name: "Upload a confirmation" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /AC890\.pdf/ }));
    expect(viewed).toHaveBeenCalledWith("https://signed/t1/AC890.pdf");
  });

  it("nothing yet: one quiet line", async () => {
    isOwner = false;
    render(<DocumentsSheet tripId="t1" onClose={() => {}} />);
    expect(await screen.findByText("Nothing has been added yet.")).toBeTruthy();
  });

  it("a cohost who can upload gets the quiet upload link", async () => {
    isOwner = false;
    const onImport = vi.fn();
    render(<DocumentsSheet tripId="t1" onClose={() => {}} onImport={onImport} />);
    await userEvent.click(await screen.findByRole("button", { name: "Upload a confirmation" }));
    expect(onImport).toHaveBeenCalledTimes(1);
  });
});
