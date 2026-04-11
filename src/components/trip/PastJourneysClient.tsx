"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowCounterClockwise, Trash } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import type { Trip } from "@/types/database";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

interface Props {
  initialTrips: Trip[];
}

function formatDateShort(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const sM = s.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const eM = e.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  if (sM === eM) return `${sM} ${s.getDate()}–${e.getDate()}`;
  return `${sM} ${s.getDate()} – ${eM} ${e.getDate()}`;
}

function TripThumb({ trip }: { trip: Trip }) {
  const [imgError, setImgError] = useState(false);

  if (trip.cover_image_url && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={trip.cover_image_url}
        alt={trip.title}
        className="w-full h-full object-cover"
        onError={() => setImgError(true)}
      />
    );
  }
  if (MAPBOX_TOKEN && trip.destination_lat != null && trip.destination_lng != null) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${trip.destination_lng},${trip.destination_lat},10,0/400x200@2x?access_token=${MAPBOX_TOKEN}`}
        alt={trip.title}
        className="w-full h-full object-cover"
      />
    );
  }
  return <div className="w-full h-full" style={{ background: "#E8E3DA" }} />;
}

export default function PastJourneysClient({ initialTrips }: Props) {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>(initialTrips);
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleRestore = async (trip: Trip) => {
    const supabase = createClient();
    await supabase
      .from("trips")
      .update({ status: "planning" })
      .eq("id", trip.id);
    setTrips((prev) => prev.filter((t) => t.id !== trip.id));
    router.refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const supabase = createClient();
    await supabase.from("cards").delete().eq("trip_id", deleteTarget.id);
    await supabase.from("days").delete().eq("trip_id", deleteTarget.id);
    await supabase.from("trips").delete().eq("id", deleteTarget.id);
    setTrips((prev) => prev.filter((t) => t.id !== deleteTarget.id));
    setDeleteTarget(null);
    setDeleting(false);
  };

  return (
    <div className="flex flex-col min-h-dvh bg-white">
      {/* Header */}
      <div className="flex items-center h-11 border-b border-gray-100 flex-shrink-0 relative bg-white sticky top-0 z-10">
        <button
          onClick={() => router.push("/trips")}
          className="flex items-center justify-center w-11 h-11 text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
          aria-label="Back"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="absolute left-0 right-0 text-center pointer-events-none">
          <span className="font-display italic text-[17px] text-gray-900">Past journeys</span>
        </span>
      </div>

      {/* Trip list */}
      <div className="flex-1 px-4 pt-2 pb-10">
        {trips.length === 0 ? (
          <p
            className="font-display italic text-[12px] text-center pt-12"
            style={{ color: "#C4C0B8" }}
          >
            No archived journeys yet.
          </p>
        ) : (
          <div>
            {trips.map((trip) => (
              <div
                key={trip.id}
                className="flex items-center gap-3 py-3 border-b border-black/5"
              >
                {/* Thumbnail */}
                <div className="w-[52px] h-[40px] rounded-lg overflow-hidden flex-shrink-0">
                  <TripThumb trip={trip} />
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p
                    className="font-display text-[14px] truncate"
                    style={{ color: "#6B7280" }}
                  >
                    {trip.title}
                  </p>
                  <p
                    className="text-[9px] uppercase tracking-widest mt-0.5"
                    style={{ color: "#B8B4AC" }}
                  >
                    {formatDateShort(trip.start_date, trip.end_date)}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Restore */}
                  <button
                    onClick={() => handleRestore(trip)}
                    className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                    style={{ background: "rgba(0,0,0,0.04)" }}
                    aria-label="Restore journey"
                  >
                    <ArrowCounterClockwise size={12} weight="light" className="text-gray-400" />
                  </button>
                  {/* Delete */}
                  <button
                    onClick={() => setDeleteTarget(trip)}
                    className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                    style={{ background: "rgba(254,242,242,0.6)" }}
                    aria-label="Delete journey"
                  >
                    <Trash size={12} weight="light" className="text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer editorial note */}
        <p
          className="font-display italic text-[12px] text-center mt-8"
          style={{ color: "#C4C0B8" }}
        >
          Archive a journey to preserve it here. Restore anytime.
        </p>
      </div>

      {/* Delete confirmation bottom sheet */}
      {deleteTarget && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[60]"
            onClick={() => !deleting && setDeleteTarget(null)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-[60] max-w-mobile mx-auto flex flex-col"
            style={{ maxHeight: "85vh" }}
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-9 h-1 bg-gray-200 rounded-full" />
            </div>
            <div className="flex-1 overflow-y-auto px-5 pt-3">
              <h2 className="text-[22px] text-gray-900 mb-2 font-display italic">
                Delete &ldquo;{deleteTarget.title}&rdquo;?
              </h2>
              <p className="text-[14px] text-gray-500 leading-relaxed">
                This will permanently remove the trip and all its cards. This cannot be undone.
              </p>
            </div>
            <div className="flex-shrink-0 px-5 pt-4 pb-10 space-y-2.5">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="w-full py-3.5 rounded-xl bg-[#1A1A2E] text-white text-[15px] font-semibold disabled:opacity-50 active:scale-[0.99] transition-all"
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="w-full py-3.5 rounded-xl text-[15px] font-medium text-gray-500 active:scale-[0.99] transition-all disabled:opacity-40"
                style={{ background: "white", border: "0.5px solid rgba(0,0,0,0.10)" }}
              >
                Keep this journey
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
