import { km } from "@/lib/plan/dayGroups";

/**
 * How far a Find result is from where you sleep (1 Oct 2026). Sandra, a
 * tester, searching for dinner: "I wish I could see how far the place is from
 * the hotel". Straight-line, so it costs nothing and needs no route: close
 * enough to walk reads as minutes on foot (a 25% detour at 4.8 km/h), further
 * reads as kilometres, which is honest without a road route behind it.
 */

export const WALK_KM = 1.5;

export function distanceLine(from: { lat: number; lng: number }, to: { lat: number; lng: number }, place: string): string {
  const d = km(from, to);
  if (d <= WALK_KM) return `${Math.max(1, Math.round(d * 1.25 / 4.8 * 60))} min walk from ${place}`;
  return `${d < 10 ? d.toFixed(1) : Math.round(d)} km from ${place}`;
}
