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

/** One stay row: grey icon, label, value — the sheet's Hours-row look. */
function StayRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 min-h-[44px] text-[13.5px] border-b border-[rgba(26,26,46,0.06)] last:border-b-0">
      <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: 18, color: "rgba(26,26,46,0.5)", fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}>{icon}</span>
      <span className="font-medium min-w-[96px]" style={{ color: "#1A1A2E" }}>{label}</span>
      <span className="flex-1 min-w-0 flex" style={{ color: "rgba(26,26,46,0.62)" }}>{children}</span>
    </div>
  );
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
      {/* STAY — plain rows like the sheet's Hours row (16 Nov 2026): no uppercase
          labels, no colour emoji, and no empty "yyyy-mm-dd" box. An unset
          check-out says "Add a date"; the real date input sits over it, so a
          tap still opens the phone's own picker. One hairline between the rows only:
          lines above and below doubled the sheet's own divider. */}
      {(showEmpty || hasStayData || canSetLeave) && (
        <div data-testid="hotel-stay">
          {checkIn && (
            <StayRow icon="key" label="Check-in">{checkIn}</StayRow>
          )}
          {(canSetLeave || leaveDay) && (
            <StayRow icon="luggage" label="Check-out">
              <span className="relative flex-1 min-w-0 flex items-center justify-between">
                <span data-testid="checkout-value" style={{ color: leaveDay ? "rgba(26,26,46,0.62)" : "rgba(26,26,46,0.45)" }}>
                  {leaveDay ? new Date(leaveDay + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "Add a date"}
                </span>
                {canSetLeave && (
                  <>
                    <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: 18, color: "rgba(26,26,46,0.35)" }}>chevron_right</span>
                    <input
                      type="date"
                      aria-label="Check-out day"
                      value={leaveDay}
                      onChange={(e) => onSaveDetails!("check_out", e.target.value || null)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </>
                )}
              </span>
            </StayRow>
          )}
          {checkOut && (
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
