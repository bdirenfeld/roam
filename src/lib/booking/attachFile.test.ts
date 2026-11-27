import { describe, it, expect, vi } from "vitest";
import { attachBookingFile, attachmentRows, bookingFilePath, listedOnce } from "./attachFile";

// 27 Nov 2026: "when I click on attachments in the travel card that was created,
// I don't see the attachment I uploaded". The upload now keeps its file on its cards.

function fakeDb(opts: { upErr?: unknown; insErr?: unknown } = {}) {
  const calls: { upload: unknown[][]; insert: unknown[][] } = { upload: [], insert: [] };
  const db = {
    storage: { from: (bucket: string) => ({ upload: async (...a: unknown[]) => { calls.upload.push([bucket, ...a]); return { error: opts.upErr ?? null }; } }) },
    from: (table: string) => ({ insert: async (rows: unknown) => { calls.insert.push([table, rows]); return { error: opts.insErr ?? null }; } }),
  };
  return { db, calls };
}

describe("keeping an uploaded confirmation on its cards", () => {
  it("stores it under the journey's folder first, as the bucket's owner policy asks", () => {
    expect(bookingFilePath("t1", "k9", "Air Canada (AC890).pdf")).toBe("t1/bookings/k9-Air_Canada__AC890_.pdf");
  });

  it("one row per card, each pointing at the same stored file, marked already read", () => {
    const rows = attachmentRows({ tripId: "t1", cardIds: ["in", "out", "in"], path: "t1/bookings/k-x.pdf", name: "x.pdf", type: "application/pdf", size: 10 });
    expect(rows.map((r) => r.card_id)).toEqual(["in", "out"]);
    expect(rows.every((r) => r.file_path === "t1/bookings/k-x.pdf" && r.trip_id === "t1" && r.parse_status === "skipped")).toBe(true);
  });

  it("uploads once, then writes the rows", async () => {
    const { db, calls } = fakeDb();
    const ok = await attachBookingFile(db, { tripId: "t1", key: "k", cardIds: ["a", "b"], file: new Blob(["pdf"]), name: "x.pdf", type: "application/pdf" });
    expect(ok).toBe(true);
    expect(calls.upload).toHaveLength(1);
    expect(calls.upload[0][0]).toBe("card-attachments");
    expect(calls.upload[0][1]).toBe("t1/bookings/k-x.pdf");
    expect(calls.insert[0][0]).toBe("card_attachments");
    expect((calls.insert[0][1] as unknown[]).length).toBe(2);
  });

  it("a failed upload writes no rows and says false; no cards, nothing done", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = fakeDb({ upErr: { message: "denied" } });
    expect(await attachBookingFile(failed.db, { tripId: "t1", key: "k", cardIds: ["a"], file: new Blob(["x"]), name: "x.pdf", type: "application/pdf" })).toBe(false);
    expect(failed.calls.insert).toHaveLength(0);
    const none = fakeDb();
    expect(await attachBookingFile(none.db, { tripId: "t1", key: "k", cardIds: [], file: new Blob(["x"]), name: "x.pdf", type: "" })).toBe(false);
    expect(none.calls.upload).toHaveLength(0);
  });
});

describe("Bookings lists each file once", () => {
  it("a hotel's file on check-in and check-out is one entry, and its upload record is not a second", () => {
    const atts = [
      { path: "t/bookings/k-borgo.pdf", cardId: "in", fileName: "borgo.pdf" },
      { path: "t/bookings/k-borgo.pdf", cardId: "out", fileName: "borgo.pdf" },
      { path: "t/c/receipt.png", cardId: "x", fileName: "receipt.png" },
    ];
    const docs = [
      { cardIds: ["in", "out"], fileName: "borgo.pdf" },
      { cardIds: ["old"], fileName: "older-upload.pdf" },
    ];
    const out = listedOnce(atts, docs);
    expect(out.atts.map((a) => a.cardId)).toEqual(["in", "x"]);
    expect(out.docs.map((d) => d.fileName)).toEqual(["older-upload.pdf"]);
  });
});
