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
