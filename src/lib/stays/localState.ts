// ── What the sheet shows the moment a write lands, before the reload ───────
// Pure, so a test can see it. The client used to demote EVERY chosen row to
// "saved" when one was chosen, while the server only demoted the one on the
// same base — so choosing Osaka un-ticked Tokyo on screen until a reload
// (audit, 15 Sept 2026). The 11 Sept fix had landed on one side only.

export interface LocalRow {
  id: string;
  base: number | null;
  status: string;
  place_id?: string | null;
}

/** The rows after Choose on `id`: it is chosen; any other chosen row ON THE SAME BASE becomes saved. */
export function markChosen<T extends LocalRow>(rows: T[], id: string, placeId: string | null | undefined): T[] {
  const target = rows.find((r) => r.id === id);
  if (!target) return rows;
  const base = target.base ?? 0;
  return rows.map((r) => {
    if (r.id === id) return { ...r, status: "chosen", place_id: placeId ?? r.place_id ?? null };
    if (r.status === "chosen" && (r.base ?? 0) === base) return { ...r, status: "saved" };
    return r;
  });
}
