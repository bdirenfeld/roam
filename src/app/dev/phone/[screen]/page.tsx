// ── /dev/phone/[screen]: real phone screens over fixture data ────────────
// Dev only: a 404 unless `next dev` (../devOnly.ts, checked by
// ../devOnly.test.ts). No account, no database, no network — the client
// screens run on ../stub.ts, the shared page on rows built here.
//
//   /dev/phone/day             Day 1 of a Tuscany-like journey: timed + untimed + an overland leg
//   /dev/phone/day-welcome     two days after the journey: Welcome home
//   /dev/phone/day-nextdoor    a Florence day over real tiles: stops 2 and 4 next door, side by side
//   /dev/phone/day-map         the same day with its map opened in place: every saved place, the day numbered
//   /dev/phone/day-map-trip    …then the same day tapped again: the whole trip, nothing muted
//   /dev/phone/day-map-next    …then the next day tapped: the map goes there
//   /dev/phone/day-lucca | day-lucca-map   Brennan's Lucca Tuesday: six town stops pile as "1–3 · 5–7", the villa apart
//   /dev/phone/card-cost       card sheet: €29 × 2
//   /dev/phone/card-closed     card sheet: closed on the card's Monday
//   /dev/phone/card-late       card sheet: finishing after it closes
//   /dev/phone/card-fit        card sheet: a visit that fits (Hours row at the bottom)
//   /dev/phone/card-leg        card sheet: Lusaka → Mfuwe (the slim sheet, mock t05)
//   /dev/phone/add-leg         Add to this day, a bus station picked, no stay the night before: From only
//   /dev/phone/add-leg-from    the same with last night's stay: From set, four pills, none picked
//   /dev/phone/time            time sheet
//   /dev/phone/time-cleared    time sheet after Clear time
//   /dev/phone/bookings-open | bookings-asking | bookings-booked
//   /dev/phone/shared          the shared journey page
//   /dev/phone/toasts | toasts-second
//   /dev/phone/map | map-one    the full Map over real Mapbox tiles: four pins, or one (removing it empties the map)
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
