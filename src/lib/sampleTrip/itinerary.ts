// The sample journey a brand-new user opens with one tap ("Example" on the
// first Journeys screen): Paris and Normandy, 8 days, a family of four
// (Brennan, 24 Nov 2026; it replaced a 3-day Lisbon). It is there to show what
// Roam holds: flights with their length, trains and drives, a rental car, two
// hotels, timed tickets, notes, what to bring, costs and saved ideas.
// Layout only: the matching enriched rows live in places.json (a snapshot of a
// real bulk-import), keyed by google_place_id. Bookings are made up and say so.
//
// Days run Thursday to Thursday on purpose: the Louvre shuts on Tuesday,
// Versailles on Monday, Le Pommier on Wednesday. plan.ts picks the dates.

// The paywall trigger (migration 021) matches this title. Do not change it alone.
export const SAMPLE_TITLE = "Sample trip — look around";
export const SAMPLE_NAME = "Paris and Normandy";
export const SAMPLE_DESTINATION = { name: "Paris, France", lat: 48.8566, lng: 2.3522 };
export const SAMPLE_COVER =
  "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1080&q=80&fm=jpg&fit=crop";
export const SAMPLE_PARTY = { size: 4, ages: [41, 40, 10, 7] };

export const P = {
  cdg: "ChIJW89MjgM-5kcRLKZbL5jgKwQ",
  yyz: "ChIJkdQtwEo5K4gRxQ4DxOldHbQ",
  balcons: "ChIJeVDcFtxx5kcRLhlKTuUzc_g",
  villaLara: "ChIJ4SUijaysC0gRJpVfN9KJny0",
  hertz: "ChIJ0xieFvcV5kcRP5q5yKgg_z4",
  breizh: "ChIJ1ROhrt5x5kcRTCgY8BeuTeQ",
  chartier: "ChIJ4xutfT5u5kcRaJn2NkiOhPU",
  entrecote: "ChIJzaRYiNdx5kcRlxQ89kuogt0",
  angelina: "ChIJWVhEdi5u5kcRRl0Vdpqt7RI",
  petiteVenise: "ChIJ-ac2pb595kcRQI8UCESSNl0",
  baudy: "ChIJS7OD3gPJ5kcREyRsi_9E2-w",
  pommier: "ChIJnxw3BaysC0gRuQf-wNAbnZ8",
  angle: "ChIJWaD_b6usC0gRAWiM0sIvn78",
  poulard: "ChIJI-zmL-CK3EcReXb-UjZ_sZs",
  luxembourg: "ChIJe2jeNttx5kcRi_mJsGHdkQc",
  eiffel: "ChIJLU7jZClu5kcR4PcOOO6p3I0",
  champ: "ChIJB0gcnCBw5kcRHoIAPcTEApc",
  bateaux: "ChIJA2WozONv5kcRDN_4jmUSXBk",
  versailles: "ChIJdUyx15R95kcRj85ZX8H8OAU",
  louvre: "ChIJD3uTd9hx5kcR1IQvGfr8dbk",
  tuileries: "ChIJAQAAMCxu5kcRx--_4QnbGcI",
  monet: "ChIJe_U29f7I5kcR9t9laCm2xXc",
  abbey: "ChIJHdzEgyGpDkgR4cESJdSzFjU",
  invalides: "ChIJ_Sm92nRv5kcRQhXnVABtXL4",
  versaillesStation: "ChIJd3F-awB95kcREs6WWuw9RvI",
  omaha: "ChIJ26VqJyCoC0gRBQkjfwSb9YU",
  honfleur: "ChIJO_JpuLsz4EcRM0abrvMidZI",
  orsay: "ChIJG5Qwtitu5kcR2CNEsYy9cdA",
  sacre: "ChIJ442GNENu5kcRGYUrvgqHw88",
  disney: "ChIJveJ6yhkd5kcRYOYQY8v4-lc",
  monoprix: "ChIJV4sNe9dx5kcRr6_zTo5pRb0",
  pharmacy: "ChIJ4eufsN5x5kcRYnIDsvx7w7M",
  hospital: "ChIJiY8wITJw5kcR2ecDs-WnVwA",
  clinic: "ChIJLbjLW0pu5kcRKLicFKviYs0",
  hospitalBayeux: "ChIJLZ5cVKysC0gRnpEguXvGe7M",
  carrefour: "ChIJUyXbzlOrC0gRof69y-Hvgpg",
  books: "ChIJ_7ZXHuFx5kcRs1LnTeCsOBM",
  flore: "ChIJq537gddx5kcR_3PhRd2muxg",
  poilane: "ChIJSdy60tZx5kcR0F5YEiQhLcI",
  berthillon: "ChIJaxE1EONx5kcRSm1sFRqBUTM",
  harrys: "ChIJu0Sg-TBu5kcRUIDfQSE4_yw",
  aligre: "ChIJ2TZHQgBz5kcR8otjEHa3hLw",
  menagerie: "ChIJjVddOvBx5kcRTbHAUElCG_E",
  omahaBeach: "ChIJe7CXGggIC0gRkh3oZKtEK2U",
  etretat: "ChIJ3elDchIX4EcREd7-cbVGpeY",
  moulin: "ChIJiQxv_05u5kcRESFIh6-QTvQ",
  hammam: "ChIJy8vt7_Fx5kcR-ly1j4WDVEo",
} as const;

export interface SampleCard {
  /** A place card; none on a note or a leg. */
  googlePlaceId?: string;
  /** A move between two places: the card ends at `to`. */
  leg?: { from: string; to: string; fromTitle: string; toTitle: string; mode: "drive" | "train" };
  startTime?: string;
  endTime?: string;
  confirmed?: boolean;
  /** Dates in details, as a day index into the trip (0 = first day). */
  dayDetails?: Record<string, number>;
  details?: Record<string, unknown>;
  /** The page that made you want to go: a TikTok, an article. */
  sourceUrl?: string;
}

const EXAMPLE = "Made up for this example.";

export const SAMPLE_DAYS: SampleCard[][] = [
  // Thu: fly
  [
    { googlePlaceId: P.cdg, startTime: "19:30", endTime: "08:30", confirmed: true,
      details: { title: "Fly to Paris", named: true, airline: "Example Air", flight_number: "EX 872", origin_airport: "Toronto Pearson (YYZ)", arriving_at: "Paris Charles de Gaulle (CDG)", confirmation: "EXAMPLE1", notes: EXAMPLE, prep: "Pyjamas and a toothbrush for each kid in the carry-on." } },
  ],
  // Fri: land and rest
  [
    { leg: { from: P.cdg, to: P.balcons, fromTitle: "Charles de Gaulle", toTitle: "Grand Hôtel des Balcons", mode: "train" }, startTime: "10:00", endTime: "11:00",
      details: { notes: "RER B to Luxembourg, then a short walk." } },
    { startTime: "12:00", details: { title: "Lunch from a bakery", notes: "Nothing booked today. Everyone will be tired." } },
    { googlePlaceId: P.balcons, startTime: "15:00", confirmed: true, dayDetails: { check_out: 5 },
      details: { confirmation: "EXAMPLE2", notes: `Four nights. ${EXAMPLE}` } },
    { googlePlaceId: P.luxembourg, startTime: "16:00", endTime: "17:30",
      details: { notes: "Playground and toy boats on the pond. Keeps everyone awake until dinner.", prep: "A few coins for the toy boats." } },
    { googlePlaceId: P.breizh, startTime: "18:00", details: { recommended_by: "Sarah", notes: "Crêpes for an easy first dinner." } },
  ],
  // Sat: Eiffel Tower and the river
  [
    { googlePlaceId: P.eiffel, startTime: "09:30", endTime: "11:30", confirmed: true,
      details: { confirmation: "EXAMPLE3", cost_per_person: 30, notes: `Timed ticket. ${EXAMPLE}`, prep: "Light jackets: it is windy at the top." } },
    { googlePlaceId: P.champ, startTime: "12:30", endTime: "14:00", details: { notes: "Picnic on the grass under the tower.", prep: "Blanket, water, something from the bakery." } },
    { googlePlaceId: P.bateaux, startTime: "14:30", endTime: "15:30", details: { cost_per_person: 18, notes: "An hour on the Seine, sitting down." } },
    { googlePlaceId: P.chartier, startTime: "18:00", details: { notes: "Classic, loud and quick. Good with kids." } },
  ],
  // Sun: Versailles, the big day
  [
    { leg: { from: P.invalides, to: P.versaillesStation, fromTitle: "Gare des Invalides", toTitle: "Versailles", mode: "train" }, startTime: "09:00", endTime: "09:45",
      details: { notes: "RER C to Versailles Château Rive Gauche." } },
    { googlePlaceId: P.versailles, startTime: "10:00", endTime: "12:00", confirmed: true,
      details: { confirmation: "EXAMPLE4", cost_per_person: 32, notes: `Timed ticket. Start with the Hall of Mirrors. ${EXAMPLE}`, prep: "Comfortable shoes and full water bottles." } },
    { googlePlaceId: P.petiteVenise, startTime: "12:30", details: { notes: "Lunch in the gardens." } },
    { startTime: "14:00", endTime: "15:00", details: { title: "Rowboats on the Grand Canal", notes: "Skip it if it rains." } },
    { leg: { from: P.versaillesStation, to: P.invalides, fromTitle: "Versailles", toTitle: "Gare des Invalides", mode: "train" }, startTime: "16:00", endTime: "16:45" },
    { startTime: "18:00", details: { title: "Easy dinner near the hotel", notes: "Long day. Takeout is fine." } },
  ],
  // Mon: the Louvre, a lighter day
  [
    { googlePlaceId: P.louvre, sourceUrl: "https://www.tiktok.com/@museelouvre", startTime: "09:30", endTime: "12:00", confirmed: true,
      details: { confirmation: "EXAMPLE5", cost_per_person: 22, notes: `Timed ticket. Pick five things and leave. ${EXAMPLE}`, prep: "Pencils and paper so the kids can draw." } },
    { googlePlaceId: P.angelina, startTime: "12:30", details: { notes: "Lunch, then the hot chocolate." } },
    { googlePlaceId: P.tuileries, startTime: "14:00", endTime: "16:00", details: { notes: "Fountains, chairs and room to run." } },
    { googlePlaceId: P.entrecote, startTime: "18:30", details: { notes: "Steak and fries. Arrive at opening." } },
  ],
  // Tue: the car, Giverny, Bayeux
  [
    { leg: { from: P.balcons, to: P.hertz, fromTitle: "Grand Hôtel des Balcons", toTitle: "Charles de Gaulle", mode: "train" }, startTime: "08:00", endTime: "09:00" },
    { googlePlaceId: P.hertz, startTime: "09:00", endTime: "09:30", confirmed: true, dayDetails: { drop_off: 7 },
      details: { title: "Pick up the rental car", named: true, company: "Hertz", car_class: "Mid-size, 4 bags", drop_off_location: "Charles de Gaulle Airport", confirmation: "EXAMPLE6", paid_total: 260, paid_currency: "EUR", fuel_policy: "Return it full", notes: EXAMPLE, prep: "Driver's licence, credit card, booster seat for the 7-year-old." } },
    { leg: { from: P.hertz, to: P.monet, fromTitle: "Charles de Gaulle", toTitle: "Giverny", mode: "drive" }, startTime: "09:30", endTime: "11:00" },
    { googlePlaceId: P.monet, startTime: "11:00", endTime: "12:30", details: { cost_per_person: 12, notes: "Water lilies first, then the house." } },
    { googlePlaceId: P.baudy, startTime: "12:30", details: { notes: "Lunch down the road. Check the hours before you go." } },
    { leg: { from: P.monet, to: P.villaLara, fromTitle: "Giverny", toTitle: "Bayeux", mode: "drive" }, startTime: "14:00", endTime: "16:30" },
    { googlePlaceId: P.villaLara, startTime: "17:00", confirmed: true, dayDetails: { check_out: 7 },
      details: { confirmation: "EXAMPLE7", notes: `Two nights. ${EXAMPLE}` } },
    { googlePlaceId: P.pommier, startTime: "18:30", details: { notes: "Closed Wednesdays, so it goes tonight." } },
  ],
  // Wed: Mont-Saint-Michel, the other big day
  [
    { leg: { from: P.villaLara, to: P.abbey, fromTitle: "Bayeux", toTitle: "Mont-Saint-Michel", mode: "drive" }, startTime: "08:00", endTime: "10:00", details: { notes: "Park on the mainland and take the shuttle across." } },
    { googlePlaceId: P.abbey, startTime: "10:00", endTime: "12:00", confirmed: true,
      details: { confirmation: "EXAMPLE8", cost_per_person: 16, notes: `Timed ticket. ${EXAMPLE}`, prep: "Lots of stairs: shoes with grip, no stroller." } },
    { googlePlaceId: P.poulard, startTime: "12:30", details: { notes: "The famous omelette." } },
    { startTime: "14:00", endTime: "15:00", details: { title: "Walk the ramparts", notes: "Check the tide times: the water can ring the island." } },
    { leg: { from: P.abbey, to: P.villaLara, fromTitle: "Mont-Saint-Michel", toTitle: "Bayeux", mode: "drive" }, startTime: "15:30", endTime: "17:30" },
    { googlePlaceId: P.angle, startTime: "19:00", details: { notes: "The nice dinner. Book ahead." } },
  ],
  // Thu: home
  [
    { leg: { from: P.villaLara, to: P.hertz, fromTitle: "Bayeux", toTitle: "Charles de Gaulle", mode: "drive" }, startTime: "08:00", endTime: "11:30", details: { notes: "About three hours, plus a stop for fuel." } },
    { googlePlaceId: P.hertz, startTime: "11:30", confirmed: true, dayDetails: { drop_off: 7 },
      details: { title: "Return the rental car", named: true, company: "Hertz", drop_off_location: "Charles de Gaulle Airport" } },
    { startTime: "12:30", details: { title: "Lunch at the airport" } },
    { googlePlaceId: P.yyz, startTime: "15:00", endTime: "17:15", confirmed: true,
      details: { title: "Fly home to Toronto", named: true, airline: "Example Air", flight_number: "EX 873", origin_airport: "Paris Charles de Gaulle (CDG)", arriving_at: "Toronto Pearson (YYZ)", confirmation: "EXAMPLE1", notes: EXAMPLE } },
  ],
];

// Saved ideas that are deliberately not on a day: the hollow pins. Between
// these and the days, every kind of pin a family might drop is on the map
// (plan.test.ts holds the list). Sarah and Uncle Mike are made up; the TikTok
// links are the Louvre's own account and public tag pages.
export const SAMPLE_INTERESTED: SampleCard[] = [
  { googlePlaceId: P.monoprix, details: { notes: "Groceries near the hotel: breakfast, fruit, milk." } },
  { googlePlaceId: P.pharmacy, details: { notes: "Saved just in case." } },
  { googlePlaceId: P.clinic, details: { notes: "A clinic, saved just in case. Call before you go." } },
  { googlePlaceId: P.hospital, details: { notes: "Children's hospital, saved just in case." } },
  { googlePlaceId: P.carrefour, details: { notes: "Groceries in Bayeux." } },
  { googlePlaceId: P.hospitalBayeux, details: { notes: "Saved just in case." } },
  { googlePlaceId: P.flore, details: { recommended_by: "Uncle Mike", notes: "Coffee and people watching." } },
  { googlePlaceId: P.poilane, details: { recommended_by: "Sarah", notes: "The butter cookies." } },
  { googlePlaceId: P.berthillon, sourceUrl: "https://www.tiktok.com/tag/berthillon", details: { recommended_by: "TikTok", notes: "Ice cream on the island." } },
  { googlePlaceId: P.harrys, details: { notes: "One drink after the kids are asleep." } },
  { googlePlaceId: P.aligre, details: { notes: "Food market. Go in the morning." } },
  { googlePlaceId: P.books, sourceUrl: "https://www.tiktok.com/tag/shakespeareandcompany", details: { recommended_by: "TikTok", notes: "The bookshop." } },
  { googlePlaceId: P.menagerie, details: { notes: "A small zoo for a slow morning." } },
  { googlePlaceId: P.hammam, details: { notes: "An hour off for one parent." } },
  { googlePlaceId: P.moulin, details: { notes: "A date night, if there is a sitter." } },
  { googlePlaceId: P.etretat, sourceUrl: "https://www.tiktok.com/tag/etretat", details: { recommended_by: "TikTok", notes: "Cliff walk. Worth a detour with another day." } },
  { googlePlaceId: P.omahaBeach },
  { googlePlaceId: P.omaha, details: { notes: "Close to Bayeux, if you have a free morning." } },
  { googlePlaceId: P.honfleur, details: { notes: "Pretty harbour town in Normandy." } },
  { googlePlaceId: P.orsay, details: { notes: "Closed Mondays." } },
  { googlePlaceId: P.sacre },
  { googlePlaceId: P.disney, details: { notes: "A full day." } },
];
