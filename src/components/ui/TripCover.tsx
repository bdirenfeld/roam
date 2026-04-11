interface Props {
  destination: string;
  coverImageUrl?: string | null;
  lat?: number | null;
  lng?: number | null;
  className?: string;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function TripCover({ destination, coverImageUrl, lat, lng, className = "" }: Props) {

  if (coverImageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={coverImageUrl}
        alt={destination}
        className={`object-cover ${className}`}
      />
    );
  }

  // Mapbox satellite fallback when coordinates are available
  if (MAPBOX_TOKEN && lat != null && lng != null) {
    const mapUrl =
      `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/` +
      `${lng},${lat},13,0/800x400@2x?access_token=${MAPBOX_TOKEN}`;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={mapUrl}
        alt={destination}
        className={`object-cover ${className}`}
      />
    );
  }

  // Silent parchment placeholder — no text
  return (
    <div
      className={`${className}`}
      style={{ background: "#E8E3DA" }}
    />
  );
}
