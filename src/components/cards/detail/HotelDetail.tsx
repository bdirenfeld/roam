"use client";

import type { Card } from "@/types/database";
import FieldRow, { SectionLabel } from "./FieldRow";

interface Props {
  card: Card;
  onSaveDetails?: (field: string, value: unknown) => void;
  showEmpty?: boolean;
  /** The check-out the journey implies (lib/stays/stayRuns) when none is written. */
  stayCheckOut?: string | null;
  /** The check-in day (the card's own day, YYYY-MM-DD). The check-out picker
   *  starts there: with no floor it opened on today's month, a year before a
   *  2027 trip (Don's feedback, Nov 2026). */
  checkInDay?: string | null;
  /** Opens the hotel picker (StayDatesSheet): one calendar for both days and
   *  the two times. Either row opens it; a hotel has no time chip of its own. */
  onEditStay?: () => void;
}

function fmtTime(t: string | null): string | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  const p = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${p}`;
}

/** One stay row (16 Nov 2026, Brennan picked "B"): grey icon, a small grey
 *  label above the value, no lines. Tighter than a row per field. */
export function StayRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className="material-symbols-outlined mt-0.5" style={{ fontSize: 18, color: "rgba(26,26,46,0.5)", fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium leading-tight" style={{ color: "rgba(26,26,46,0.5)" }}>{label}</p>
        <div className="flex text-[14px] font-medium mt-px" style={{ color: "#1A1A2E" }}>{children}</div>
      </div>
    </div>
  );
}

const isIso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const fmtDay = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

export default function HotelDetail({ card, onSaveDetails, showEmpty = false, stayCheckOut = null, checkInDay = null, onEditStay }: Props) {
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
  // Each end of the stay reads as a date AND a time, and check-out says how
  // many nights (Don, Nov 2026: "the check-in / check-out times don't have a
  // date", and he could not tell one hotel card covered several nights).
  const inDay = isIso(checkInDay) ? checkInDay : null;
  const nights = inDay && leaveDay ? Math.round((Date.parse(leaveDay) - Date.parse(inDay)) / 86_400_000) : 0;
  const checkInText = [inDay ? fmtDay(inDay) : null, checkIn].filter(Boolean).join(" · ");
  const checkOutLabel = nights > 0 ? `Check-out · ${nights} ${nights === 1 ? "night" : "nights"}` : "Check-out";

  return (
    <div className="space-y-6">
      {/* STAY (16 Nov 2026): no uppercase
          labels, no colour emoji, and no empty "yyyy-mm-dd" box. An unset
          check-out says "Add a date"; the real date input sits over it, so a
          tap still opens the phone's own picker. Small label above each value, no lines. */}
      {(showEmpty || hasStayData || canSetLeave) && (
        <div data-testid="hotel-stay" className="space-y-3.5">
          {(checkInText || onEditStay) && (
            <StayRow icon="key" label="Check-in">
              {onEditStay ? (
                <button type="button" onClick={onEditStay} aria-label="Change the stay's dates and times"
                  className="relative flex-1 min-w-0 flex items-center justify-between text-left">
                  <span data-testid="checkin-value" style={{ color: checkInText ? "#1A1A2E" : "rgba(26,26,46,0.45)" }}>{checkInText || "Add a time"}</span>
                  <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: 18, color: "rgba(26,26,46,0.35)" }}>chevron_right</span>
                </button>
              ) : (
                <span data-testid="checkin-value">{checkInText}</span>
              )}
            </StayRow>
          )}
          {(canSetLeave || leaveDay) && (
            <StayRow icon="luggage" label={checkOutLabel}>
              {onEditStay ? (
                <button type="button" onClick={onEditStay} aria-label="Change the stay's dates and times"
                  className="relative flex-1 min-w-0 flex items-center justify-between text-left">
                  <span data-testid="checkout-value" style={{ color: leaveDay ? "#1A1A2E" : "rgba(26,26,46,0.45)" }}>
                    {leaveDay ? [fmtDay(leaveDay), checkOut].filter(Boolean).join(" · ") : "Add a date"}
                  </span>
                  <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: 18, color: "rgba(26,26,46,0.35)" }}>chevron_right</span>
                </button>
              ) : (
              <span className="relative flex-1 min-w-0 flex items-center justify-between">
                <span data-testid="checkout-value" style={{ color: leaveDay ? "#1A1A2E" : "rgba(26,26,46,0.45)" }}>
                  {leaveDay ? [fmtDay(leaveDay), checkOut].filter(Boolean).join(" · ") : "Add a date"}
                </span>
                {canSetLeave && (
                  <>
                    <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: 18, color: "rgba(26,26,46,0.35)" }}>chevron_right</span>
                    <input
                      type="date"
                      aria-label="Check-out day"
                      value={leaveDay}
                      min={isIso(checkInDay) ? checkInDay : undefined}
                      onChange={(e) => onSaveDetails!("check_out", e.target.value || null)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </>
                )}
              </span>
              )}
            </StayRow>
          )}
          {checkOut && !(canSetLeave || leaveDay) && (
            <StayRow icon="schedule" label="Check-out time">{checkOut}</StayRow>
          )}
          <FieldRow icon="📋" label="Confirmation" value={d.confirmation}
            placeholder="Add confirmation code…" onSave={save("confirmation")} hideWhenEmpty={hide} />
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
