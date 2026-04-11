import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get('placeId')
  const maxPhotos = parseInt(req.nextUrl.searchParams.get('maxPhotos') ?? '6')

  if (!placeId) return NextResponse.json({ photos: [] })

  const apiKey = process.env.GOOGLE_PLACES_API_KEY

  try {
    const detailsRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${apiKey}`
    )
    const details = await detailsRes.json()

    const photoRefs: string[] = (details.result?.photos ?? [])
      .slice(0, maxPhotos)
      .map((p: { photo_reference: string }) => p.photo_reference)

    if (photoRefs.length === 0) return NextResponse.json({ photos: [] })

    const photos = photoRefs.map(ref =>
      `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${ref}&key=${apiKey}`
    )

    return NextResponse.json({ photos })
  } catch {
    return NextResponse.json({ photos: [] })
  }
}
