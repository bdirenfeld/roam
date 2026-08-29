// ── Google Places lookup, shared ──────────────────────────────────────────
// Lifted out of components/trips/YearView.tsx: the Year View and the Ideas
// screen both resolve a typed name to real coordinates, and both must go
// through the app's own /api/places/* routes.

// ── Place search — the app's Google Places routes ─────────────────────────
// Open-Meteo's geocoder is city-only and answers "Tuscany" with a suburb in
// Alberta, so both pickers here go through /api/places/*, unrestricted (no
// `types` filter) so a region, a city or a single resort all resolve.
export interface Prediction {
  place_id: string;
  description: string;
  structured_formatting?: { main_text: string; secondary_text?: string };
}

export interface ResolvedPlace {
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** Google's id. `places` upserts on (user_id, google_place_id), so pinning a
   *  place to a journey needs it — a wishlist destination does not. */
  placeId: string;
  /** Google's category list, used to guess type/sub_type when pinning so the
   *  card doesn't land as a generic activity. Empty when Google gives none. */
  types: string[];
}

export async function fetchPredictions(input: string, token: string): Promise<Prediction[]> {
  const params = new URLSearchParams({ input, sessiontoken: token });
  const res = await fetch(`/api/places/autocomplete?${params}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { predictions?: Prediction[] };
  return (data.predictions ?? []).slice(0, 6);
}

export async function fetchPlaceDetails(placeId: string, token: string): Promise<ResolvedPlace | null> {
  const res = await fetch(
    `/api/places/details?place_id=${encodeURIComponent(placeId)}&sessiontoken=${encodeURIComponent(token)}`
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    result?: {
      name?: string;
      formatted_address?: string;
      types?: string[];
      geometry?: { location?: { lat: number; lng: number } };
    };
  };
  const loc = data.result?.geometry?.location;
  if (!data.result || !loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") {
    return null;
  }
  return {
    placeId,
    types: data.result.types ?? [],
    name: data.result.name ?? "",
    address: data.result.formatted_address ?? "",
    lat: loc.lat,
    lng: loc.lng,
  };
}

// The label under the chip / on the row — Google's main_text when present
export const predMain = (p: Prediction) =>
  p.structured_formatting?.main_text ?? p.description.split(",")[0];

export const predSecondary = (p: Prediction) => {
  const s = p.structured_formatting?.secondary_text;
  if (s) return s;
  const rest = p.description.split(",").slice(1).join(",").trim();
  return rest || null;
};
