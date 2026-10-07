/**
 * Directions links and the remembered app (6 Oct 2026, taps audit).
 *
 * Google opens straight on the route (`/maps/dir/`), not the place page —
 * the place page cost two more taps (Directions, Start). No travel mode is
 * forced: the old link said walking, and Google picks better than a
 * hard-coded guess. Waze is unchanged.
 */

export type DirectionsApp = "google" | "waze";

export interface DirectionsTarget {
  placeName: string;
  /** Google place id, when the place has one. */
  placeId?: string | null;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
}

export function googleDirectionsUrl(t: DirectionsTarget): string | null {
  const hasLatLng = t.lat != null && t.lng != null;
  const destination = hasLatLng
    ? `${t.lat},${t.lng}`
    : t.address
    ? encodeURIComponent(t.address)
    : t.placeId
    ? encodeURIComponent(t.placeName)
    : null;
  if (!destination) return null;
  const pid = t.placeId ? `&destination_place_id=${encodeURIComponent(t.placeId)}` : "";
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}${pid}`;
}

export function wazeDirectionsUrl(t: DirectionsTarget): string | null {
  if (t.lat != null && t.lng != null) return `https://waze.com/ul?ll=${t.lat},${t.lng}&navigate=yes`;
  if (t.placeId) return `https://waze.com/ul?q=${encodeURIComponent(t.placeName)}&navigate=yes`;
  return null;
}

export function directionsUrl(app: DirectionsApp, t: DirectionsTarget): string | null {
  return app === "google" ? googleDirectionsUrl(t) : wazeDirectionsUrl(t);
}

export function otherApp(app: DirectionsApp): DirectionsApp {
  return app === "google" ? "waze" : "google";
}

export const DIRECTIONS_APP_KEY = "roam:directions-app";

/** The remembered app, or null. Read in an effect or handler, never in render. */
export function readDirectionsApp(): DirectionsApp | null {
  try {
    const v = window.localStorage.getItem(DIRECTIONS_APP_KEY);
    return v === "google" || v === "waze" ? v : null;
  } catch {
    return null;
  }
}

export function writeDirectionsApp(app: DirectionsApp | null): void {
  try {
    if (app) window.localStorage.setItem(DIRECTIONS_APP_KEY, app);
    else window.localStorage.removeItem(DIRECTIONS_APP_KEY);
  } catch {
    /* private window or blocked storage: the chooser simply keeps asking */
  }
}
