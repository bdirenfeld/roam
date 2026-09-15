// ── What the sheet says above the rows ────────────────────────────────────
// Nothing, unless there is a decision to put to him. The three-sentence
// paragraph ("Stay within 15 minutes of Tokyo. Priced for the same days in
// 2027… Too spread out for one base…") was facts already said elsewhere —
// the tab says Tokyo, the card's price line says 2027 — and he called it
// "too much and no one would read" (15 Sept 2026, the Essentialism pass).
// One kind of sentence survives: the one that ends "your call".

export function decisionLine(splitText: string | null | undefined): string | null {
  if (!splitText) return null;
  const m = /([^.]*your call\.)/i.exec(splitText);
  return m ? m[1].trim() : null;
}
