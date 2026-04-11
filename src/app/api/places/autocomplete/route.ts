import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const input        = searchParams.get("input");
  const sessiontoken = searchParams.get("sessiontoken");
  const types        = searchParams.get("types");
  const lat          = searchParams.get("lat");
  const lng          = searchParams.get("lng");

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
    const res  = await fetch(url.toString(), { next: { revalidate: 0 } });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch autocomplete" }, { status: 502 });
  }
}
