// ── /dev/phone/[screen]: real phone screens over fixture data ────────────
// Dev only: a 404 unless `next dev` (../devOnly.ts, checked by
// ../devOnly.test.ts). No account, no database, no network — the client
// screens run on ../stub.ts, the shared page on rows built here.
//
//   /dev/phone/day             Day 1 of a Tuscany-like journey: timed + untimed + an overland leg
//   /dev/phone/day-welcome     two days after the journey: Welcome home
//   /dev/phone/card-cost       card sheet: €29 × 2
//   /dev/phone/card-closed     card sheet: closed on the card's Monday
//   /dev/phone/card-late       card sheet: finishing after it closes
//   /dev/phone/card-fit        card sheet: a visit that fits (Hours row at the bottom)
//   /dev/phone/card-leg        card sheet: Lusaka → Mfuwe
//   /dev/phone/time            time sheet
//   /dev/phone/time-cleared    time sheet after Clear time
//   /dev/phone/bookings-open | bookings-asking | bookings-booked
//   /dev/phone/shared          the shared journey page
//   /dev/phone/toasts | toasts-second
//
// scripts/phone-check.mjs screenshots and measures every one at 375 px.

import { notFound } from "next/navigation";
import SharedItinerary, { type SharedCard, type SharedDay } from "@/app/journey/[token]/SharedItinerary";
import { tonightByDay } from "@/lib/sharedItinerary";
import { guestCardText } from "@/lib/share/bookingNumbers";
import { agendaOrder } from "@/lib/agendaOrder";
import { cardTimes } from "@/lib/cardTime";
import { devPreviewAllowed } from "../devOnly";
import { isClientScreen } from "../screens";
import { sharedRows } from "../fixtures";
import PhoneHarnessLoader from "../PhoneHarnessLoader";

export const dynamic = "force-dynamic";

/** The shared page's own mapping (app/journey/[token]/page.tsx), over fixture rows. */
function sharedJourney() {
  const { days: ds, rows } = sharedRows();
  const hotels = rows
    .filter((c) => c.place?.sub_type === "hotel")
    .map((c) => ({ dayId: c.day_id, name: c.place?.title ?? null, address: c.place?.address ?? null, note: guestCardText(c.details).note }));
  const tonight = tonightByDay(ds.map((d) => ({ id: d.id, dayNumber: d.day_number })), hotels, null);
  const days: SharedDay[] = ds.map((d) => ({ id: d.id, date: d.date, dayNumber: d.day_number, title: d.theme, tonight: tonight.get(d.id) ?? null }));
  const cards: SharedCard[] = [...rows]
    .sort(agendaOrder)
    .map((c) => ({ c, text: guestCardText(c.details) }))
    .map(({ c, text }) => ({
      id: c.id,
      dayId: c.day_id,
      ...cardTimes(c),
      noteTitle: text.title,
      note: text.note,
      place: c.place
        ? { title: text.named && text.title ? text.title : c.place.title, sub_type: c.place.sub_type, address: c.place.address, photo: null }
        : null,
    }));
  return {
    title: "Irving summit", destination: "Irving, TX, USA", startDate: ds[0].date, endDate: ds[ds.length - 1].date,
    cover: null, host: "Alex Example", entry: [], days, cards,
  };
}

export default async function PhonePreviewPage({ params }: { params: Promise<{ screen: string }> }) {
  if (!devPreviewAllowed()) notFound();
  const { screen } = await params;
  if (screen === "shared") return <div data-phone-screen="shared"><SharedItinerary token="preview" journey={sharedJourney()} /></div>;
  if (!isClientScreen(screen)) notFound();
  return <PhoneHarnessLoader screen={screen} />;
}
