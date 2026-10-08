import { describe, it, expect } from "vitest";
import journeys from "./fixtures/journeys.json";
import { copyJourney } from "@/lib/trips/copyJourney";
import { checklistRows, costCurrencies, costLabel, readCosts, storeChecklist, destinationCountry, needsAirports, overnightOutbound, ownAirports, partyOf, readChecklist, withChoice, type CheckInput, type CheckRow } from "./checklist";

// Real journeys, pulled from the live database on 6 Oct 2026 (cards on days,
// plus saved hotels): Tuscany, Japan, both New Yorks, Last Week of Summer, Australia.
type J = CheckInput & { title: string };
const all = journeys as unknown as J[];
const get = (title: string, over: Partial<CheckInput> = {}): CheckInput => {
  const j = all.find((x) => x.title === title)!;
  return { ...j, cards: j.cards ?? [], days: j.days ?? [], birthdates: j.birthdates ?? [], ...over };
};
const rowsOf = (input: CheckInput) => Object.fromEntries(checklistRows(input).map((r) => [r.key, r])) as Record<string, CheckRow>;

describe("Tuscany (seven people, villa booked, no flights yet)", () => {
  const t = get("Tuscany", { airports: ["PSA", "FLR"] });
  const r = rowsOf(t);

  it("Flights is open: YYZ to Pisa and Florence, leaving the night before (an overnight from Canada)", () => {
    expect(r.flights.state).toBe("open");
    // One short line, city names (6 Oct 2026 redesign): the airports stay in the link.
    expect(r.flights.line).toBe("Toronto → Pisa · 7 people");
    expect(r.flights.url).toBe("https://www.ca.kayak.com/flights/YYZ-PSA,FLR/2027-08-23/2027-09-04/4adults/children-10-8-5?sort=bestflight_a");
  });
  it("Stays ticks itself: Villa Zambaldi covers every night (its check-out card is on the last day)", () => {
    expect(r.stays).toMatchObject({ state: "booked", line: "Villa Zambaldi · all 11 nights", url: null, manual: null, name: "Villa Zambaldi" });
    expect(r.stays.dayId).toBe(t.days.find((d) => d.date === "2027-08-24")!.id); // the check-in day
  });
  it("the four saved villas (interested, no day) never count — take the booked one away and it is open", () => {
    const noVilla = get("Tuscany", { cards: t.cards.filter((c) => c.place?.title !== "Villa Zambaldi") });
    const s = rowsOf(noVilla).stays;
    expect(s.state).toBe("open");
    expect(s.line).toBe("Lucca · 11 nights");
    expect(s.url).toBe("https://www.ca.kayak.com/hotels/Lucca/2027-08-24/2027-09-04/4adults/3children-10-8-5/2rooms");
  });
  it("some nights covered: counts them and searches the first open run where that night's plans are (Florence, as in the approved mock)", () => {
    const short = get("Tuscany", {
      cards: t.cards
        .filter((c) => !(c.place?.title === "Villa Zambaldi" && /check/i.test(String(c.details?.title ?? ""))))
        .map((c) => (c.place?.title === "Villa Zambaldi" ? { ...c, details: { ...(c.details ?? {}), check_out: "2027-08-31" } } : c)),
    });
    const s = rowsOf(short).stays;
    expect(s.state).toBe("open");
    expect(s.line).toBe("7 of 11 nights booked");
    expect(s.url).toBe("https://www.ca.kayak.com/hotels/Florence/2027-08-31/2027-09-04/4adults/3children-10-8-5/2rooms");
  });
  it("Car is open: from the first airport at 2 pm, back at 10 am on the last day, 7+ seats for the seven", () => {
    expect(r.car.line).toBe("Pisa airport · 7 seats");
    expect(r.car.url).toBe("https://www.ca.kayak.com/cars/PSA/2027-08-24-14h/2027-09-04-10h?sort=rank_a&fs=carcapacity=pas_7_X");
  });
  it("before the airports arrive, Car searches the villa's town, never a code-less route", () => {
    const before = rowsOf(get("Tuscany", { airports: null }));
    expect(before.car.url).toBe("https://www.ca.kayak.com/cars/Lucca/2027-08-24-14h/2027-09-04-10h?sort=rank_a&fs=carcapacity=pas_7_X");
    expect(before.flights.url).toBe("https://www.ca.kayak.com/flights");
    expect(needsAirports(get("Tuscany"))).toBe(true);
  });
  it("a manual choice wins: Not needed on the car, Booked on flights", () => {
    const m = rowsOf({ ...t, trip: { ...t.trip, booking_checklist: { car: "skip", flights: "booked" } } });
    expect(m.car).toMatchObject({ state: "skip", line: "Not needed", manual: "skip", url: null });
    expect(m.flights).toMatchObject({ state: "booked", line: "Marked booked", manual: "booked", url: null });
  });
  it("a manual Not needed even overrides an automatic Booked", () => {
    expect(rowsOf({ ...t, trip: { ...t.trip, booking_checklist: { stays: "skip" } } }).stays.state).toBe("skip");
  });
});

describe("Japan (archived; six saved hotels, none booked)", () => {
  const r = rowsOf(get("Japan", { airports: ["NRT", "HND"] }));
  it("the ryokans holding day one as 'interested' do not tick Stays", () => {
    expect(r.stays.state).toBe("open");
    expect(r.stays.line).toBe("Tokyo · 13 nights");
    expect(r.stays.url).toBe("https://www.ca.kayak.com/hotels/Tokyo/2028-04-02/2028-04-15/2adults/3children-10-8-5/2rooms");
  });
  it("flights leave the night before", () => {
    expect(r.flights.url).toBe("https://www.ca.kayak.com/flights/YYZ-NRT,HND/2028-04-01/2028-04-15/2adults/children-10-8-5?sort=bestflight_a");
  });
});

describe("New York (Mia & Daddy): everything but a car is on the days", () => {
  const input = get("New York (Mia & Daddy)");
  const r = rowsOf(input);
  it("Flights and Stays tick themselves", () => {
    expect(r.flights).toMatchObject({ state: "booked", line: "23 Jul and 26 Jul", name: null });
    expect(r.flights.dayId).toBe(input.days.find((d) => d.date === "2026-07-23")!.id);
    expect(r.stays).toMatchObject({ state: "booked", line: "11 Howard · all 3 nights", name: "11 Howard" });
  });
  it("the airport comes from the flight card, so no Claude call", () => {
    expect(ownAirports(input)).toEqual(["LGA"]);
    expect(needsAirports(input)).toBe(false);
  });
  it("the car is picked up two hours after landing (10:55 → 13h), at LaGuardia", () => {
    expect(r.car.url).toBe("https://www.ca.kayak.com/cars/LGA/2026-07-23-13h/2026-07-26-10h");
  });
  it("a rental car on a day ticks Car", () => {
    const pick = { id: "car1", day_id: input.days[0].id, place_id: null, status: "in_itinerary", details: { title: "Pick up rental car · Hertz", drop_off: "2026-07-26" }, place: { sub_type: "transit", title: "Hertz", address: null } };
    expect(rowsOf({ ...input, cards: [...input.cards, pick] }).car).toMatchObject({ state: "booked", line: "Hertz · 23–26 Jul", name: "Hertz", dayId: input.days[0].id });
  });
});

describe("New York (Oct): an owner with no home airport", () => {
  const r = rowsOf(get("New York", { airports: ["JFK", "LGA", "EWR"] }));
  it("Flights says where to fix it and opens Kayak's plain flights page", () => {
    expect(r.flights).toMatchObject({ state: "open", line: "Add your home airport in Profile", url: "https://www.kayak.com/flights" });
  });
  it("two people, one room: no rooms segment", () => {
    expect(r.stays.url).toMatch(/\/2026-10-30\/2026-11-01\/2adults$/);
  });
});

describe("Last Week of Summer (at home in Toronto)", () => {
  it("when the only airport is home, Flights is Not needed on its own", () => {
    expect(rowsOf(get("Last Week of Summer", { airports: ["YYZ"] })).flights).toMatchObject({ state: "skip", line: "Not needed", manual: null });
  });
  it("Car never searches 'Toronto & the GTA' — it uses the town of the first day's plans", () => {
    const car = rowsOf(get("Last Week of Summer")).car;
    expect(car.url).not.toContain("GTA");
    // Five people: the 5–6 seats filter.
    expect(car.url).toMatch(/^https:\/\/www\.ca\.kayak\.com\/cars\/[^/]+\/2026-08-31-14h\/2026-09-04-10h\?sort=rank_a&fs=carcapacity=pas_5_6$/);
  });
});

describe("Australia (flights on the days, no hotel)", () => {
  const r = rowsOf(get("Australia", { airports: ["SYD"] }));
  it("Flights ticks itself; Stays and Car stay open", () => {
    expect(r.flights).toMatchObject({ state: "booked", line: "15 Feb and 20 Feb" });
    expect(r.stays.state).toBe("open");
    expect(r.car.state).toBe("open");
  });
  it("the car waits two hours after the 7:00 landing", () => {
    expect(r.car.url).toBe("https://www.ca.kayak.com/cars/SYD/2026-02-15-09h/2026-02-20-10h");
  });
  it("the party is the journey's ages: 41 and 71 adults, one child of 8", () => {
    expect(r.stays.url).toContain("/2adults/1children-8");
  });
});

describe("every journey reads like sense", () => {
  for (const j of all) {
    it(`${j.title}: three rows, an open row always has a Kayak link (Canada's site for a Canadian home) with no comma in a stay's place`, () => {
      const rows = checklistRows(get(j.title, { airports: ["AAA"] }));
      expect(rows.map((r) => r.key)).toEqual(["flights", "stays", "car"]);
      for (const r of rows) {
        expect(r.line.length).toBeGreaterThan(0);
        if (r.state === "open") expect(r.url).toMatch(j.home.country === "Canada" ? /^https:\/\/www\.ca\.kayak\.com\// : /^https:\/\/www\.kayak\.com\//);
        else expect(r.url).toBeNull();
      }
      const stays = rows[1];
      if (stays.url?.includes("/hotels/")) expect(stays.url.split("/hotels/")[1].split("/")[0]).not.toMatch(/,|%2C/i);
    });
  }
});

describe("cars that fit the party (6 Oct 2026)", () => {
  it("New York (two people): no seats filter", () => {
    expect(rowsOf(get("New York (Mia & Daddy)")).car.url).toBe("https://www.ca.kayak.com/cars/LGA/2026-07-23-13h/2026-07-26-10h");
  });
  it("Japan (five): 5–6 seats", () => {
    expect(rowsOf(get("Japan", { airports: ["NRT"] })).car.url).toMatch(/fs=carcapacity=pas_5_6$/);
  });
  it("Tuscany with three more (ten): 7+ seats and the line says two cars", () => {
    const t = get("Tuscany", { airports: ["PSA"] });
    const ten = rowsOf({ ...t, trip: { ...t.trip, party_size: 10, party_ages: [43, 40, 70, 70, 10, 8, 5, 45, 44, 12] } }).car;
    expect(ten.url).toBe("https://www.ca.kayak.com/cars/PSA/2027-08-24-14h/2027-09-04-10h?sort=rank_a&fs=carcapacity=pas_7_X");
    expect(ten.line).toBe("Pisa airport · 10 seats, two cars");
    expect(rowsOf(t).car.line).not.toContain("two cars");
  });
});

describe("what a hand-booked row cost (6 Oct 2026)", () => {
  it("readCosts keeps a positive amount with a three-letter currency, nothing else", () => {
    expect(readCosts({ stays: "booked", costs: { stays: { amount: 1200, currency: "eur" }, car: { amount: 0, currency: "CAD" }, flights: { amount: 900, currency: "dollars" } } }))
      .toEqual({ stays: { amount: 1200, currency: "EUR" } });
    expect(readCosts({})).toEqual({});
    expect(readCosts(null)).toEqual({});
  });
  it("storeChecklist keeps a cost only on a row still Booked, and no costs key when there are none", () => {
    expect(storeChecklist({ stays: "booked" }, { stays: { amount: 1200, currency: "EUR" } })).toEqual({ stays: "booked", costs: { stays: { amount: 1200, currency: "EUR" } } });
    expect(storeChecklist({ stays: "skip" }, { stays: { amount: 1200, currency: "EUR" } })).toEqual({ stays: "skip" });
    expect(storeChecklist({ car: "skip" }, {})).toEqual({ car: "skip" });
  });
  it("readChecklist ignores the costs key", () => {
    expect(readChecklist({ stays: "booked", costs: { stays: { amount: 1, currency: "EUR" } } })).toEqual({ stays: "booked" });
  });
  it("a hand-booked row with a cost says what it cost; the budget reads the same object", () => {
    const t = get("Tuscany", { airports: ["PSA"] });
    const r = rowsOf({ ...t, trip: { ...t.trip, booking_checklist: { car: "booked", costs: { car: { amount: 1450, currency: "EUR" } } } } });
    expect(r.car).toMatchObject({ state: "booked", line: "Paid €1,450", cost: { amount: 1450, currency: "EUR" } });
    expect(costLabel({ amount: 850.4, currency: "CAD" })).toBe("$850");
  });
});

describe("the small rules", () => {
  it("readChecklist ignores anything but booked / skip", () => {
    expect(readChecklist({ flights: "booked", stays: "maybe", car: "skip", other: "booked" })).toEqual({ flights: "booked", car: "skip" });
    expect(readChecklist(null)).toEqual({});
  });
  it("withChoice sets and clears one row", () => {
    expect(withChoice({ flights: "booked" }, "car", "skip")).toEqual({ flights: "booked", car: "skip" });
    expect(withChoice({ flights: "booked", car: "skip" }, "flights", null)).toEqual({ car: "skip" });
  });
  it("overnight: a different country, unless the same region", () => {
    expect(overnightOutbound("Canada", "Italy")).toBe(true);
    expect(overnightOutbound("Canada", "Japan")).toBe(true);
    expect(overnightOutbound("Canada", "USA")).toBe(false);
    expect(overnightOutbound("Canada", "Costa Rica")).toBe(false);
    expect(overnightOutbound("Canada", "Canada")).toBe(false);
    expect(overnightOutbound(null, "Italy")).toBe(false);
    expect(overnightOutbound("Canada", null)).toBe(false);
  });
  it("destinationCountry is the last part, when there is one", () => {
    expect(destinationCountry("Tuscany, Italy")).toBe("Italy");
    expect(destinationCountry("New York, NY, USA")).toBe("USA");
    expect(destinationCountry("Toronto & the GTA")).toBeNull();
  });
  it("partyOf falls back to people's birthdates, then the head count", () => {
    const base = { destination: "Rome, Italy", start_date: "2026-04-22", end_date: "2026-04-28", party_size: 2, party_ages: null };
    expect(partyOf({ trip: base, birthdates: ["1984-04-03", "2017-07-14"] })).toEqual({ adults: 1, children: [8] });
    expect(partyOf({ trip: base, birthdates: [] })).toEqual({ adults: 2, children: [] });
  });
  it("a one-day journey needs no stay", () => {
    const one = get("New York", { trip: { ...get("New York").trip, end_date: "2026-10-30" } });
    expect(rowsOf(one).stays).toMatchObject({ state: "skip", line: "Not needed" });
  });
});

// Kayak's site follows where the person lives, so its prices are in their
// currency (6 Oct 2026). The fixtures' owner is Canadian; these swap the home.
describe("the Kayak site follows the person's home", () => {
  const tuscany = (home: CheckInput["home"]) => checklistRows(get("Tuscany", { home, airports: ["PSA", "FLR"] }));
  const urls = (rows: CheckRow[]) => rows.map((r) => r.url).filter((u): u is string => !!u);
  it("Canada: every open row on www.ca.kayak.com", () => {
    const u = urls(tuscany({ airport: "YYZ", country: "Canada" }));
    expect(u.length).toBeGreaterThan(0);
    for (const x of u) expect(x.startsWith("https://www.ca.kayak.com/")).toBe(true);
  });
  it("a US home: kayak.com; a UK home: kayak.co.uk", () => {
    for (const x of urls(tuscany({ airport: "JFK", country: "United States" }))) expect(x.startsWith("https://www.kayak.com/")).toBe(true);
    for (const x of urls(tuscany({ airport: "LHR", country: "United Kingdom" }))) expect(x.startsWith("https://www.kayak.co.uk/")).toBe(true);
  });
  it("no home country: the passport picks the site", () => {
    for (const x of urls(tuscany({ airport: "LHR", country: null, passport: "British" }))) expect(x.startsWith("https://www.kayak.co.uk/")).toBe(true);
  });
});

describe("costCurrencies: 'What did it cost?' starts in the person's home currency", () => {
  it("a US person sees USD first, the journey's currency next", () => {
    expect(costCurrencies("USD", "EUR")).toEqual({ initial: "USD", options: ["USD", "EUR", "GBP"] });
  });
  it("a Canadian on a trip to Italy: CAD, then EUR", () => {
    expect(costCurrencies("CAD", "EUR")).toEqual({ initial: "CAD", options: ["CAD", "EUR", "USD", "GBP"] });
  });
  it("an unknown destination adds nothing", () => {
    expect(costCurrencies("GBP", null)).toEqual({ initial: "GBP", options: ["GBP", "USD", "EUR"] });
  });
});

describe("a copy of New York (Mia & Daddy) a year on (7 Oct 2026, copy to new dates)", () => {
  // The real journey through the real copy: its flights and 11 Howard come
  // back as placeholders, so nothing ticks itself, but the rows still know
  // where — LaGuardia, and last time's hotel with "book again".
  const src = get("New York (Mia & Daddy)");
  let n = 0;
  const out = copyJourney(
    {
      trip: { id: "ny", user_id: "me", title: "New York (Mia & Daddy)", destination: src.trip.destination, destination_lat: null, destination_lng: null, start_date: src.trip.start_date, end_date: src.trip.end_date },
      days: src.days,
      cards: src.cards.map((c, i) => ({ position: i, start_time: null, end_time: null, ...c, status: c.status ?? "in_itinerary", details: c.details ?? {} })) as never,
    },
    { userId: "me", title: "New York (Bodhi & Daddy)", startDate: "2027-07-22", partySize: 3, partyAges: [43, 8, 5], includeSaved: false, newId: () => `n${++n}` },
  );
  const placeOf = new Map(src.cards.map((c) => [c.place_id, c.place]));
  const copy: CheckInput = {
    ...src,
    trip: { ...src.trip, start_date: out.trip.start_date as string, end_date: out.trip.end_date as string, party_size: 3, party_ages: [43, 8, 5], booking_checklist: {} },
    days: out.days.map((d) => ({ id: d.id as string, date: d.date as string })),
    cards: out.cards.map((c) => ({ ...(c as unknown as CheckInput["cards"][number]), place: placeOf.get(c.place_id as string) ?? null })),
  };
  const r = rowsOf(copy);
  it("Flights is open, from the copied flight's airport", () => {
    expect(r.flights.state).toBe("open");
    expect(r.flights.url).toContain("/flights/YYZ-LGA/");
    expect(r.flights.line).toBe("Toronto → New York · 3 people");
  });
  it("Stays is open and names last time's hotel: '11 Howard · 22–25 Jul · book again'", () => {
    expect(r.stays).toMatchObject({ state: "open", line: "11 Howard · 22–25 Jul · book again" });
    expect(r.stays.url).toContain("/2027-07-22/2027-07-25/");
  });
  it("once the stay is booked (the card sheet's switch), it ticks itself again", () => {
    const booked = { ...copy, cards: copy.cards.map((c) => (c.place?.title === "11 Howard" ? { ...c, confirmed: true } : c)) };
    expect(rowsOf(booked).stays.state).toBe("booked");
  });
});
