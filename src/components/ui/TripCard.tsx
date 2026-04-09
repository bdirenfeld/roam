import Link from "next/link";
import TripCover from "./TripCover";
import type { Trip } from "@/types/database";

interface Props {
  trip: Trip;
  firstDayId?: string;
}

function tripNights(start: string, end: string): number {
  return Math.round(
    (new Date(end + "T00:00:00").getTime() - new Date(start + "T00:00:00").getTime()) /
      (1000 * 60 * 60 * 24)
  );
}

function formatDateCompact(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end   + "T00:00:00");
  const sMonth = s.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const eMonth = e.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const sDay   = s.getDate();
  const eDay   = e.getDate();
  const nights = tripNights(start, end);
  const nightsStr = `${nights} ${nights === 1 ? "NIGHT" : "NIGHTS"}`;
  if (sMonth === eMonth) return `${sMonth} ${sDay}–${eDay} · ${nightsStr}`;
  return `${sMonth} ${sDay} – ${eMonth} ${eDay} · ${nightsStr}`;
}

export default function TripCard({ trip, firstDayId }: Props) {
  return (
    <Link href={firstDayId ? `/trips/${trip.id}/days/${firstDayId}` : `/trips/${trip.id}`} className="block">
      <article className="rounded-2xl overflow-hidden border border-gray-100 bg-white active:scale-[0.99] transition-transform duration-150">

        {/* Full-bleed cover — ~60% of card height */}
        <TripCover
          destination={trip.destination}
          coverImageUrl={trip.cover_image_url}
          className="w-full h-[140px]"
        />

        {/* Editorial content — name + date range */}
        <div className="px-4 pt-3 pb-4">
          <h3 className="text-xl font-light text-gray-900 leading-snug">
            {trip.title}
          </h3>
          <p className="text-xs tracking-widest uppercase text-gray-400 mt-1">
            {formatDateCompact(trip.start_date, trip.end_date)}
          </p>
        </div>
      </article>
    </Link>
  );
}
