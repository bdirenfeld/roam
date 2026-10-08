"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowCounterClockwise, Archive, Copy, DotsThree, Trash } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { deleteJourney } from "@/lib/deleteJourney";
import { useToast } from "@/components/ui/Toast";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { setTripArchived } from "@/lib/tripArchive";
import { isPastJourney } from "@/lib/tripRecency";
import { monthYear } from "@/lib/tripDates";
import TripCover from "@/components/ui/TripCover";
import JourneyMenu from "@/components/ui/JourneyMenu";
import CopyJourneySheet from "@/components/trip/CopyJourneySheet";
import type { Trip } from "@/types/database";

interface Props {
  trips: Trip[];
  // Where each journey opens when tapped (lib/tripHref); trip root when absent.
  hrefByTrip: Record<string, string>;
  /** The signed-in person: "Copy to new dates" shows only on journeys they own (7 Oct 2026). */
  userId?: string | null;
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

// The phone row's date (7 Oct 2026, delight audit): a memory is "MAR 2026",
// not "MAR 4–12". A shelved trip that hasn't happened yet still says so.
function phoneDateLine(trip: Trip): string {
  const base = monthYear(trip.start_date);
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

export default function PastJourneysList({ trips, hrefByTrip, userId = null }: Props) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null);
  const [deleting, setDeleting] = useState(false);
  // The row whose ⋯ is open (by id and layout, phone and desktop render both), and the journey being copied.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [copyTarget, setCopyTarget] = useState<Trip | null>(null);
  // A destructive confirm with no keyboard exit is a trap (UX audit, finding 5).
  useEscapeKey(() => setDeleteTarget(null), deleteTarget !== null && !deleting);

  const groups = groupByYear(trips);
  const showYears = groups.length > 1;

  const hrefFor = (trip: Trip) => hrefByTrip[trip.id] ?? `/trips/${trip.id}`;

  const { toast } = useToast();
  const handleRestore = async (trip: Trip) => {
    const supabase = createClient();
    const failure = await setTripArchived(supabase, trip.id, false);
    if (failure) {
      // Keep the row — hiding it on a failed write reads as success until
      // the next refresh puts it back.
      console.error("Failed to restore journey:", failure);
      toast({ message: "Couldn't restore this journey. Try again." });
      return;
    }
    router.refresh();
    // The restore was silent (6 Oct 2026, taps audit): the row just left the
    // list. Now it says so, and Undo puts it back on the shelf.
    toast({
      message: `${trip.title} restored`,
      undo: async () => {
        const undoFailure = await setTripArchived(createClient(), trip.id, true);
        if (undoFailure) { toast({ message: "Couldn't archive it again. Try again." }); return; }
        router.refresh();
      },
    });
  };

  // Archive from the row's ⋯ (7 Oct 2026): the same write, toast and Undo as
  // the upcoming card's (TripCard).
  const handleArchive = async (trip: Trip) => {
    const failure = await setTripArchived(createClient(), trip.id, true);
    if (failure) { toast({ message: "Couldn't archive this journey. Try again." }); return; }
    router.refresh();
    toast({
      message: `${trip.title} archived`,
      undo: async () => {
        const undoFailure = await setTripArchived(createClient(), trip.id, false);
        if (undoFailure) { toast({ message: "Couldn't bring it back. Try again." }); return; }
        router.refresh();
      },
    });
  };

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
  // A past row's ⋯ (7 Oct 2026, mock t07): Copy to new dates (owner only),
  // Archive, Delete… — the upcoming card's menu, the same 44px rows. Delete
  // sits behind the menu, so the row itself still carries no bin.
  const actions = (trip: Trip, where: "phone" | "desk") => {
    const key = `${where}:${trip.id}`;
    return (
      <div className="relative flex items-center gap-1 flex-shrink-0">
        {trip.archived === true && (
          <button
            onClick={() => handleRestore(trip)}
            className="relative w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            style={{ background: "rgba(0,0,0,0.04)" }}
            aria-label={`Restore ${trip.title}`}
          >
            <span aria-hidden="true" className="absolute -inset-1.5" />
            <ArrowCounterClockwise size={12} weight="light" className="text-gray-400" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setMenuFor((v) => (v === key ? null : key))}
          className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          aria-label={`Options for ${trip.title}`}
          aria-haspopup="menu"
          aria-expanded={menuFor === key}
        >
          <DotsThree size={20} weight="bold" color="rgba(26,26,46,0.45)" />
        </button>
        {menuFor === key && (
          <JourneyMenu
            className="absolute top-11 right-0"
            onClose={() => setMenuFor(null)}
            items={[
              ...(userId && trip.user_id === userId ? [{ label: "Copy to new dates", icon: <Copy size={14} weight="light" className="text-gray-500" />, onSelect: () => setCopyTarget(trip) }] : []),
              ...(trip.archived === true ? [] : [{ label: "Archive", icon: <Archive size={14} weight="light" className="text-gray-500" />, onSelect: () => handleArchive(trip) }]),
              { label: "Delete…", icon: <Trash size={14} weight="light" className="text-red-400" />, onSelect: () => setDeleteTarget(trip), danger: true },
            ]}
          />
        )}
      </div>
    );
  };

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
              className="relative flex items-center gap-3 flex-1 min-w-0"
            >
              {/* 44px to the finger (7 Oct 2026, phone harness): 4px into the row's own padding. */}
              <span aria-hidden="true" className="absolute -inset-y-1 inset-x-0" />
              {/* 36px round cover where the grey dot was (7 Oct 2026, delight
                  audit) — TripCover, the same source and fallbacks as the
                  journey cards: the cover, else the destination's map, else
                  a soft neutral circle. */}
              <span data-cover className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 block" style={{ background: "#E8E3DA" }}>
                <TripCover
                  destination={trip.destination}
                  coverImageUrl={trip.cover_image_url ?? null}
                  lat={trip.destination_lat}
                  lng={trip.destination_lng}
                  className="w-9 h-9 rounded-full block"
                />
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className="font-display text-[15px] truncate"
                  style={{ color: "#1A1A2E" }}
                >
                  {trip.title}
                </p>
                <p
                  className="text-[10px] uppercase tracking-widest mt-0.5"
                  style={{ color: "rgba(26,26,46,0.62)" }}
                >
                  {phoneDateLine(trip)}
                </p>
              </div>
            </Link>
            {/* No bin on the phone rows (7 Oct 2026, delight audit): the trips
                you took read as clutter to clear out. Delete sits behind the
                row's ⋯ with Copy to new dates and Archive (same day, mock t07). */}
            {actions(trip, "phone")}
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
                className="w-14 h-14 rounded-xl flex-shrink-0"
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
            {actions(trip, "desk")}
          </div>
            ))}
          </div>
        ))}
      </div>

      {copyTarget && <CopyJourneySheet trip={copyTarget} onClose={() => setCopyTarget(null)} />}

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
                Every day, place and note in it goes too. There’s no undo. Archive puts it away instead.
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
