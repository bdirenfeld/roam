/**
 * An uploaded confirmation, kept on the cards it made (27 Nov 2026). Brennan:
 * "when I click on attachments in the travel card that was created, I don't see
 * the attachment I uploaded". Bookings used to keep only a record of the upload
 * (documents), never the file. Now the file goes into card-attachments once,
 * under the journey's folder (the bucket's owner policy), and every card it
 * made gets a card_attachments row pointing at it. Best-effort: a failure here
 * never takes back the cards.
 */

type Store = {
  storage: { from: (bucket: string) => { upload: (path: string, body: Blob, opts: { contentType: string; upsert?: boolean }) => Promise<{ error: unknown }> } };
  from: (table: string) => { insert: (rows: Record<string, unknown>[]) => PromiseLike<{ error: unknown }> };
};

/** Where the file is kept: "<trip>/bookings/<key>-<safe name>" (the trip folder first, as the bucket's policy asks). */
export function bookingFilePath(tripId: string, key: string, name: string): string {
  const safe = (name || "booking").replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${tripId}/bookings/${key}-${safe}`;
}

/** The rows that tie the one stored file to each card. "skipped": already read, nothing to read again. */
export function attachmentRows(a: { tripId: string; cardIds: string[]; path: string; name: string; type: string; size: number }): Record<string, unknown>[] {
  return a.cardIds.filter((id, i) => a.cardIds.indexOf(id) === i).map((card_id) => ({
    card_id,
    trip_id: a.tripId,
    file_name: a.name,
    file_type: a.type || null,
    file_path: a.path,
    file_url: null,
    file_size: a.size,
    parse_status: "skipped",
  }));
}

/** True when the file and its rows were saved. */
export async function attachBookingFile(
  supabase: unknown,
  a: { tripId: string; key: string; cardIds: string[]; file: Blob; name: string; type: string },
): Promise<boolean> {
  if (!a.cardIds.length) return false;
  const db = supabase as Store;
  const path = bookingFilePath(a.tripId, a.key, a.name);
  try {
    const { error: upErr } = await db.storage.from("card-attachments").upload(path, a.file, { contentType: a.type || "application/octet-stream", upsert: true });
    if (upErr) { console.error("[attachBookingFile] upload failed", upErr); return false; }
    const { error } = await db.from("card_attachments").insert(attachmentRows({ tripId: a.tripId, cardIds: a.cardIds, path, name: a.name, type: a.type, size: a.file.size }));
    if (error) { console.error("[attachBookingFile] rows refused", error); return false; }
    return true;
  } catch (e) {
    console.error("[attachBookingFile]", e);
    return false;
  }
}

/**
 * Bookings lists each kept file once (27 Nov 2026): a hotel's file sits on its
 * check-in AND check-out card (two rows, one stored path), and the upload's own
 * record names the same file. Keeps the first row per stored path, and drops a
 * record whose file is already kept on one of its cards.
 */
export function listedOnce<A extends { path: string; cardId: string; fileName: string }, D extends { cardIds: string[] | null; fileName: string }>(
  atts: A[], docs: D[],
): { atts: A[]; docs: D[] } {
  const seen = new Set<string>();
  const keptAtts = atts.filter((a) => {
    if (!a.path) return true;
    if (seen.has(a.path)) return false;
    seen.add(a.path);
    return true;
  });
  const keptDocs = docs.filter((d) => !atts.some((a) => a.fileName === d.fileName && (d.cardIds ?? []).includes(a.cardId)));
  return { atts: keptAtts, docs: keptDocs };
}
