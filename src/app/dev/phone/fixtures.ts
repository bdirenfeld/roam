// ── Fixtures for the phone preview (dev only) ─────────────────────────────
// Generic, invented rows shaped like the live tables (types/database.ts):
// a Tuscany-like journey, the converted overland leg, an Irving-like summit
// for the shared page. No real people, bookings or numbers — the Expedia
// itinerary below is made up and exists to prove it is stripped.
//
// Journey dates that drive a moment (Day 1, Welcome home) are worked out from
// the reader's LOCAL today, the way the components work them out.

import type { Card, Day, DayWithCards, Place, Trip } from "@/types/database";
import { localDate } from "@/lib/isSameLocalDay";

export const OWNER = "owner-preview";
export const TRIP_ID = "trip-preview-tuscany";

export function isoFromToday(offset: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return localDate(d);
}

export function trip(start: string, end: string, over: Partial<Trip> = {}): Trip {
  return {
    id: TRIP_ID, user_id: OWNER, title: "Tuscany", destination: "Florence, Italy",
    destination_lat: 43.7696, destination_lng: 11.2558, start_date: start, end_date: end,
    trip_purpose: null, trip_type: null, cruise: false, party_size: 2, party_ages: null,
    accommodation_name: null, accommodation_address: null, stay_nights: null, booking_checklist: null,
    status: "planning" as Trip["status"], archived: false, archived_at: null, cover_image_url: null,
    notes: null, created_at: "2026-09-01T00:00:00Z",
    ...over,
  };
}

export function days(start: string, n: number, tripId = TRIP_ID): Day[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(start + "T12:00:00");
    d.setDate(d.getDate() + i);
    return {
      id: `day-${i + 1}`, trip_id: tripId, date: localDate(d), day_number: i + 1,
      day_name: null, narrative_position: null, theme: null, created_at: "2026-09-01T00:00:00Z",
    };
  });
}

function place(id: string, over: Partial<Place>): Place {
  return {
    id, title: id, type: "activity", sub_type: null, lat: 43.77, lng: 11.25, address: null,
    google_place_id: null, cover_image_url: null, rating: null, price_level: null, hours: null,
    photo_count: 0, loved: false, ...over,
  };
}

export function card(id: string, dayId: string | null, p: Place, over: Partial<Card> = {}): Card {
  return {
    id, day_id: dayId as string, trip_id: TRIP_ID, list_id: null, start_time: null, end_time: null,
    position: 0, status: "in_itinerary" as Card["status"], source_url: null, details: {} as Card["details"],
    ai_generated: false, confirmed: false, created_at: "2026-09-01T00:00:00Z", place_id: p.id, place: p,
    ...over,
  };
}

// ── Opening hours (Google's shape: weekday_text + periods, 0 = Sunday) ────
const WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function hours(open: string, close: string, closedOn: number[] = []) {
  const fmt = (t: string) => {
    const h = Number(t.slice(0, 2)), m = t.slice(2);
    return `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
  };
  const dayNum = (name: string) => (WEEK.indexOf(name) + 1) % 7;
  return {
    weekday_text: WEEK.map((w) => `${w}: ${closedOn.includes(dayNum(w)) ? "Closed" : `${fmt(open)} – ${fmt(close)}`}`),
    periods: [0, 1, 2, 3, 4, 5, 6].filter((d) => !closedOn.includes(d)).map((d) => ({ open: { day: d, time: open }, close: { day: d, time: close } })),
  };
}
const LUNCH_AND_DINNER = {
  weekday_text: ["Monday: Closed", ...["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((w) => `${w}: 12:30 – 2:30 PM, 7:30 – 10:00 PM`), "Sunday: Closed"],
  periods: [2, 3, 4, 5, 6].flatMap((d) => [
    { open: { day: d, time: "1230" }, close: { day: d, time: "1430" } },
    { open: { day: d, time: "1930" }, close: { day: d, time: "2200" } },
  ]),
};

const NOTE = (lead: string, points: string[]) => `**Intent**\n${lead}\n\n**Know before you go**\n${points.map((p) => `- ${p}`).join("\n")}`;

export const places = {
  uffizi: place("p-uffizi", {
    title: "Uffizi Gallery", sub_type: "self_directed", address: "Piazzale degli Uffizi, 6, 50122 Firenze FI, Italy",
    lat: 43.7678, lng: 11.2553, rating: 4.7, hours: hours("0815", "1830", [1]),
  }),
  trattoria: place("p-trattoria", {
    title: "Trattoria da Piero", type: "food", sub_type: "restaurant", address: "Via dei Neri, 12, 50122 Firenze FI, Italy",
    lat: 43.7686, lng: 11.2577, rating: 4.5, price_level: 2, hours: LUNCH_AND_DINNER,
  }),
  osteria: place("p-osteria", {
    title: "Osteria del Ponte", type: "food", sub_type: "restaurant", address: "Borgo San Jacopo, 4, 50125 Firenze FI, Italy",
    lat: 43.7672, lng: 11.2513, rating: 4.4, price_level: 3, hours: hours("1900", "2300"),
  }),
  pontevecchio: place("p-ponte", { title: "Ponte Vecchio", sub_type: "self_directed", lat: 43.768, lng: 11.2531, address: "Ponte Vecchio, 50125 Firenze FI, Italy" }),
  mercato: place("p-mercato", { title: "Mercato Centrale", type: "food", sub_type: "restaurant", lat: 43.7765, lng: 11.2534, address: "Piazza del Mercato Centrale, 50123 Firenze FI, Italy" }),
  boboli: place("p-boboli", { title: "Giardino di Boboli", sub_type: "self_directed", lat: 43.7625, lng: 11.2486, address: "Piazza Pitti, 1, 50125 Firenze FI, Italy" }),
  winetour: place("p-chianti", { title: "Chianti Wine Tour", sub_type: "guided", lat: 43.58, lng: 11.31, address: "Greve in Chianti, 50022 FI, Italy" }),
  mfuwe: place("p-mfuwe", {
    title: "Mfuwe", type: "logistics", sub_type: "transit", address: "Mfuwe, Zambia",
    lat: -13.2549974, lng: 31.9326952,
  }),
};

/** The converted overland leg: Lusaka → Mfuwe, 6 AM – 7 PM. */
export function truckLeg(dayId: string): Card {
  return card("c-leg", dayId, places.mfuwe, {
    start_time: "06:00:00", end_time: "19:00:00", position: 0,
    details: {
      title: "Lusaka → Mfuwe", named: true, mode: "drive", mode_label: "Overland truck",
      from: { title: "Lusaka", lat: -15.4154677, lng: 28.2773267 },
    } as unknown as Card["details"],
  });
}

/** A Tuscany-like day: two timed stops, the leg, and three with no time yet. */
export function tuscanyDay(day: Day): DayWithCards {
  const c = (id: string, p: Place, start: string | null, end: string | null, pos: number, note?: string) =>
    card(id, day.id, p, { start_time: start, end_time: end, position: pos, details: (note ? { notes: note } : {}) as Card["details"] });
  return {
    ...day,
    cards: [
      truckLeg(day.id),
      c("c-uffizi", places.uffizi, "09:00:00", "11:00:00", 1, NOTE("The Renaissance in one building: Botticelli, Leonardo, Caravaggio.", ["Timed entry; arrive ten minutes early."])),
      c("c-lunch", places.trattoria, "12:45:00", "14:00:00", 2),
      c("c-ponte", places.pontevecchio, null, null, 3),
      c("c-mercato", places.mercato, null, null, 4),
      c("c-boboli", places.boboli, null, null, 5),
    ],
  };
}

/** A day in Florence whose 2nd and 4th stops are next door on Via dei Neri, so
 * the strip shows them side by side (8 Oct 2026). Coordinates are the real shops'. */
export function nextDoorDay(day: Day): DayWithCards {
  const c = (id: string, p: Place, start: string | null, pos: number) =>
    card(id, day.id, p, { start_time: start, position: pos });
  return {
    ...day,
    cards: [
      c("n-girone", place("p-girone", { title: "I' Girone De' Ghiotti", sub_type: "self_directed", lat: 43.7705273, lng: 11.2556892 }), "09:45:00", 1),
      c("n-panetteria", place("p-panetteria", { title: "Panetteria De Neri", type: "food", sub_type: "restaurant", lat: 43.7679671, lng: 11.2588158 }), "12:30:00", 2),
      c("n-buca", place("p-buca", { title: "Buca dell'Orafo", type: "food", sub_type: "restaurant", lat: 43.768454, lng: 11.253986 }), "13:45:00", 3),
      c("n-gelato", place("p-gelato", { title: "Gelateria dei Neri", type: "food", sub_type: "dessert", lat: 43.7677669, lng: 11.2590689 }), "20:30:00", 4),
    ],
  };
}

/** A Lucca day like Brennan's Tuesday (8 Oct 2026): six stops in the old town
 * and the villa (stop 4) out in the hills, so zoomed to the whole day the town's
 * six crowd into one pile — "1–3 · 5–7", the villa apart. */
export function luccaDay(day: Day): DayWithCards {
  const c = (id: string, p: Place, start: string, pos: number) => card(id, day.id, p, { start_time: start, position: pos });
  return {
    ...day,
    cards: [
      c("l-pinelli", place("p-pinelli", { title: "Pinelli Bakery", type: "food", sub_type: "coffee", lat: 43.8420969, lng: 10.5029626 }), "09:00:00", 8),
      c("l-michele", place("p-michele", { title: "Piazza San Michele", sub_type: "self_directed", lat: 43.8430907, lng: 10.5031507 }), "10:00:00", 4),
      c("l-buca", place("p-bucasa", { title: "Buca di Sant'Antonio", type: "food", sub_type: "restaurant", lat: 43.842762, lng: 10.5016987 }), "12:45:00", 5),
      c("l-villa", place("p-villa", { title: "Villa Zambaldi", type: "logistics", sub_type: "hotel", lat: 43.8298808, lng: 10.4497198 }), "14:00:00", 2),
      c("l-taddeucci", place("p-taddeucci", { title: "Buccellato Taddeucci", type: "food", sub_type: "dessert", lat: 43.842987, lng: 10.5031921 }), "15:15:00", 6),
      c("l-fillungo", place("p-fillungo", { title: "Via Fillungo", sub_type: "shopping", lat: 43.8453423, lng: 10.5049652 }), "16:00:00", 3),
      c("l-ciacco", place("p-ciacco", { title: "Ciacco", type: "food", sub_type: "restaurant", lat: 43.841865, lng: 10.5026964 }), "19:30:00", 7),
    ],
  };
}

/** The journey around nextDoorDay: its own stops, another day's, and saved places. */
export function nextDoorJourney(ds: Day[]): Card[] {
  const saved = (id: string, p: Place) => card(id, null, p, { status: "interested" as Card["status"] });
  return [
    ...nextDoorDay(ds[0]).cards,
    // Saved before it went on the day: the same place twice, one pin on the map.
    saved("n-pan-saved", place("p-panetteria", { title: "Panetteria De Neri", type: "food", sub_type: "restaurant", lat: 43.7679671, lng: 11.2588158 })),
    card("n-david", ds[1].id, place("p-david", { title: "David", sub_type: "guided", lat: 43.7767194, lng: 11.2593217 }), { start_time: "10:00:00" }),
    saved("n-gilli", place("p-gilli", { title: "Caffè Gilli", type: "food", sub_type: "coffee", lat: 43.7719748, lng: 11.2541636 })),
    saved("n-repubblica", place("p-repubblica", { title: "Piazza della Repubblica", sub_type: "self_directed", lat: 43.7715112, lng: 11.2539314 })),
    saved("n-vivoli", place("p-vivoli", { title: "Vivoli", type: "food", sub_type: "dessert", lat: 43.7699351, lng: 11.2600892 })),
    saved("n-duomo", place("p-duomo", { title: "Santa Maria del Fiore", sub_type: "guided", lat: 43.773145, lng: 11.2559602 })),
    saved("n-vini", place("p-vini", { title: "Vini e Vecchi Sapori", type: "food", sub_type: "restaurant", lat: 43.7700901, lng: 11.2568157 })),
  ];
}

/** Every card of the journey, the shape DayViewClient's journey reads ask for. */
export function journeyCards(ds: Day[]): Card[] {
  return [
    ...tuscanyDay(ds[0]).cards,
    card("c-d2", ds[1].id, { ...places.winetour, loved: true }),
    card("c-d3", ds[2].id, { ...places.osteria, loved: true }),
  ];
}

// ── Card sheet cases (fixed dates: Mon 23 Aug / Tue 24 Aug 2027) ──────────
export const SHEET_DAYS: Day[] = [
  { id: "d-mon", trip_id: TRIP_ID, date: "2027-08-23", day_number: 1, day_name: null, narrative_position: null, theme: null, created_at: "" },
  { id: "d-tue", trip_id: TRIP_ID, date: "2027-08-24", day_number: 2, day_name: null, narrative_position: null, theme: null, created_at: "" },
];

export const sheetCards = {
  cost: card("s-cost", "d-tue", places.winetour, {
    start_time: "10:00:00", end_time: "15:00:00",
    details: { notes: NOTE("Half a day among the vines south of Florence, with lunch at the estate.", ["Pick-up from the hotel at 9:30."]), cost_per_person: 29 } as unknown as Card["details"],
  }),
  closed: card("s-closed", "d-mon", places.uffizi, {
    start_time: "10:00:00", end_time: "12:00:00",
    details: { notes: NOTE("The Renaissance in one building.", ["Timed entry; book ahead in summer."]) } as unknown as Card["details"],
  }),
  late: card("s-late", "d-tue", places.osteria, {
    start_time: "21:30:00", end_time: "23:30:00",
    details: { notes: NOTE("A late table by the river.", ["The kitchen takes last orders at 10:15 PM."]) } as unknown as Card["details"],
  }),
  fit: card("s-fit", "d-tue", places.trattoria, {
    start_time: "12:45:00", end_time: "14:00:00",
    details: { notes: NOTE("A family trattoria a street back from the river.", ["Booking ahead is advised for lunch.", "Open 12:30 – 2:30 PM, 7:30 – 10:00 PM that day"]) } as unknown as Card["details"],
  }),
  leg: truckLeg("d-tue"),
};

export const timeCard = card("t-uffizi", "d-tue", places.uffizi, { start_time: "10:00:00", end_time: "11:30:00" });

// ── Bookings ──────────────────────────────────────────────────────────────
/** The tables ToBookSection reads; nothing on the days is a booking, so all three rows are open. */
export function bookingTables(checklist: Record<string, unknown> | null): Record<string, unknown[]> {
  const start = "2027-08-24", ds = days(start, 7);
  return {
    trips: [{ ...trip(start, "2027-08-30", { booking_checklist: checklist as Trip["booking_checklist"] }), party_size: 2 }],
    days: ds.map((d) => ({ id: d.id, date: d.date })),
    cards: [card("b-uffizi", ds[1].id, places.uffizi), card("b-osteria", ds[2].id, places.osteria)].map((c) => ({
      ...c, place: { sub_type: c.place!.sub_type, title: c.place!.title, address: c.place!.address },
    })),
    people: [],
    users: [{ home_airport: "YYZ", home_country: "CA", passport_country: null }],
    documents: [],
    card_attachments: [],
  };
}

// ── The shared page: an Irving-like summit ────────────────────────────────
// Raw card rows as the shared page's query returns them; page.tsx maps them
// with the same functions app/journey/[token]/page.tsx uses.
export const FAKE_ITINERARY = "73500000000042";

export function sharedRows() {
  const ds = days(isoFromToday(-1), 3, "trip-preview-irving");
  const hotel = { title: "Lakeside Hotel", sub_type: "hotel", address: "222 W Las Colinas Blvd, Irving, TX", photo_cache: null };
  const venue = { title: "Irving Convention Center", sub_type: "event", address: "500 W Las Colinas Blvd, Irving, TX", photo_cache: null };
  const rows = [
    { id: "r-hotel", day_id: ds[0].id, start_time: "15:00:00", end_time: null, position: 0, place: hotel,
      details: { notes: `Suite, 1 King Bed, 2 adults, nonsmoking, Expedia itinerary: ${FAKE_ITINERARY}\nCheck in from 3 pm. Parking in the garage.` } },
    { id: "r-summit", day_id: ds[1].id, start_time: "09:00:00", end_time: "17:00:00", position: 0, place: venue,
      details: { title: "Annual Tech Summit", named: true, notes: "Badges at the north entrance. Lunch is provided." } },
    { id: "r-dinner", day_id: ds[1].id, start_time: "19:00:00", end_time: null, position: 1,
      place: { title: "Ristorante Sette", sub_type: "restaurant", address: "Las Colinas, Irving, TX", photo_cache: null },
      details: { notes: "Table for six under the host's name." } },
  ];
  return { days: ds, rows };
}

// ── Adding a leg by hand (7 Oct 2026, mock t05) ───────────────────────────
// The Add-to-this-day sheet on Tue 24 Aug, a bus station picked. With a stay
// on Mon 23 Aug, From starts at it (last night's stay) and the pills show;
// without one, only From shows.
export const ADD_LEG_DAY = "d-tue";
export function addLegTables(withStay: boolean): Record<string, unknown[]> {
  const camp = place("p-camp", { title: "Eureka Camping Park", type: "logistics", sub_type: "hotel", lat: -15.5035103, lng: 28.2645026 });
  return {
    days: SHEET_DAYS.map((d) => ({ id: d.id, date: d.date })),
    cards: withStay ? [card("s-camp", "d-mon", camp, { start_time: "17:00:00" })] : [],
  };
}
export const ADD_LEG_API = {
  "/api/places/autocomplete": {
    predictions: [{ place_id: "g-mfuwe-bus", description: "Mfuwe Bus Station, Mfuwe, Zambia", structured_formatting: { main_text: "Mfuwe Bus Station", secondary_text: "Mfuwe, Zambia" } }],
  },
  "/api/places/details": {
    result: { name: "Mfuwe Bus Station", formatted_address: "Mfuwe, Zambia", geometry: { location: { lat: -13.2549974, lng: 31.9326952 } }, types: ["bus_station"] },
  },
};

// ── Copy to new dates (7 Oct 2026) ─────────────────────────────────────────
// A past long weekend like New York (Mia & Daddy): Thursday to Sunday, a
// grown-up and a kid, three places saved on the map. Dated in 2026 so it is
// past; the sheet is pinned to "today" so its suggested start is fixed.
export const COPY_TODAY = "2026-10-07";
export const pastTrip = (): Trip => trip("2026-07-23", "2026-07-26", {
  id: "trip-preview-ny", title: "New York (Mia & Daddy)", destination: "New York, NY, USA",
  destination_lat: 40.7128, destination_lng: -74.006, party_size: 2, party_ages: [42, 7],
});
export function copyTables() {
  const saved = ["Sloomoo Institute", "Joe's Pizza", "The High Line"].map((title, i) => ({ id: `saved-${i}`, status: "interested", archived: false, place_id: `place-${i}`, title }));
  return { cards: saved, trips: [pastTrip()] };
}

// ── The full Map (FullMapClient) ──────────────────────────────────────────
/** Saved pins around Florence and one scheduled on Day 1; `one` = a single saved pin (removing it empties the map). */
export function mapCards(ds: Day[], one = false): Card[] {
  const saved = (id: string, p: Place) => card(id, null, p, { status: "interested" as Card["status"] });
  if (one) return [saved("m-uffizi", places.uffizi)];
  return [
    saved("m-uffizi", places.uffizi),
    saved("m-trattoria", places.trattoria),
    saved("m-boboli", places.boboli),
    card("m-ponte", ds[0].id, places.pontevecchio, { start_time: "16:00:00", end_time: "17:00:00" }),
  ];
}
