// ── A listing he found himself ────────────────────────────────────────────
//
// The search can only compare what Google Hotels hands it: about eighteen
// places a page, no Airbnb at all, nothing whose calendar is not open. The
// villa he actually chose for Tuscany came from Vrbo, off-app, so the app's
// list was a second, weaker list (15 Sept 2026). This is the bridge: paste
// the link, and the place joins the list priced and driven like the rest.
//
// What a page gives a server is thin. Probed 15 Sept 2026: Vrbo returns a
// title and a photo and no coordinates; Booking answers a bot wall; Airbnb a
// 3 KB shell. So the page is asked only for its title, best effort, and the
// price is what he saw — nobody's API has a rate for the dates he typed in
// on the site. Google Places then locates the name near the base.

/** vrbo | airbnb | booking | expedia | direct — from the link itself. */
export function siteOf(url: string): string {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { host = url.toLowerCase(); }
  const is = (name: string) => host === name || host.endsWith("." + name);
  if (is("vrbo.com") || host.startsWith("www.vrbo.")) return "vrbo";
  if (host.includes("airbnb.")) return "airbnb";
  if (is("booking.com")) return "booking";
  if (host.includes("expedia.") || is("hotels.com")) return "expedia";
  return "direct";
}

/** A pasted link, cleaned: tracking stripped, protocol required. Null when it is not a link. */
export function cleanUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = /https?:\/\/[^\s<>"']+/i.exec(text.trim());
  if (!m) return null;
  try {
    const u = new URL(m[0]);
    const keys: string[] = [];
    u.searchParams.forEach((_, k) => { keys.push(k); });
    for (const k of keys) {
      if (/^(utm_|mdpcid|aid|label|srpvid|from_|_ga|gclid|fbclid)/i.test(k)) u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * The listing's name out of a page title. Sites decorate it:
 *   "Carpinteria Beach Townhouse - Last minute summer discount! - Carpinteria | Vrbo"
 *   "Villa La Magnolia - Villas for Rent in Lucca, Toscana, Italy - Airbnb"
 * The name is what comes before the site's own suffix; a trailing " - Town"
 * is the locality, which is worth keeping as a hint for the geocoder.
 */
export function nameFromTitle(title: string | null | undefined): { name: string | null; locality: string | null } {
  if (!title) return { name: null, locality: null };
  let t = title.replace(/\s+/g, " ").trim();
  t = t.replace(/\s*[|–-]\s*(Vrbo|Airbnb|Booking\.com|Expedia(\.ca|\.com)?|Hotels\.com)\s*$/i, "");
  t = t.replace(/\s*-\s*(Villas|Houses|Homes|Apartments|Condos|Cabins|Rooms|Hotels?)\s+for\s+Rent\s+in\s+.+$/i, "");
  const parts = t.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    // A short final part with no punctuation reads as a town, not a pitch.
    if (last.length <= 40 && !/[!?.,]/.test(last)) return { name: parts.slice(0, -1).join(" - "), locality: last };
  }
  return { name: t || null, locality: null };
}

/**
 * How precisely the row was placed. A private rental is not a Google place —
 * "Carpinteria Beach Townhouse" found nothing on 15 Sept 2026 — so the town
 * the title names is the next best, and the base's own centre after that.
 * Town-level is how the Tuscany villas were compared anyway; the row says so
 * rather than pretending the drive times are exact.
 */
export type Placement = "exact" | "town" | "centre";

export function placementNote(placed: Placement, label: string | null): string | null {
  if (placed === "exact") return null;
  if (placed === "town") return `Placed at ${label ?? "the town"}, not the exact address`;
  return `Placed at the centre of ${label ?? "the base"} — add the town to the name for real drive times`;
}

/** The price he typed: a total for the stay, or a nightly rate with "a night". */
export function parsePastedPrice(text: string | null | undefined, nights: number): { total: number | null; nightly: number | null } {
  if (!text) return { total: null, nightly: null };
  const m = /(\d[\d,]*(?:\.\d+)?)/.exec(text.replace(/\s/g, ""));
  if (!m) return { total: null, nightly: null };
  const v = Number(m[1].replace(/,/g, ""));
  if (!isFinite(v) || v <= 0) return { total: null, nightly: null };
  const perNight = /\b(a|per|each)?\s*night\b|\/\s*n(ight)?\b/i.test(text);
  if (perNight) return { total: nights > 0 ? Math.round(v * nights) : null, nightly: Math.round(v) };
  return { total: Math.round(v), nightly: nights > 0 ? Math.round(v / nights) : null };
}
