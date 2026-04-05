import { NextRequest, NextResponse } from "next/server";

const COUNTRY_CURRENCY: Record<string, string> = {
  IT: "EUR", FR: "EUR", DE: "EUR", ES: "EUR", PT: "EUR",
  GB: "GBP", JP: "JPY", US: "USD", CA: "CAD", AU: "AUD",
  MX: "MXN", BR: "BRL", CH: "CHF", NO: "NOK", SE: "SEK",
  DK: "DKK", NZ: "NZD", SG: "SGD", HK: "HKD", TH: "THB",
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const placeId = searchParams.get("place_id");
  const lat     = searchParams.get("lat");
  const lng     = searchParams.get("lng");

  const result: { price_level: number | null; currency_code: string } = {
    price_level:   null,
    currency_code: "USD",
  };

  // ── price_level from Google Places Details ─────────────────────
  if (placeId) {
    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (key) {
      try {
        const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
        url.searchParams.set("place_id", placeId);
        url.searchParams.set("fields", "price_level");
        url.searchParams.set("key", key);
        const res  = await fetch(url.toString(), { next: { revalidate: 3600 } });
        const data = await res.json() as { result?: { price_level?: number } };
        if (data.result?.price_level != null) {
          result.price_level = data.result.price_level;
        }
      } catch {
        // non-critical — caller continues without price_level
      }
    }
  }

  // ── currency_code from Mapbox reverse geocode ──────────────────
  if (lat && lng) {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (token) {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=country&access_token=${token}`;
        const res  = await fetch(url, { next: { revalidate: 3600 } });
        const data = await res.json() as { features?: { properties?: { short_code?: string } }[] };
        const code = data.features?.[0]?.properties?.short_code?.toUpperCase();
        result.currency_code = COUNTRY_CURRENCY[code ?? ""] ?? "USD";
      } catch {
        // keep default USD
      }
    }
  }

  return NextResponse.json(result);
}
