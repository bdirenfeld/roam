import Link from "next/link";
import TripCover from "./TripCover";
import type { Trip, TripStatus } from "@/types/database";

interface Props {
  trip: Trip;
  firstDayId?: string;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil(
    (new Date(dateStr + "T00:00:00").getTime() - today.getTime()) /
      (1000 * 60 * 60 * 24)
  );
}

function formatDateRange(start: string, end: string): string {
  const fmt = (d: Date, year = false) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(year ? { year: "numeric" } : {}),
    });
  return `${fmt(new Date(start + "T00:00:00"))} – ${fmt(new Date(end + "T00:00:00"), true)}`;
}

function tripNights(start: string, end: string): number {
  return Math.round(
    (new Date(end + "T00:00:00").getTime() - new Date(start + "T00:00:00").getTime()) /
      (1000 * 60 * 60 * 24)
  );
}

const STATUS: Record<TripStatus, { label: string; dot: string; text: string }> = {
  planning:  { label: "Planning",  dot: "bg-blue-400",  text: "text-blue-600"  },
  active:    { label: "Active",    dot: "bg-green-400", text: "text-green-600" },
  completed: { label: "Completed", dot: "bg-gray-300",  text: "text-gray-400"  },
};

export default function TripCard({ trip, firstDayId }: Props) {
  const countdown = daysUntil(trip.start_date);
  const nights = tripNights(trip.start_date, trip.end_date);
  const status = STATUS[trip.status] ?? STATUS.planning;

  const countdownLabel =
    countdown > 1 ? `${countdown} days away` :
    countdown === 1 ? "Tomorrow" :
    countdown === 0 ? "Today" : null;

  return (
    <Link href={firstDayId ? `/trips/${trip.id}/days/${firstDayId}` : `/trips/${trip.id}`} className="block group">
      <article className="rounded-2xl border border-gray-100 bg-white shadow-card group-hover:shadow-card-hover overflow-hidden transition-shadow duration-150 active:scale-[0.99]">

        {/* Cover image / gradient */}
        <TripCover
          destination={trip.destination}
          coverImageUrl={trip.cover_image_url}
          className="w-full h-[120px]"
        />

        {/* Content */}
        <div className="px-4 py-3">
          {/* Top row: title + status */}
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-bold text-gray-900 leading-snug">
              {trip.title}
            </h3>
            <div className={`flex items-center gap-1.5 shrink-0 ${status.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
              <span className="text-[11px] font-semibold">{status.label}</span>
            </div>
          </div>

          {/* Destination */}
          <div className="flex items-center gap-1 mt-1">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span className="text-xs text-gray-400">{trip.destination}</span>
          </div>

          {/* Bottom row: dates · nights · countdown */}
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <span className="text-xs text-gray-500">{formatDateRange(trip.start_date, trip.end_date)}</span>
            <span className="text-gray-200 text-xs">·</span>
            <span className="text-xs text-gray-400">{nights}n</span>

            {countdownLabel && (
              <>
                <span className="text-gray-200 text-xs">·</span>
                <span className="text-[13px] font-semibold text-activity">
                  {countdownLabel}
                </span>
              </>
            )}

            {trip.party_size > 1 && (
              <>
                <span className="text-gray-200 text-xs">·</span>
                <span className="text-xs text-gray-400 flex items-center gap-0.5">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 00-3-3.87" />
                    <path d="M16 3.13a4 4 0 010 7.75" />
                  </svg>
                  {trip.party_size}
                </span>
              </>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}
