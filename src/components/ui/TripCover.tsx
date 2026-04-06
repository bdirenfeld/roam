/**
 * TripCover — deterministic gradient cover for trips without a photo.
 * Picks a palette from the destination string so the same city always
 * gets the same colour, making the list feel considered rather than random.
 */

// 12 hand-picked travel-feeling gradients
const PALETTES = [
  { from: "#0D9488", to: "#0369A1" }, // teal → blue  (sea)
  { from: "#7C3AED", to: "#DB2777" }, // violet → pink (dusk)
  { from: "#B45309", to: "#D97706" }, // amber tones   (desert)
  { from: "#065F46", to: "#0D9488" }, // deep green     (forest)
  { from: "#1D4ED8", to: "#7C3AED" }, // blue → violet  (twilight)
  { from: "#9F1239", to: "#C2410C" }, // rose → orange  (sunset)
  { from: "#0369A1", to: "#0891B2" }, // deep blue      (ocean)
  { from: "#4F46E5", to: "#0D9488" }, // indigo → teal  (aurora)
  { from: "#166534", to: "#15803D" }, // forest greens  (nature)
  { from: "#92400E", to: "#B45309" }, // warm browns    (earth)
  { from: "#0F172A", to: "#1E3A5F" }, // deep navy      (night)
  { from: "#BE185D", to: "#9F1239" }, // pink → rose    (bloom)
] as const;

function paletteIndex(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash % PALETTES.length;
}

interface Props {
  destination: string;
  coverImageUrl?: string | null;
  className?: string;
}

export default function TripCover({ destination, coverImageUrl, className = "" }: Props) {
  const palette = PALETTES[paletteIndex(destination)];

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

  return (
    <div
      className={`flex items-end p-3 ${className}`}
      style={{
        background: `linear-gradient(135deg, ${palette.from}, ${palette.to})`,
      }}
    >
      {/* Subtle destination initial watermark */}
      <span
        className="text-3xl font-black leading-none select-none"
        style={{ color: "rgba(255,255,255,0.14)" }}
        aria-hidden
      >
        {destination.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}
