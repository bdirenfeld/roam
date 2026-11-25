import Link from "next/link";
import { bookingsHref, markLabel, marksLabel, type BookingMark } from "@/lib/booking/marks";
import type { RowKey } from "@/lib/booking/checklist";

// The three booking marks in the corner of a journey's photo on Journeys
// (25 Nov 2026, mock approved): flight, hotel, car. Booked is near-white with
// a small green tick; still to book is faint. No circles, no words: three
// versions with chips and labels were each "too aggressive" on the photo.
// One link for all three, to that journey's Bookings on the week. It never
// ticks anything itself (a stray click on Journeys must not mark a flight booked).
//
// The drawings are Google's Material Symbols (outlined, weight 300; Apache 2.0),
// as paths so no icon font is loaded: flight, hotel, directions_car. Brennan,
// 25 Nov 2026: use the icons everyone already knows, do not draw our own.
const PATHS: Record<RowKey, string> = {
  flights: "M294.23-100v-80.77l116.92-82.08v-158.61L100-296.54v-99.23l311.15-218.61v-176.77q0-28.39 20.24-48.62Q451.62-860 480-860t48.61 20.23q20.24 20.23 20.24 48.62v176.77L860-395.77v99.23L548.85-421.46v158.61l116.53 82.08V-100L480-156.16 294.23-100Z",
  stays: "M60-220v-560h60v380h330v-300h310q57.75 0 98.87 41.13Q900-617.75 900-560v340h-60v-120H120v120H60Zm147.5-267.55q-29.81-29.85-29.81-72.5 0-42.64 29.86-72.45 29.85-29.81 72.5-29.81 42.64 0 72.45 29.86 29.81 29.85 29.81 72.5 0 42.64-29.86 72.45-29.85 29.81-72.5 29.81-42.64 0-72.45-29.86ZM510-400h330v-160q0-33-23.5-56.5T760-640H510v240ZM310.04-529.96q12.27-12.27 12.27-30.04t-12.27-30.04q-12.27-12.27-30.04-12.27t-30.04 12.27q-12.27 12.27-12.27 30.04t12.27 30.04q12.27 12.27 30.04 12.27t30.04-12.27ZM280-560Zm230-80v240-240Z",
  car: "M224.61-220v50q0 12.75-8.62 21.37-8.63 8.63-21.38 8.63H170q-12.75 0-21.37-8.63Q140-157.25 140-170v-306.92L221.69-710q4.47-13.77 16.39-21.88Q250-740 264.62-740h432.3q14.04 0 25.5 8.25 11.45 8.25 15.89 21.75L820-476.92V-170q0 12.75-8.63 21.37Q802.75-140 790-140h-24.61q-12.75 0-21.38-8.63-8.62-8.62-8.62-21.37v-50H224.61Zm-.3-316.92h511.38L685.23-680H274.77l-50.46 143.08Zm-24.31 60V-280v-196.92Zm98.55 150.77q21.83 0 37.03-15.29 15.19-15.28 15.19-37.11t-15.28-37.03q-15.29-15.19-37.12-15.19t-37.02 15.28q-15.2 15.29-15.2 37.12t15.29 37.02q15.28 15.2 37.11 15.2Zm363.08 0q21.83 0 37.02-15.29 15.2-15.28 15.2-37.11t-15.29-37.03q-15.28-15.19-37.11-15.19t-37.03 15.28q-15.19 15.29-15.19 37.12t15.28 37.02q15.29 15.2 37.12 15.2ZM200-280h560v-196.92H200V-280Z",
};

/** The room the marks take at the caption's right, so a long caption wraps before them. */
export const MARKS_ROOM = "pr-[112px]";

export default function BookingMarks({ tripId, title, marks }: { tripId: string; title: string; marks: BookingMark[] }) {
  if (marks.length === 0) return null;
  return (
    <Link
      href={bookingsHref(tripId)}
      aria-label={marksLabel(title, marks)}
      data-testid="booking-marks"
      className="absolute right-[10px] bottom-[7px] z-[1] flex items-center gap-[11px] rounded-full px-2 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
    >
      {marks.map((m) => (
        <span key={m.key} title={markLabel(m)} data-mark={m.key} data-booked={m.booked ? "yes" : "no"} className="relative block h-5 w-5">
          <svg aria-hidden="true" viewBox="0 -960 960 960" width="20" height="20" fill="currentColor" style={{ color: m.booked ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.4)" }}>
            <path d={PATHS[m.key]} />
          </svg>
          {m.booked && (
            <span aria-hidden="true" className="absolute -right-[4px] -bottom-[2px] grid h-[9px] w-[9px] place-items-center rounded-full" style={{ background: "#2FA36B" }}>
              <svg viewBox="0 0 10 10" width="7" height="7" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5.2l2 2 4-4.4" /></svg>
            </span>
          )}
        </span>
      ))}
    </Link>
  );
}
