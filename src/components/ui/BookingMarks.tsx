import Link from "next/link";
import { markLabel, marksLabel, type BookingMark } from "@/lib/booking/marks";
import type { RowKey } from "@/lib/booking/checklist";

// The three booking marks beside a journey's name on Journeys
// (25 Nov 2026, mock approved): flight, hotel, car. Booked is near-white with
// a small green tick; still to book is faint. No circles, no words: three
// versions with chips and labels were each "too aggressive" on the photo.
// One link for all three, to that journey's Bookings on the week. It never
// ticks anything itself (a stray click on Journeys must not mark a flight booked).
//
// The drawings are Google's Material Symbols (weight 300; Apache 2.0), each in its outline and its filled form,
// as paths so no icon font is loaded: flight, hotel, directions_car. Brennan,
// 25 Nov 2026: use the icons everyone already knows, do not draw our own.
const PATHS: Record<RowKey, string> = {
  flights: "M294.23-100v-80.77l116.92-82.08v-158.61L100-296.54v-99.23l311.15-218.61v-176.77q0-28.39 20.24-48.62Q451.62-860 480-860t48.61 20.23q20.24 20.23 20.24 48.62v176.77L860-395.77v99.23L548.85-421.46v158.61l116.53 82.08V-100L480-156.16 294.23-100Z",
  stays: "M60-220v-560h60v380h330v-300h310q57.75 0 98.87 41.13Q900-617.75 900-560v340h-60v-120H120v120H60Zm147.5-267.55q-29.81-29.85-29.81-72.5 0-42.64 29.86-72.45 29.85-29.81 72.5-29.81 42.64 0 72.45 29.86 29.81 29.85 29.81 72.5 0 42.64-29.86 72.45-29.85 29.81-72.5 29.81-42.64 0-72.45-29.86ZM510-400h330v-160q0-33-23.5-56.5T760-640H510v240ZM310.04-529.96q12.27-12.27 12.27-30.04t-12.27-30.04q-12.27-12.27-30.04-12.27t-30.04 12.27q-12.27 12.27-12.27 30.04t12.27 30.04q12.27 12.27 30.04 12.27t30.04-12.27ZM280-560Zm230-80v240-240Z",
  car: "M224.61-220v50q0 12.75-8.62 21.37-8.63 8.63-21.38 8.63H170q-12.75 0-21.37-8.63Q140-157.25 140-170v-306.92L221.69-710q4.47-13.77 16.39-21.88Q250-740 264.62-740h432.3q14.04 0 25.5 8.25 11.45 8.25 15.89 21.75L820-476.92V-170q0 12.75-8.63 21.37Q802.75-140 790-140h-24.61q-12.75 0-21.38-8.63-8.62-8.62-8.62-21.37v-50H224.61Zm-.3-316.92h511.38L685.23-680H274.77l-50.46 143.08Zm-24.31 60V-280v-196.92Zm98.55 150.77q21.83 0 37.03-15.29 15.19-15.28 15.19-37.11t-15.28-37.03q-15.29-15.19-37.12-15.19t-37.02 15.28q-15.2 15.29-15.2 37.12t15.29 37.02q15.28 15.2 37.11 15.2Zm363.08 0q21.83 0 37.02-15.29 15.2-15.28 15.2-37.11t-15.29-37.03q-15.28-15.19-37.11-15.19t-37.03 15.28q-15.19 15.29-15.19 37.12t15.28 37.02q15.29 15.2 37.12 15.2ZM200-280h560v-196.92H200V-280Z",
};

// The filled forms of the same three symbols ("fill1"), for a row that is booked.
const FILLED: Record<RowKey, string> = {
  flights: "M280-80v-100l120-84v-144L80-280v-120l320-224v-176q0-33 23.5-56.5T480-880q33 0 56.5 23.5T560-800v176l320 224v120L560-408v144l120 84v100l-200-60-200 60Z",
  stays: "M40-200v-600h80v400h320v-320h320q66 0 113 47t47 113v360h-80v-120H120v120H40Zm155-275q-35-35-35-85t35-85q35-35 85-35t85 35q35 35 35 85t-35 85q-35 35-85 35t-85-35Z",
  car: "M240-200v40q0 17-11.5 28.5T200-120h-40q-17 0-28.5-11.5T120-160v-320l84-240q6-18 21.5-29t34.5-11h440q19 0 34.5 11t21.5 29l84 240v320q0 17-11.5 28.5T800-120h-40q-17 0-28.5-11.5T720-160v-40H240Zm-8-360h496l-42-120H274l-42 120Zm68 240q25 0 42.5-17.5T360-380q0-25-17.5-42.5T300-440q-25 0-42.5 17.5T240-380q0 25 17.5 42.5T300-320Zm360 0q25 0 42.5-17.5T720-380q0-25-17.5-42.5T660-440q-25 0-42.5 17.5T600-380q0 25 17.5 42.5T660-320Z",
};

// Where they sit (25 Nov 2026, his rulings in order): the photo's bottom corner on
// a computer and its top corner on a phone both "looked weird", floating away
// from the journey they describe. They follow the journey's NAME, in its
// heading, on a phone and a computer alike, and wrap with it as one piece.
//
// How booked is shown, after four tries the same day: a tick in a green dot
// "competed with the name of the trip"; a plain green dot was "pretty bad. It's
// just a green dot"; a tick beside each icon made the row "too wide"; green
// icons he thought the worst (and green on Tuscany's hills is hard to read).
// What stayed is the phone's own on/off convention: booked is the FILLED
// drawing in white, not booked is the OUTLINE, faint. Shape and brightness
// both change, nothing is added beside or on top of an icon, and the only
// colour on the card is still the photograph. Do not add a dot, a tick or
// green back.
//
// Where they sit, FINAL (same day, after beside-the-name went live): the photo's
// top LEFT, "on the same line as the three dots on the far right". So the group
// is the same box as TripCard's ⋯ button (top-1, h-9), mirrored to the left, and
// wears the same soft shadow, since the top of a photo is often bright sky.
// Its 8px of side padding puts the first icon over the caption's left edge.
// Swapped the same evening from his mock ("Build and swap"): the icons are at
// the top RIGHT and the ⋯ at the top left, still on one line.
// Back to the left on the 26th: "the icons at the top left and the three dots
// at the top right", phone and computer alike. FINAL; do not swap them again unasked.
const GROUP = "pointer-events-auto absolute left-[9px] top-1 z-[1] flex h-9 items-center gap-[10px] whitespace-nowrap rounded-full px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white";
const SHADOW = { filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.55))" } as const;

export default function BookingMarks({ title, marks, href }: { title: string; marks: BookingMark[]; /** Bookings for this journey; null draws the marks without a link. */ href: string | null }) {
  if (marks.length === 0) return null;
  const shared = { "aria-label": marksLabel(title, marks), "data-testid": "booking-marks", className: GROUP, style: SHADOW };
  const icons = (
    <>
      {/* The 36px box reaches 44 for a thumb, the same way the ⋯ does. */}
      <span aria-hidden="true" data-testid="booking-marks-target" className="absolute inset-x-0 -inset-y-1" />
      {marks.map((m) => (
        <span key={m.key} title={markLabel(m)} data-mark={m.key} data-booked={m.booked ? "yes" : "no"} data-drawn={m.booked ? "filled" : "outline"} className="relative block h-[15px] w-[15px]">
          <svg aria-hidden="true" viewBox="0 -960 960 960" width="15" height="15" fill="currentColor" style={{ color: m.booked ? "rgb(255, 255, 255)" : "rgba(255, 255, 255, 0.5)" }}>
            <path d={(m.booked ? FILLED : PATHS)[m.key]} />
          </svg>
        </span>
      ))}
    </>
  );
  return href ? <Link href={href} {...shared}>{icons}</Link> : <span role="img" {...shared}>{icons}</span>;
}
