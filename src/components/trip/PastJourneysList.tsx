"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowCounterClockwise, Trash } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { deleteJourney } from "@/lib/deleteJourney";
import { useToast } from "@/components/ui/Toast";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { setTripArchived } from "@/lib/tripArchive";
import { isPastJourney } from "@/lib/tripRecency";
import type { Trip } from "@/types/database";

interface Props {
  trips: Trip[];
  // Day each journey opens to when tapped — resolved upstream; trip root when absent.
  openDayByTrip: Record<string, string>;
}

function formatDateShort(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const sM = s.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const eM = e.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  if (sM === eM) return `${sM} ${s.getDate()}–${e.getDate()}`;
  return `${sM} ${s.getDate()} – ${eM} ${e.getDate()}`;
}

// An archived trip whose dates haven't passed gets an honest label —
// it's shelved, not over.
function dateLine(trip: Trip): string {
  const base = formatDateShort(trip.start_date, trip.end_date);
  return trip.archived === true && !isPastJourney(trip)
    ? `${base} · still upcoming`
    : base;
}

/**
 * Past journeys, grouped by the year they ended.
 *
 * Years appear in the order they first occur, and journeys keep the order they
 * arrived in — the list is already date-sorted upstream, and re-sorting here
 * would quietly disagree with it.
 *
 * A single year gets no divider. Labelling one group "2026" tells you nothing
 * you can't see from the dates on every row; the divider only earns its space
 * once there is a boundary to mark.
 */
function groupByYear(trips: Trip[]): { year: string; trips: Trip[] }[] {
  const groups: { year: string; trips: Trip[] }[] = [];
  for (const trip of trips) {
    const year = (trip.end_date ?? trip.start_date ?? "").slice(0, 4) || "—";
    const last = groups.find((g) => g.year === year);
    if (last) last.trips.push(trip);
    else groups.push({ year, trips: [trip] });
  }
  return groups;
}

function YearDivider({ year, first }: { year: string; first: boolean }) {
  return (
    <p
      className={`text-[9px] uppercase tracking-widest ${first ? "" : "mt-5"} mb-1.5`}
      style={{ color: "#C4C0B8" }}
    >
      {year}
    </p>
  );
}

export default function PastJourneysList({ trips, openDayByTrip }: Props) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null);
  const [deleting, setDeleting] = useState(false);
  // A destructive confirm with no keyboard exit is a trap (UX audit, finding 5).
  useEscapeKey(() => setDeleteTarget(null), deleteTarget !== null && !deleting);

  const groups = groupByYear(trips);
  const showYears = groups.length > 1;

  const hrefFor = (trip: Trip) =>
    openDayByTrip[trip.id]
      ? `/trips/${trip.id}/days/${openDayByTrip[trip.id]}`
      : `/trips/${trip.id}`;

  const handleRestore = async (trip: Trip) => {
    const supabase = createClient();
    const failure = await setTripArchived(supabase, trip.id, false);
    if (failure) {
      // Keep the row — hiding it on a failed write reads as success until
      // the next refresh puts it back.
      console.error("Failed to restore journey:", failure);
      return;
    }
    router.refresh();
  };

  const { toast } = useToast();
  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const failure = await deleteJourney(createClient(), deleteTarget.id);
    setDeleteTarget(null);
    setDeleting(false);
    if (failure) { toast({ message: failure }); return; }
    router.refresh();
  };

  // Restore only shows for explicitly archived trips — a trip that is past by
  // date alone has nothing to un-archive; clearing the flag would change nothing.
  const actions = (trip: Trip) => (
    <div className="flex items-center gap-2 flex-shrink-0">
      {trip.archived === true && (
        <button
          onClick={() => handleRestore(trip)}
          className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          style={{ background: "rgba(0,0,0,0.04)" }}
          aria-label={`Restore ${trip.title}`}
        >
          <ArrowCounterClockwise size={12} weight="light" className="text-gray-400" />
        </button>
      )}
      <button
        onClick={() => setDeleteTarget(trip)}
        className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
        style={{ background: "rgba(254,242,242,0.6)" }}
        aria-label={`Delete ${trip.title}`}
      >
        <Trash size={12} weight="light" className="text-red-400" />
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile — compact rows */}
      <div className="md:hidden">
        {groups.map((group, gi) => (
          <div key={group.year}>
            {showYears && <YearDivider year={group.year} first={gi === 0} />}
            {group.trips.map((trip) => (
          <div
            key={trip.id}
            className="flex items-center gap-3 py-3 border-b border-black/5"
          >
            <Link
              href={hrefFor(trip)}
              className="flex items-center gap-3 flex-1 min-w-0"
            >
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: "#D4CFC8" }}
              />
              <div className="flex-1 min-w-0">
                <p
                  className="font-display italic text-[13px] truncate"
                  style={{ color: "#9CA3AF" }}
                >
                  {trip.title}
                </p>
                <p
                  className="text-[9px] uppercase tracking-widest mt-0.5"
                  style={{ color: "#C4C0B8" }}
                >
                  {dateLine(trip)}
                </p>
              </div>
            </Link>
            {actions(trip)}
          </div>
            ))}
          </div>
        ))}
      </div>

      {/* Desktop — editorial rows with circular cover */}
      <div className="hidden md:block">
        {groups.map((group, gi) => (
          <div key={group.year}>
            {showYears && <YearDivider year={group.year} first={gi === 0} />}
            {group.trips.map((trip) => (
          <div
            key={trip.id}
            className="flex items-center gap-[18px] py-[14px] px-1"
          >
            <Link
              href={hrefFor(trip)}
              className="flex items-center gap-[18px] flex-1 min-w-0 hover:opacity-80 transition-opacity"
            >
              <div
                className="w-14 h-14 rounded-full flex-shrink-0"
                style={{
                  backgroundImage: trip.cover_image_url
                    ? `url(${trip.cover_image_url})`
                    : undefined,
                  backgroundColor: trip.cover_image_url ? undefined : "#E8E3DA",
                  backgroundSize: "cover",
                  backgroundPosition: "50% 50%",
                  boxShadow: "0 0 0 1px rgba(26,26,46,0.10)",
                }}
              />
              <div className="flex-1 min-w-0">
                <div
                  className="font-display italic truncate"
                  style={{
                    fontSize: 18,
                    fontWeight: 500,
                    color: "#1A1A2E",
                    letterSpacing: "-0.005em",
                  }}
                >
                  {trip.title}
                </div>
                <div
                  className="mt-1"
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.14em",
                    color: "rgba(26,26,46,0.62)",
                  }}
                >
                  {dateLine(trip)}
                </div>
              </div>
            </Link>
            {actions(trip)}
          </div>
            ))}
          </div>
        ))}
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
    </>
  );
}
