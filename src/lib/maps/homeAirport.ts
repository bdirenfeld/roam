import type { Card } from "@/types/database";

// A flight card pinned at the user's home airport. Used to exclude the
// home-airport pin from map fit-bounds so the map zooms to the destination
// cluster instead of stretching across continents. The pin itself still
// renders — only bounds calculation is affected.
//
// A flight_arrival card BACK to home has details.arrival_airport === home.
// A flight_departure card FROM home has details.departure_airport === home.
export function isHomeAirportCard(card: Card, homeAirport: string | null): boolean {
  if (!homeAirport) return false;
  const sub = card.place?.sub_type;
  if (sub === "flight_arrival") {
    return (card.details as { arrival_airport?: string }).arrival_airport === homeAirport;
  }
  if (sub === "flight_departure") {
    return (card.details as { departure_airport?: string }).departure_airport === homeAirport;
  }
  return false;
}
