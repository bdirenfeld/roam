import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const photoRef = searchParams.get("photo_reference");
  const maxWidth = searchParams.get("maxwidth") ?? "800";

  if (!photoRef) {
    return NextResponse.json({ error: "photo_reference is required" }, { status: 400 });
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "GOOGLE_PLACES_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/photo");
  url.searchParams.set("photoreference", photoRef);
  url.searchParams.set("maxwidth", maxWidth);
  url.searchParams.set("key", key);

  try {
    const res = await fetch(url.toString(), { redirect: "manual" });
    const location = res.headers.get("location");
    if (location) {
      return NextResponse.json({ url: location });
    }
    return NextResponse.json({ error: "No redirect from Places photo API" }, { status: 502 });
  } catch {
    return NextResponse.json({ error: "Failed to fetch photo" }, { status: 502 });
  }
}
