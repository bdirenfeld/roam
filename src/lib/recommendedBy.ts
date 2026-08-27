// ── "Recommended by" ──────────────────────────────────────────────────────
// A person, not a rating. `details.recommended_by` is a free-text name written
// by the map's add flow, the pin popup, and the card sheet's own field; every
// surface reads it through here so the wording can't drift.
//
// The line is written "via Gorav" everywhere — chosen over "Gorav's rec"
// because it survives names ending in s and reads the same at 10px as at 14px.

/** Pull a usable recommender name off a card's `details`, or null. */
export function readRecommendedBy(details: unknown): string | null {
  if (typeof details !== "object" || details === null) return null;
  const raw = (details as { recommended_by?: unknown }).recommended_by;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** The one phrasing: "via Gorav". */
export function recommendedByLine(name: string): string {
  return `via ${name}`;
}
