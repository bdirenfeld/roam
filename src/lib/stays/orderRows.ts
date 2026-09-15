// ── The order the list is read in ─────────────────────────────────────────
// The stay he has chosen (or booked) leads; everything else keeps its letter
// order, which is the order the pins carry. Villa Bottino sat LAST on the
// Tuscany list as row F under five villas he has not picked (15 Sept 2026).

export function orderRows<T extends { status: string; letter: string | null }>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => {
    const ca = a.status === "chosen" ? 0 : 1;
    const cb = b.status === "chosen" ? 0 : 1;
    if (ca !== cb) return ca - cb;
    // No letter sorts after every letter; a plain comparison, because
    // localeCompare puts punctuation before A.
    const la = a.letter ?? "zz", lb = b.letter ?? "zz";
    return la < lb ? -1 : la > lb ? 1 : 0;
  });
}
