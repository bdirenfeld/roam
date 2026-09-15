// ── Which letter each row gets ────────────────────────────────────────────
// A hearted B came back as D after every run, so the pin he was watching
// moved (audit, 15 Sept 2026). A row he kept keeps its letter when nothing
// else has claimed it; the rest take the first free letters in list order.

export const LETTERS = "ABCDEFGHIJKL";

export function assignLetters(rows: { prior: string | null | undefined }[]): (string | null)[] {
  const taken = new Set<string>();
  const out: (string | null)[] = rows.map(() => null);
  rows.forEach((r, i) => {
    if (r.prior && LETTERS.includes(r.prior) && !taken.has(r.prior)) { out[i] = r.prior; taken.add(r.prior); }
  });
  rows.forEach((r, i) => {
    if (out[i]) return;
    const free = LETTERS.split("").find((l) => !taken.has(l)) ?? null;
    if (free) taken.add(free);
    out[i] = free;
  });
  return out;
}
