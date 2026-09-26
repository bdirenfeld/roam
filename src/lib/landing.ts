import { groupTrips, type SwitcherTrip } from "./tripSwitcher";

/**
 * Where a signed-in visitor lands when they open Roam (26 Sep 2026). On a
 * computer: straight into the next journey — the one under way, else the
 * soonest upcoming — the way a search engine opens on its search box. With no
 * upcoming journey, the Journeys list. The phone keeps its Journeys home.
 */
export function landingTripId(trips: SwitcherTrip[], today: string): string | null {
  return groupTrips(trips, today).upcoming[0]?.id ?? null;
}

/** A phone, by the client hint when the browser sends one, else the user agent. */
export function isPhone(userAgent: string | null, chMobile: string | null): boolean {
  if (chMobile === "?1") return true;
  if (chMobile === "?0") return false;
  return /Mobi|iPhone|iPod|Android.*Mobile/i.test(userAgent ?? "");
}
