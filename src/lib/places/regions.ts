/**
 * Destinations bigger than a country (27 Sep 2026). Google's (regions)
 * autocomplete knows countries and provinces, not continents: "Europe" offered
 * only Europe, a hamlet in Brescia — and picking it centres the map, the
 * weather and the flight estimate on a village. A two-month family summer
 * across four countries starts here, so Roam names the big ones itself.
 * Once places are on a day, the day searches its own town (lib/places/dayArea).
 */

export interface Region { name: string; lat: number; lng: number; aliases?: string[] }

export const REGIONS: Region[] = [
  { name: "Europe", lat: 48.5, lng: 9.0 },
  { name: "Western Europe", lat: 47.5, lng: 4.5 },
  { name: "Eastern Europe", lat: 50.0, lng: 22.0 },
  { name: "Scandinavia", lat: 61.5, lng: 13.0, aliases: ["nordics", "nordic countries"] },
  { name: "The Balkans", lat: 43.0, lng: 20.0, aliases: ["balkans"] },
  { name: "The Mediterranean", lat: 39.5, lng: 12.0, aliases: ["mediterranean"] },
  { name: "The British Isles", lat: 54.0, lng: -4.0, aliases: ["british isles"] },
  { name: "The Alps", lat: 46.5, lng: 10.0, aliases: ["alps"] },
  { name: "Southeast Asia", lat: 10.0, lng: 106.0, aliases: ["south east asia", "se asia"] },
  { name: "East Asia", lat: 35.0, lng: 120.0 },
  { name: "Asia", lat: 30.0, lng: 100.0 },
  { name: "The Middle East", lat: 27.0, lng: 45.0, aliases: ["middle east"] },
  { name: "Africa", lat: 2.0, lng: 20.0 },
  { name: "East Africa", lat: -3.0, lng: 36.0 },
  { name: "Southern Africa", lat: -25.0, lng: 25.0 },
  { name: "North America", lat: 45.0, lng: -100.0 },
  { name: "Central America", lat: 13.0, lng: -86.0 },
  { name: "The Caribbean", lat: 18.0, lng: -70.0, aliases: ["caribbean"] },
  { name: "South America", lat: -15.0, lng: -60.0 },
  { name: "Patagonia", lat: -46.0, lng: -70.0 },
  { name: "Oceania", lat: -25.0, lng: 140.0 },
  { name: "The South Pacific", lat: -17.0, lng: -170.0, aliases: ["south pacific"] },
];

const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, "").trim();

/** Regions whose name (or alias) starts with what was typed, from two letters. */
export function matchRegions(input: string, limit = 2): Region[] {
  const q = norm(input);
  if (q.length < 2) return [];
  return REGIONS.filter((r) => [r.name, ...(r.aliases ?? [])].some((n) => norm(n).startsWith(q))).slice(0, limit);
}
