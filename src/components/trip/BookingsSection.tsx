"use client";

// ── Bookings, in Journey settings (1 Oct 2026) ────────────────────────────
// One row: what is booked — flights, hotels, a rental car, one line each
// (lib/bookings/summary) — or, with nothing yet, an Upload button. Brennan:
// "in settings you should have the ability to enter your hotel and flight",
// and when you haven't, "the best way is to upload the document later and the
// app will populate the cards for you". Upload reads the confirmation and
// shows Bookings' own check-and-add sheet (useBookingUpload, shared with a new
// journey's "Upload a booking"); tapping a booked row opens Bookings. Reads
// its own cards, so the page needs no new plumbing.

import { useCallback, useEffect, useState } from "react";
import Pieces from "@/components/ui/Pieces";
import type { Day } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { bookingLines, type BookingCard, type BookingLine } from "@/lib/bookings/summary";
import DocumentsSheet from "@/components/plan/DocumentsSheet";
import { useBookingUpload } from "./useBookingUpload";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.62)";
const FAINT = "rgba(26,26,46,0.5)";

export default function BookingsSection({ tripId, days, endDate }: { tripId: string; days: Day[]; endDate: string }) {
  const [lines, setLines] = useState<BookingLine[] | null>(null);
  const [showDocs, setShowDocs] = useState(false);

  const load = useCallback(async () => {
    const { data } = await createClient()
      .from("cards")
      .select("id, day_id, place_id, status, start_time, details, place:places(sub_type, title, address)")
      .eq("trip_id", tripId)
      .not("day_id", "is", null);
    setLines(bookingLines(days.map((d) => ({ id: d.id, date: d.date })), (data ?? []) as unknown as BookingCard[], endDate));
  }, [tripId, days, endDate]);
  useEffect(() => { void load(); }, [load]);
  const upload = useBookingUpload({ tripId, days, onAdded: () => { void load(); } });

  const empty = lines !== null && lines.length === 0;
  return (
    <div id="bookings">
      {upload.element}
      <div
        role={empty ? undefined : "button"}
        tabIndex={empty ? undefined : 0}
        onClick={empty ? undefined : () => setShowDocs(true)}
        onKeyDown={empty ? undefined : (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowDocs(true); } }}
        className={`w-full flex items-center px-5 py-[14px] border-b border-black/5 text-left ${empty ? "" : "cursor-pointer"}`}
        data-testid="bookings-row"
      >
        <span className="text-[10px] uppercase tracking-widest text-gray-400 w-20 flex-shrink-0 self-start mt-[3px]">Bookings</span>
        <span className="flex-1 min-w-0">
          {lines === null ? <span className="text-[14px]" style={{ color: FAINT }}> </span>
            : empty ? (
              <>
                <span className="block text-[14px]" style={{ color: INK }}>No flight or hotel yet</span>
                <span className="block text-[12.5px] mt-0.5" style={{ color: CAPTION }}>Upload a confirmation and Roam puts them on your days.</span>
              </>
            ) : lines.map((l) => (
              <span key={l.kind} className="block text-[14px] leading-snug" style={{ color: INK }}>
                <Pieces text={`${l.kind} · ${l.text}`} />
              </span>
            ))}
        </span>
        {empty ? (
          <button type="button" onClick={upload.pick} disabled={upload.reading}
            className="ml-3 flex-shrink-0 rounded-full px-4 py-1.5 text-[13px] font-semibold text-white disabled:opacity-60" style={{ background: INK }}>
            {upload.reading ? "Reading…" : "Upload"}
          </button>
        ) : lines !== null && <span aria-hidden="true" className="text-[14px] flex-shrink-0 ml-2" style={{ color: FAINT }}>›</span>}
      </div>
      {showDocs && <DocumentsSheet tripId={tripId} onClose={() => setShowDocs(false)} onImport={() => { setShowDocs(false); upload.pick(); }} />}
    </div>
  );
}
