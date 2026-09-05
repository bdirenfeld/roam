"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DotsThree, PencilSimpleLine, Archive, Trash } from "@phosphor-icons/react";
import TripCover from "./TripCover";
import TripCoverEditModal from "./TripCoverEditModal";
import { createClient } from "@/lib/supabase/client";
import { deleteJourney } from "@/lib/deleteJourney";
import { useToast } from "@/components/ui/Toast";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { setTripArchived } from "@/lib/tripArchive";
import type { Trip } from "@/types/database";

interface Props {
  trip: Trip;
  // The day to open when this card is tapped — today's day clamped to the
  // journey range, resolved upstream. Falls back to the trip root when absent.
  openDayId?: string;
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

export default function TripCard({ trip, openDayId }: Props) {
  const router = useRouter();
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(trip.cover_image_url ?? null);
  const [showModal,     setShowModal]     = useState(false);
  const [menuOpen,      setMenuOpen]      = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  useEscapeKey(() => setConfirmDelete(false), confirmDelete && !deleting);

  const handleArchive = async () => {
    setMenuOpen(false);
    const supabase = createClient();
    const failure = await setTripArchived(supabase, trip.id, true);
    if (failure) { console.error("Failed to archive journey:", failure); return; }
    router.refresh();
  };

  const { toast } = useToast();
  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    const failure = await deleteJourney(createClient(), trip.id);
    setDeleting(false);
    setConfirmDelete(false);
    if (failure) { toast({ message: failure }); return; }
    router.refresh();
  };

  return (
    <>
      <div className="group relative">
        <Link href={openDayId ? `/trips/${trip.id}/days/${openDayId}` : `/trips/${trip.id}`} className="block">
          <article className="rounded-2xl overflow-hidden border border-gray-100 bg-white active:scale-[0.99] transition-all duration-150 [@media(hover:hover)]:group-hover:shadow-[0_0_0_1.5px_rgba(196,98,45,0.3)]">

            {/* The name and dates sit on the photograph rather than in a white
                block beneath it. That block was ~90px of chrome per card; at
                four journeys the page became a scroll. A card is now just the
                picture and its caption. */}
            <div className="relative">
              <TripCover
                destination={trip.destination}
                coverImageUrl={coverImageUrl}
                lat={trip.destination_lat}
                lng={trip.destination_lng}
                className="w-full h-[168px] md:h-[260px]"
              />

              {/* Scrim — the photographs vary, so the caption needs its own
                  ground rather than trusting whatever is behind it. */}
              <div
                className="absolute inset-x-0 bottom-0 pointer-events-none"
                style={{
                  height: "62%",
                  background:
                    "linear-gradient(to top, rgba(12,12,20,0.78) 0%, rgba(12,12,20,0.42) 45%, rgba(12,12,20,0) 100%)",
                }}
              />

              <div className="absolute inset-x-0 bottom-0 px-4 pb-3.5">
                <h3 className="text-[19px] md:text-xl font-normal text-white leading-snug">
                  {trip.title}
                </h3>
                <p
                  className="text-[10.5px] tracking-widest uppercase mt-0.5"
                  style={{ color: "rgba(255,255,255,0.72)" }}
                >
                  {formatDateCompact(trip.start_date, trip.end_date)}
                </p>
              </div>
            </div>
          </article>
        </Link>

        {/* ··· menu — one deliberate door for manage actions. Hover-reveal on
            desktop; always visible on touch (the old pencil was unreachable
            on phones). Delete stays behind its own confirmation. */}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full flex items-center justify-center opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity duration-150"
          // Permanently visible on touch, so it has to sit quietly on the
          // photograph rather than punch a dark hole in it.
          style={{ background: "rgba(0,0,0,0.24)", backdropFilter: "blur(6px)" }}
          aria-label={`Options for ${trip.title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <DotsThree size={16} weight="bold" color="white" />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
            <div
              className="absolute top-10 right-2 z-30 w-[176px] bg-white rounded-xl overflow-hidden"
              role="menu"
              style={{
                border: "1px solid rgba(26,26,46,0.08)",
                boxShadow: "0 8px 30px rgba(26,26,46,0.18)",
              }}
            >
              <button
                role="menuitem"
                onClick={() => { setMenuOpen(false); setShowModal(true); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-gray-800 hover:bg-gray-50 transition-colors"
              >
                <PencilSimpleLine size={14} weight="light" className="text-gray-500" />
                Change cover
              </button>
              <button
                role="menuitem"
                onClick={handleArchive}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-gray-800 hover:bg-gray-50 transition-colors border-t border-black/5"
              >
                <Archive size={14} weight="light" className="text-gray-500" />
                Archive
              </button>
              <button
                role="menuitem"
                onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-red-500 hover:bg-red-50 transition-colors border-t border-black/5"
              >
                <Trash size={14} weight="light" className="text-red-400" />
                Delete…
              </button>
            </div>
          </>
        )}
      </div>

      {/* Delete confirmation — same sheet pattern as Past journeys */}
      {confirmDelete && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[60]"
            onClick={() => !deleting && setConfirmDelete(false)}
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
                Delete &ldquo;{trip.title}&rdquo;?
              </h2>
              <p className="text-[14px] text-gray-500 leading-relaxed">
                This will permanently remove the journey and all its cards. This cannot be undone.
              </p>
            </div>
            <div className="flex-shrink-0 px-5 pt-4 pb-10 space-y-2.5">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="w-full py-3.5 rounded-full bg-[#1A1A2E] text-white text-[15px] font-semibold disabled:opacity-50 active:scale-[0.99] transition-all"
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
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
