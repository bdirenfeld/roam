/**
 * A place shared from Google Maps (7 Oct 2026).
 *
 * Android's Maps → Share → Roam opens /share like a TikTok does, and the place
 * it carries is offered as the first row, the same as the TikTok caption guess,
 * so nobody retypes a name Maps already knows. Maps sends one of two shapes:
 *
 *   a) text = "Place name\nAddress line\nhttps://maps.app.goo.gl/…"
 *      (sometimes title = the place name as well)
 *   b) the link alone — maps.app.goo.gl/… or google.com/maps/place/<Name>/@lat,lng…
 *
 * (a) is read here and handed to Google Find Place as "name, address". (b) is
 * followed server-side (headers only, three hops at most) to the full place
 * URL, whose path names the place and whose data carries its pin; Find Place
 * is then biased to that pin. Anything unexpected — Google's consent or
 * "unusual traffic" page, a 200 where a redirect should be — is no suggestion;
 * the search box still works. One real share from Brennan's phone is still
 * owed to confirm which shape his Maps sends.
 */

const LINK = /https?:\/\/[^\s<>"']+/gi;

function parse(url: string | null | undefined): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** google.com, google.it, google.co.uk … */
const GOOGLE = /^(www\.|maps\.)?google\.(com|[a-z]{2}|com?\.[a-z]{2})$/;

function isShortHost(u: URL): boolean {
  const host = u.hostname.toLowerCase();
  return host === "maps.app.goo.gl" || (host === "goo.gl" && u.pathname.startsWith("/maps"));
}

/** A Maps short link or a Google Maps page (not Search, not Photos). */
export function isGoogleMapsUrl(url: string | null | undefined): boolean {
  const u = parse(url);
  if (!u) return false;
  if (isShortHost(u)) return true;
  const host = u.hostname.toLowerCase();
  if (!GOOGLE.test(host)) return false;
  return host.startsWith("maps.") || u.pathname.startsWith("/maps");
}

function isBlockPage(u: URL): boolean {
  const host = u.hostname.toLowerCase();
  return host === "consent.google.com" || host === "accounts.google.com" || u.pathname.startsWith("/sorry");
}

/** Lines Maps adds that are not a place name. */
const NOT_A_NAME = /^(dropped pin|shared (from|via) google maps|google maps)$/i;

export interface MapsShare {
  /** The Maps link, as shared. */
  link: string;
  name: string | null;
  address: string | null;
  /** What to show and carry for the share: the words, never the raw link. */
  caption: string | null;
}

/** The Web Share Target's title / text / url for a Maps share, or null when it
 *  is not one. Some apps put the link in `text` rather than `url`. */
export function readMapsShare(
  title: string | null | undefined,
  text: string | null | undefined,
  url: string | null | undefined,
): MapsShare | null {
  const links = [url, text, title]
    .flatMap((s) => (s ? s.match(LINK) ?? [] : []))
    .map((l) => l.replace(/[).,!?]+$/, ""));
  const link = links.find((l) => isGoogleMapsUrl(l));
  if (!link) return null;

  const lines: string[] = [];
  for (const s of [title, text]) {
    if (!s) continue;
    for (const raw of s.replace(LINK, "").split(/\r?\n/)) {
      const line = raw.replace(/\s+/g, " ").trim().replace(/[:\-–·]+$/, "").trim();
      if (!line || NOT_A_NAME.test(line)) continue;
      if (lines.some((l) => l.toLowerCase() === line.toLowerCase())) continue;
      lines.push(line);
    }
  }
  return {
    link,
    name: lines[0] ?? null,
    address: lines[1] ?? null,
    caption: lines.length ? lines.join("\n") : null,
  };
}

export interface MapsPlace {
  name: string | null;
  lat: number | null;
  lng: number | null;
}

const COORDS = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

function coords(lat: string, lng: string): { lat: number; lng: number } | null {
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lng: b } : null;
}

/**
 * The place a full Google Maps URL points at: the name from /place/<Name>/
 * (or ?q= / ?query=) and the pin from !3d…!4d… (the place itself), else
 * @lat,lng (where the map was centred), else a coordinate ?q=. Null for a
 * short link, a consent page, or a URL that names nothing.
 */
export function placeFromMapsUrl(url: string | null | undefined): MapsPlace | null {
  const u = parse(url);
  if (!u || isShortHost(u) || isBlockPage(u) || !isGoogleMapsUrl(url)) return null;

  let name: string | null = null;
  let pin: { lat: number; lng: number } | null = null;

  const seg = u.pathname.match(/\/maps\/place\/([^/]+)/)?.[1];
  if (seg) {
    try {
      name = decodeURIComponent(seg.replace(/\+/g, " "));
    } catch {
      return null; // broken encoding: unexpected, so nothing
    }
  }
  const q = u.searchParams.get("q") ?? u.searchParams.get("query");
  if (q) {
    const m = q.match(COORDS);
    if (m) pin = coords(m[1]!, m[2]!);
    else if (!name) name = q;
  }

  const full = u.pathname + u.search;
  const d = full.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const at = u.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  pin = (d && coords(d[1]!, d[2]!)) || (at && coords(at[1]!, at[2]!)) || pin;

  name = name ? name.replace(/\s+/g, " ").trim() || null : null;
  if (name && COORDS.test(name)) name = null;
  if (!name && !pin) return null;
  return { name, lat: pin?.lat ?? null, lng: pin?.lng ?? null };
}

const UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Follow a Maps short link to the full place URL: `redirect: "manual"`, three
 * hops at most, 5 s in all, no body read. Null on a consent / "unusual
 * traffic" page, a redirect off Google Maps, a non-redirect answer, or a
 * timeout.
 */
export async function resolveMapsLink(url: string, fetcher: Fetcher = fetch, timeoutMs = 5000): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let cur = url;
    for (let hop = 0; ; hop++) {
      const u = parse(cur);
      if (!u || isBlockPage(u) || !isGoogleMapsUrl(cur)) return null;
      if (placeFromMapsUrl(cur)) return cur;
      if (hop >= 3) return null;
      const res = await Promise.race([
        fetcher(cur, { redirect: "manual", headers: { "User-Agent": UA }, signal: ctrl.signal }),
        new Promise<null>((r) => ctrl.signal.addEventListener("abort", () => r(null))),
      ]);
      if (!res) return null;
      try { await res.body?.cancel(); } catch { /* nothing to drop */ }
      const loc = res.headers.get("location");
      if (res.status < 300 || res.status >= 400 || !loc) return null;
      cur = new URL(loc, cur).toString();
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** "BABAE, Via Santo Spirito, 21r, Firenze" — what Find Place is asked. */
export function mapsQuery(name: string | null | undefined, address: string | null | undefined): string | null {
  const q = [name, address].map((s) => s?.trim()).filter(Boolean).join(", ");
  return q ? q.slice(0, 200) : null;
}

/** Google Find Place from text — the one call both share suggestions make. */
export function findPlaceUrl(input: string, key: string, bias?: { lat: number; lng: number } | null): string {
  const u = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
  u.searchParams.set("input", input);
  u.searchParams.set("inputtype", "textquery");
  u.searchParams.set("fields", "place_id,name,formatted_address");
  if (bias) u.searchParams.set("locationbias", `point:${bias.lat},${bias.lng}`);
  u.searchParams.set("key", key);
  return u.toString();
}

/** The link and caption /share works from, given the Web Share Target's
 *  title / text / url. Some apps put the link in `text` rather than `url`. A
 *  Maps share's link is the Maps link, and its caption is the name and
 *  address without the raw URL; anything else is passed through as before. */
export function shareLinkAndCaption(
  title: string | null | undefined,
  text: string | null | undefined,
  url: string | null | undefined,
): { link: string | null; caption: string | null } {
  const maps = readMapsShare(title, text, url);
  if (maps) return { link: maps.link, caption: maps.caption };
  const link = url || text?.match(/https?:\/\/\S+/)?.[0] || null;
  return { link, caption: title || (text && text !== link ? text : null) || null };
}
