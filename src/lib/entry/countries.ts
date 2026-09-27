/**
 * The countries a journey goes to (27 Sep 2026). The entry check asked about
 * one country — the last word of the destination — so a summer through
 * London, Paris, Tuscany and Barcelona was checked for "Europe", or for Spain
 * alone, and the UK's ETA never came up. The places on the journey say where
 * it goes; a city destination counts too, a region (Europe) does not.
 */
import { REGIONS } from "@/lib/places/regions";

const ALIAS: Record<string, string> = {
  uk: "United Kingdom", "u.k.": "United Kingdom", "great britain": "United Kingdom", england: "United Kingdom", scotland: "United Kingdom", wales: "United Kingdom",
  usa: "United States", "u.s.a.": "United States", us: "United States", "united states of america": "United States",
};
function countryPart(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last || /\d/.test(last)) return null;
  return ALIAS[last.toLowerCase()] ?? last;
}

export function tripCountries(destination: string | null | undefined, addresses: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const add = (c: string | null) => { if (c && !out.includes(c)) out.push(c); };
  const isRegion = !!destination && REGIONS.some((r) => r.name === destination);
  if (!isRegion && destination) add(countryPart(destination.includes(",") ? destination : `x, ${destination}`));
  for (const a of addresses) add(countryPart(a));
  return out;
}

/**
 * Nothing to enter at home (27 Sep 2026): a Muskoka or Niagara weekend showed
 * an entry line and a toast on its first add. Canadian passports are the
 * default, so a journey only in Canada is not checked.
 */
export const HOME_COUNTRY = "Canada";
export function needsEntryCheck(countries: string[]): boolean {
  return countries.some((c) => c !== HOME_COUNTRY);
}

const EUROPE = ["United Kingdom", "Ireland", "France", "Spain", "Portugal", "Italy", "Germany", "Netherlands", "Belgium", "Luxembourg", "Switzerland", "Austria", "Denmark", "Sweden", "Norway", "Finland", "Iceland", "Czechia", "Czech Republic", "Poland", "Hungary", "Croatia", "Slovenia", "Greece", "Malta", "Monaco", "Montenegro", "Estonia", "Latvia", "Lithuania", "Slovakia", "Romania", "Bulgaria", "Albania", "Cyprus"];
const EUROPE_REGIONS = new Set(["Europe", "Western Europe", "Eastern Europe", "Scandinavia", "The Balkans", "The Mediterranean", "The British Isles", "The Alps"]);

/**
 * The countries a search on this journey should prefer (27 Sep 2026): the
 * ones it goes to, and a Europe region's countries before it has places.
 * "Sagrada Familia Basilica" on a Europe summer came back as a church in
 * Goiânia, Brazil.
 */
export function searchCountries(destination: string | null | undefined, addresses: (string | null | undefined)[]): string[] {
  const own = tripCountries(destination, addresses);
  return destination && EUROPE_REGIONS.has(destination) ? Array.from(new Set([...own, ...EUROPE])) : own;
}

/** Results in the preferred countries first, the rest after, each in Google's order. */
export function preferCountries<T extends { description?: string }>(preds: T[], countries: string[]): T[] {
  if (!countries.length) return preds;
  const want = new Set(countries);
  const hit = (p: T) => { const c = countryPart(p.description); return !!c && want.has(c); };
  return [...preds.filter(hit), ...preds.filter((p) => !hit(p))];
}
