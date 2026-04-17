"use client";

import { useState } from "react";
import Link from "next/link";
import TripCover from "./TripCover";
import TripCoverEditModal from "./TripCoverEditModal";
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
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(trip.cover_image_url ?? null);
  const [showModal,     setShowModal]     = useState(false);

  return (
    <>
      <div className="group relative">
        <Link href={firstDayId ? `/trips/${trip.id}/days/${firstDayId}` : `/trips/${trip.id}`} className="block">
          <article className="rounded-2xl overflow-hidden border border-gray-100 bg-white active:scale-[0.99] transition-all duration-150 [@media(hover:hover)]:group-hover:shadow-[0_0_0_1.5px_rgba(196,98,45,0.3)]">

            {/* Full-bleed cover — ~60% of card height */}
            <TripCover
              destination={trip.destination}
              coverImageUrl={coverImageUrl}
              lat={trip.destination_lat}
              lng={trip.destination_lng}
              className="w-full h-[140px]"
            />

            {/* Editorial content — name + date range */}
            <div className="px-4 pt-3 pb-4">
              <h3 className="text-xl font-normal text-gray-900 leading-snug">
                {trip.title}
              </h3>
              <p className="text-xs tracking-widest uppercase text-gray-400 mt-1">
                {formatDateCompact(trip.start_date, trip.end_date)}
              </p>
            </div>
          </article>
        </Link>

        {/* Pencil button — hover only, never on touch screens */}
        <button
          onClick={() => setShowModal(true)}
          className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full flex items-center justify-center opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity duration-150 [@media(hover:none)]:hidden"
          style={{ background: "rgba(0,0,0,0.5)" }}
          aria-label="Edit cover image"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>

      {showModal && (
        <TripCoverEditModal
          trip={trip}
          onClose={() => setShowModal(false)}
          onSuccess={(url) => { setCoverImageUrl(url); setShowModal(false); }}
        />
      )}
    </>
  );
}
