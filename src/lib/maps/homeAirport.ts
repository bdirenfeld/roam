import type { Card } from "@/types/database";

// A flight card pinned at the user's home airport. Used to exclude the
// home-airport pin from map fit-bounds so the map zooms to the destination
// cluster instead of stretching across continents. The pin itself still
// renders — only bounds calculation is affected.
//
// A single flight card carries BOTH endpoints in details, so the home
// airport may appear as either side regardless of sub_type direction
// (e.g. arrival-to-NYC still has origin_airport === YYZ). Production
// writes use `origin_airport` + `arriving_at`.
export function isHomeAirportCard(card: Card, homeAirport: string | null): boolean {
  if (!homeAirport) return false;
  const sub = card.place?.sub_type;
  if (sub !== "flight_arrival" && sub !== "flight_departure") return false;
  const d = card.details as { origin_airport?: string; arriving_at?: string };
  return d.origin_airport === homeAirport || d.arriving_at === homeAirport;
}
