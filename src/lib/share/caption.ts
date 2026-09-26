/**
 * Reading a TikTok caption for the place it is about.
 *
 * A share from TikTok hands Roam a bare short link. TikTok's oEmbed returns
 * the caption, and roughly one caption in four names somewhere pinnable
 * ("Florence hole in the wall 🍹 Babae Firenze📍"). Claude pulls the name out;
 * Google finds it. The result is only ever offered as the first row of the
 * search — nothing is saved on a guess.
 *
 * Measured on Brennan's 21 saved TikToks (26 Sep 2026): 6 named a place or
 * town, 6 returned a caption with no single place (a recipe, football, "five
 * day trips"), 9 returned no caption at all.
 */

/** A short or full TikTok link. Instagram gives apps no caption, so it isn't one. */
export function isTikTok(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return /^(vt|vm|www|m)\.tiktok\.com$/.test(host) || host === "tiktok.com";
  } catch {
    return false;
  }
}

/** Hashtags carry place names too (#babaefirenze), but a wall of them is
 *  noise; keep the first eight and cap the whole thing so a long recipe
 *  caption doesn't become a long prompt. */
export function trimCaption(caption: string): string {
  let tags = 0;
  const kept = caption
    .split(/\s+/)
    .filter((w) => !w.startsWith("#") || ++tags <= 8)
    .join(" ")
    .trim();
  return kept.slice(0, 600);
}

export interface PlaceGuess {
  /** What to hand Google: "Babae, Florence". */
  query: string;
}

/**
 * Claude's answer → a Google query, or null. Claude is asked for JSON
 * `{"name": string|null, "near": string|null}`; anything else, or a name that
 * is really a country or a generic word, is treated as no guess.
 */
export function parseGuess(text: string): PlaceGuess | null {
  const raw = text.trim();
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  let o: unknown;
  try {
    o = JSON.parse(json);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const name = clean((o as Record<string, unknown>).name);
  const near = clean((o as Record<string, unknown>).near);
  if (!name || TOO_BROAD.has(name.toLowerCase())) return null;
  return { query: near && near.toLowerCase() !== name.toLowerCase() ? `${name}, ${near}` : name };
}

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s.length >= 2 && s.length <= 80 ? s : null;
}

// Answers that would put a pin in the middle of a country.
const TOO_BROAD = new Set(["italy", "tuscany", "europe", "japan", "usa", "united states", "france", "spain", "greece", "mexico", "canada"]);
