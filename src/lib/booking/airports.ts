/**
 * The airports a journey flies into, for Kayak (6 Oct 2026). Kayak's flight
 * search drops a town from the route without a word, so the To book row needs
 * IATA codes. A journey's own flight cards give them when they carry codes;
 * otherwise Claude Haiku is asked once per destination, ever, and the answer
 * is kept in find_cache under airportsKey (an airport does not move).
 */

import { isIata } from "./kayak";

export const AIRPORTS_MODEL = "claude-haiku-4-5-20251001";

export function airportsKey(destination: string): string {
  return `airports|${destination.trim().toLowerCase()}`;
}

export function airportsPrompt(destination: string, lat: number | null, lng: number | null): string {
  const where = lat != null && lng != null ? `${destination} (${lat.toFixed(4)}, ${lng.toFixed(4)})` : destination;
  return [
    `Travellers going to ${where}: which 1 to 3 airports with scheduled international or commercial flights do they normally fly into? Nearest first.`,
    `Answer with JSON only, IATA codes only, like {"airports":["PSA","FLR"]}. No other text.`,
  ].join("\n");
}

/** Codes out of Claude's answer: exactly three capital letters each, at most three, no repeats. */
export function parseAirports(text: string): string[] {
  const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) return [];
  let raw: unknown;
  try { raw = JSON.parse(m[0]); } catch { return []; }
  const list = Array.isArray(raw) ? raw : (raw as { airports?: unknown })?.airports;
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const c of list) {
    const s = typeof c === "string" ? c.trim() : c;
    if (isIata(s) && !out.includes(s)) out.push(s);
  }
  return out.slice(0, 3);
}
