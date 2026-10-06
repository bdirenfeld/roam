"use client";

import type { Card } from "@/types/database";
import FieldRow, { SectionLabel } from "./FieldRow";

interface Props {
  card: Card;
  onSaveDetails?: (field: string, value: unknown) => void;
  showEmpty?: boolean;
  /** The check-out the journey implies (lib/stays/stayRuns) when none is written. */
  stayCheckOut?: string | null;
}

function fmtTime(t: string | null): string | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  const p = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${p}`;
}

const isIso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default function HotelDetail({ card, onSaveDetails, showEmpty = false, stayCheckOut = null }: Props) {
  const d = card.details as { confirmation?: string; notes?: string; check_out?: unknown; check_out_date?: unknown };
  const save = (field: string) =>
    onSaveDetails ? (v: string) => onSaveDetails(field, v || null) : undefined;
  const hide = !showEmpty;

  const checkIn  = fmtTime(card.start_time);
  const checkOut = fmtTime(card.end_time);
  // The day you leave (1 Oct 2026): it is what makes the hotel cover every
  // night between, on the week's band and the phone's map. Written on the card
  // if set; otherwise the day the band already shows, so the two agree.
  const leaveDay = isIso(d.check_out) ? d.check_out : isIso(d.check_out_date) ? d.check_out_date : isIso(stayCheckOut) ? stayCheckOut : "";
  const canSetLeave = !!onSaveDetails && !!card.day_id;
  const hasStayData = checkIn || checkOut || d.confirmation || leaveDay;

  return (
    <div className="space-y-6">
      {/* STAY */}
      {(showEmpty || hasStayData || canSetLeave) && (
        <div>
          <SectionLabel>Stay</SectionLabel>
          <div className="space-y-4">
            {checkIn && (
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 text-center text-base mt-0.5 leading-none">🔑</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Check-in</p>
                  <p className="text-sm font-medium text-gray-800">{checkIn}</p>
                </div>
              </div>
            )}
            {(canSetLeave || leaveDay) && (
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 text-center text-base mt-0.5 leading-none">🧳</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Check-out day</p>
                  {canSetLeave ? (
                    <input
                      type="date"
                      aria-label="Check-out day"
                      value={leaveDay}
                      onChange={(e) => onSaveDetails!("check_out", e.target.value || null)}
                      className="text-sm font-medium text-gray-800 bg-transparent outline-none"
                    />
                  ) : (
                    <p className="text-sm font-medium text-gray-800">{new Date(leaveDay + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</p>
                  )}
                </div>
              </div>
            )}
            {checkOut && (
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 text-center text-base mt-0.5 leading-none">🕚</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Check-out time</p>
                  <p className="text-sm font-medium text-gray-800">{checkOut}</p>
                </div>
              </div>
            )}
            <FieldRow icon="📋" label="Confirmation" value={d.confirmation}
              placeholder="Add confirmation code…" onSave={save("confirmation")} hideWhenEmpty={hide} />
          </div>
        </div>
      )}

      {/* NOTES */}
      {(showEmpty || d.notes) && (
        <div>
          {/* No "Notes" label while reading (6 Oct 2026): the note is plainly the note. Kept in the Add details form beside the other labelled fields. */}
          {showEmpty && <SectionLabel>Notes</SectionLabel>}
          <FieldRow value={d.notes} placeholder="Add a note…"
            onSave={save("notes")} multiline hideWhenEmpty={hide} />
          {/* The note shows under "Tonight" on the shared link, which can be
              forwarded (2 Oct 2026): fine for check-in time and Wi-Fi, not a
              door code. Journey notes never reach that page. */}
          {onSaveDetails && card.day_id && (
            <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: "rgba(26,26,46,0.55)" }} data-testid="hotel-note-shared">
              Shows on the shared link. Keep door codes in Journey notes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
