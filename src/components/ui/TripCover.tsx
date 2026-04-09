interface Props {
  destination: string;
  coverImageUrl?: string | null;
  className?: string;
}

export default function TripCover({ destination, coverImageUrl, className = "" }: Props) {

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

  // No image — parchment block with centred destination name
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{ background: "#FAF7F2", borderBottom: "1px solid #E5E0D8" }}
    >
      <span
        className="text-[11px] font-semibold tracking-[0.2em] uppercase text-gray-400 select-none"
        aria-hidden
      >
        {destination}
      </span>
    </div>
  );
}
