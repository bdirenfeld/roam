const FIELDS = [
  "name",
  "formatted_address",
  "formatted_phone_number",
  "website",
  "rating",
  "photos",
  "geometry",
  "opening_hours",
  "price_level",
  "types",
].join(",");

export type FetchDetailsFailure =
  | "google_places_404"
  | "google_places_rate_limit"
  | "google_places_error";

export type FetchDetailsResult =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; reason: FetchDetailsFailure; detail?: string };

export async function fetchPlaceDetails(
  googlePlaceId: string,
  apiKey: string,
): Promise<FetchDetailsResult> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", googlePlaceId);
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("key", apiKey);

  let res: Response;
  try {
    res = await fetch(url.toString(), { next: { revalidate: 0 } });
  } catch (err) {
    return { ok: false, reason: "google_places_error", detail: (err as Error).message };
  }

  if (res.status === 429) return { ok: false, reason: "google_places_rate_limit" };
  if (!res.ok)            return { ok: false, reason: "google_places_error", detail: `HTTP ${res.status}` };

  const data = (await res.json()) as {
    status?: string;
    result?: Record<string, unknown>;
    error_message?: string;
  };

  if (data.status === "OK" && data.result)                                return { ok: true, result: data.result };
  if (data.status === "NOT_FOUND" || data.status === "ZERO_RESULTS")      return { ok: false, reason: "google_places_404" };
  if (data.status === "OVER_QUERY_LIMIT")                                 return { ok: false, reason: "google_places_rate_limit" };
  return { ok: false, reason: "google_places_error", detail: data.error_message ?? data.status };
}
