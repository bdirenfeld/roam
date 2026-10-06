// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

/**
 * Bookings (6 Oct 2026): To book sits at the top, then "Uploaded" with the
 * Upload button and the files, as before. ToBookSection decides for itself
 * whether to show (owner only) — see ToBookSection.test.tsx.
 */

const q: Record<string, unknown> = {};
q.select = () => q; q.eq = () => q;
q.order = () => Promise.resolve({ data: [] });
const client = { from: () => q, storage: { from: () => ({ createSignedUrls: () => Promise.resolve({ data: [] }) }) } };
vi.mock("@/lib/supabase/client", () => ({ createClient: () => client }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/ui/FileViewer", () => ({ default: () => null }));
vi.mock("./ToBookSection", () => ({ default: ({ tripId }: { tripId: string }) => <div data-testid="to-book-host">{tripId}</div> }));

import DocumentsSheet from "./DocumentsSheet";

afterEach(cleanup);

describe("the Bookings sheet", () => {
  it("hosts To book first, then Uploaded with the upload button and the files", async () => {
    render(<DocumentsSheet tripId="t1" onClose={() => {}} onImport={() => {}} />);
    await waitFor(() => expect(screen.getByText("No documents yet")).toBeTruthy());
    const toBook = screen.getByTestId("to-book-host");
    expect(toBook.textContent).toBe("t1");
    const uploaded = screen.getByText("Uploaded");
    const upload = screen.getByRole("button", { name: "Upload a booking" });
    const empty = screen.getByText("No documents yet");
    const follows = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(toBook, uploaded)).toBe(true);
    expect(follows(uploaded, upload)).toBe(true);
    expect(follows(upload, empty)).toBe(true);
    // The old subtitle said "Confirmations you've uploaded"; the label replaces it.
    expect(screen.queryByText(/Confirmations you/)).toBeNull();
  });

  it("read-only hosts still get no Upload button", async () => {
    render(<DocumentsSheet tripId="t1" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("No documents yet")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Upload a booking" })).toBeNull();
  });
});
