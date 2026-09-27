import { NextRequest, NextResponse } from "next/server";
import { requireUser, underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import { isCategorySearch } from "@/lib/places/searchIntent";
import { preferCountries } from "@/lib/entry/countries";

export async function GET(request: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  if (!(await underQuota(gate.supabase, "placeSearch", QUOTA.placeSearch))) return quotaExceeded("place search");

  const { searchParams } = request.nextUrl;
  const input        = searchParams.get("input");
  const sessiontoken = searchParams.get("sessiontoken");
  const types        = searchParams.get("types");
  const lat          = searchParams.get("lat");
  const lng          = searchParams.get("lng");
  // The journey's countries: their results lead (lib/entry/countries).
  const countries    = (searchParams.get("countries") ?? "").split("|").map((c) => c.trim()).filter(Boolean);

  if (!input?.trim()) {
    return NextResponse.json({ predictions: [] });
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "GOOGLE_PLACES_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", input);
  url.searchParams.set("key", key);
  if (sessiontoken) url.searchParams.set("sessiontoken", sessiontoken);
  if (types)        url.searchParams.set("types", types);
  if (lat && lng)   {
    url.searchParams.set("location", `${lat},${lng}`);
    url.searchParams.set("radius", "50000");
  }

  try {
    // "Day camp in Barcelona", "pizza", "playground near the flat": a search
    // for what is somewhere, not a name. Autocomplete only matches names and
    // answered with camps in New Jersey, so text search runs alongside and
    // leads (lib/places/searchIntent, 27 Sep 2026). Not for the destination
    // field, which asks for (regions).
    const text = !types && isCategorySearch(input) ? textSearch(input, key, lat, lng) : Promise.resolve([]);
    const [res, found] = await Promise.all([fetch(url.toString(), { next: { revalidate: 0 } }), text]);
    const data = await res.json() as { predictions?: { place_id: string }[] } & Record<string, unknown>;
    if (found.length) {
      const seen = new Set(found.map((p) => p.place_id));
      // Enough found where you are: the name matches from elsewhere (camps in
      // New Jersey under the Barcelona ones) only get in the way.
      data.predictions = found.length >= 3 ? found : [...found, ...(data.predictions ?? []).filter((p) => !seen.has(p.place_id))];
    }
    if (countries.length && Array.isArray(data.predictions)) data.predictions = preferCountries(data.predictions as { description?: string; place_id: string }[], countries);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch autocomplete" }, { status: 502 });
  }
}

async function textSearch(query: string, key: string, lat: string | null, lng: string | null) {
  const u = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  u.searchParams.set("query", query);
  u.searchParams.set("key", key);
  if (lat && lng) { u.searchParams.set("location", `${lat},${lng}`); u.searchParams.set("radius", "30000"); }
  try {
    const r = await fetch(u.toString(), { next: { revalidate: 0 } });
    const j = await r.json() as { results?: { place_id: string; name: string; formatted_address?: string }[] };
    return (j.results ?? []).slice(0, 5).map((x) => ({
      place_id: x.place_id,
      description: x.formatted_address ? `${x.name}, ${x.formatted_address}` : x.name,
      structured_formatting: { main_text: x.name, secondary_text: x.formatted_address ?? "" },
    }));
  } catch {
    return [];
  }
}
