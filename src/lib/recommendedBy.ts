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

/** True when someone is named as recommending it. The map filters' "Recommended" pill reads this. */
export function isRecommended(details: unknown): boolean {
  return readRecommendedBy(details) !== null;
}

/**
 * The page that made you want to go, when the card has one (16 Nov 2026): the
 * TikTok, the article. A Google Maps link is not it — the add sheet saves one on
 * every map pick, and the address already does directions — so those don't count.
 */
export function recommendedLink(sourceUrl: string | null | undefined): { url: string; host: string } | null {
  if (!sourceUrl) return null;
  let u: URL;
  try { u = new URL(sourceUrl); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\./, "").replace(/^(vt|vm|m)\.(?=tiktok\.com$)/, "");
  const isMaps = /(^|\.)maps\.google\.[a-z.]+$/.test(u.hostname) || (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname.startsWith("/maps"))
    || u.hostname === "maps.app.goo.gl" || (u.hostname === "goo.gl" && u.pathname.startsWith("/maps"));
  return isMaps ? null : { url: sourceUrl, host };
}

/** Two links on the same site (www. ignored): a card's saved page and the place's website (16 Nov 2026). */
export function sameSite(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  try {
    const h = (u: string) => new URL(u).hostname.replace(/^www\./, "");
    return h(a) === h(b);
  } catch { return false; }
}

/** The one phrasing: "via Gorav". */
export function recommendedByLine(name: string): string {
  return `via ${name}`;
}
