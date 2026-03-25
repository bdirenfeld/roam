import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const placeId      = searchParams.get("place_id");
  const sessiontoken = searchParams.get("sessiontoken");

  if (!placeId) {
    return NextResponse.json({ error: "place_id is required" }, { status: 400 });
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "GOOGLE_PLACES_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set(
    "fields",
    "name,formatted_address,geometry,website,formatted_phone_number,url",
  );
  url.searchParams.set("key", key);
  if (sessiontoken) url.searchParams.set("sessiontoken", sessiontoken);

  try {
    const res  = await fetch(url.toString(), { next: { revalidate: 0 } });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch place details" }, { status: 502 });
  }
}
