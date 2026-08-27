// ── "Plan a journey" deep-link seed ───────────────────────────────────────
// `/trips/new?start=…&end=…&destName=…&destLat=…&destLng=…(&destLoc=…)` is a
// real, shared contract: YearView's open-window rows link to it, wishlist
// suggestions carry a destination on it, and people bookmark it.
//
// The parse/build pair lives here rather than in NewJourneyForm because every
// in-app trigger needs `buildNewJourneyHref` for its <Link href> — importing
// it from the form would pull the whole form into every route's bundle and
// defeat the lazy load in components/overlays/AppOverlays.tsx.

export interface NewJourneySeed {
  start?: string;
  end?: string;
  /** Display string for the destination field, e.g. "Niagara Falls, ON". */
  destDisplay?: string;
  destLat?: number;
  destLng?: number;
}

// A ?start=/&end= param is only trusted when it's a real ISO date — this
// rejects malformed strings and rolled-over dates like 2027-02-30.
function parseIsoParam(v: string | null): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
    ? v
    : null;
}

/**
 * Read a seed out of the query string. Garbage is ignored a group at a time —
 * invalid dates, or an end before its start, drop the dates but keep a valid
 * destination, and vice versa.
 *
 * Typed against `.get` alone so it accepts both `URLSearchParams` and Next's
 * `ReadonlyURLSearchParams`.
 */
export function parseNewJourneySeed(
  params: { get(name: string): string | null } | null | undefined,
): NewJourneySeed | null {
  if (!params) return null;
  const seed: NewJourneySeed = {};

  const start = parseIsoParam(params.get("start"));
  const end = parseIsoParam(params.get("end"));
  if (start && end && end >= start) {
    seed.start = start;
    seed.end = end;
  }

  // Note Number(null) and Number("") are both 0, hence the raw string guards
  // before coercion.
  const name = params.get("destName")?.trim();
  const latRaw = params.get("destLat");
  const lngRaw = params.get("destLng");
  if (name && latRaw && lngRaw) {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 && lat <= 90 &&
      lng >= -180 && lng <= 180
    ) {
      const loc = params.get("destLoc")?.trim();
      seed.destDisplay = loc || name;
      seed.destLat = lat;
      seed.destLng = lng;
    }
  }

  return Object.keys(seed).length > 0 ? seed : null;
}

/**
 * The inverse: the href an in-app trigger keeps on its `<Link>` so
 * ctrl/cmd-click still opens the real page.
 */
export function buildNewJourneyHref(seed?: NewJourneySeed | null): string {
  if (!seed) return "/trips/new";
  const q = new URLSearchParams();
  if (seed.start && seed.end) {
    q.set("start", seed.start);
    q.set("end", seed.end);
  }
  if (seed.destDisplay && seed.destLat != null && seed.destLng != null) {
    q.set("destName", seed.destDisplay);
    q.set("destLat", String(seed.destLat));
    q.set("destLng", String(seed.destLng));
  }
  const qs = q.toString();
  return qs ? `/trips/new?${qs}` : "/trips/new";
}
