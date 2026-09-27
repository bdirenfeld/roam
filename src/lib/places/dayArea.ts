/**
 * Where a day is, for biasing its search (27 Sep 2026). A journey has one
 * destination, but a cruise, a road trip or a summer across Europe does not:
 * every day of a Mediterranean cruise searched "Barcelona, Spain", the Rome day
 * included. The day's own places say where it is; the journey's destination is
 * the fallback for an empty day.
 */

export interface AreaPlace {
  lat: number | null;
  lng: number | null;
  address: string | null;
  sub_type: string | null;
}
export interface Area { label: string | null; lat: number | null; lng: number | null }

/**
 * The town in a Google formatted address: the part carrying the postcode, with
 * the postcode and any short region code taken off ("00184 Roma RM" → Roma,
 * "London SW1A 1AA" → London). In North America the postcode part is only the
 * state or province ("TN 37203"), so the part before it is the town.
 */
export function townOf(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const clean = (p: string) =>
    p.split(/\s+/).filter((w) => !/\d/.test(w)).join(" ").replace(/(\s+[A-Z]{1,3})+$/, "").replace(/^[A-Z]{1,3}$/, "").trim();
  for (let i = parts.length - 1; i >= 1; i--) {
    if (!/\d/.test(parts[i])) continue;
    const town = clean(parts[i]);
    if (town) return town;
    const before = clean(parts[i - 1]);
    return before || null;
  }
  return parts.length >= 3 ? clean(parts[parts.length - 2]) || null : null;
}

/**
 * The day's area: its first place that is somewhere you spend the day, not an
 * airport or a station or a port (those sit outside town — Civitavecchia is
 * 62 km from the Colosseum). Falls back to any located place, then the journey.
 */
export function dayArea(places: AreaPlace[], fallback: Area): Area {
  const located = places.filter((p) => p.lat != null && p.lng != null);
  const hub = (p: AreaPlace) => p.sub_type === "transit" || (p.sub_type ?? "").startsWith("flight");
  const pick = located.find((p) => !hub(p)) ?? located[0];
  if (!pick) return fallback;
  return { label: townOf(pick.address) ?? fallback.label, lat: pick.lat, lng: pick.lng };
}
