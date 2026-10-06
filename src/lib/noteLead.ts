/**
 * The first thing a note actually SAYS about the place.
 *
 * Not simply the first line: notes are written with headings — `**Intent**`,
 * `KNOW BEFORE YOU GO`, `BRING`, `COST` — and taking line one literally put
 * "**Intent**" on the face of the card. Walk past the headings and the
 * bullet marks to the first real sentence.
 *
 * Moved out of CardSurface on 6 Oct 2026 so the week's opened day and the map
 * pin card use the same rule: both were printing a raw "**Intent**".
 */
export function noteLead(notes: string | null | undefined): string | null {
  if (typeof notes !== "string" || !notes) return null;

  for (const raw of notes.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    // A whole line wrapped in ** ** is a heading, not a sentence.
    if (/^\*{1,2}.+\*{1,2}$/.test(line)) continue;
    // Markdown headings and horizontal rules.
    if (/^(#{1,6}\s|[-=_]{3,}$)/.test(line)) continue;

    const clean = line
      .replace(/^[•·\-*>\s]+/, "")
      .replace(/\*\*/g, "")
      .trim();
    if (!clean) continue;
    // Caps-only labels: COST, BRING, THE LIST, BE REALISTIC.
    if (clean.length < 44 && clean === clean.toUpperCase() && /[A-Z]/.test(clean)) continue;

    return clean.length > 150 ? clean.slice(0, 148).trimEnd() + "…" : clean;
  }
  return null;
}
