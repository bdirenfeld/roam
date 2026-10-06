import { describe, it, expect } from "vitest";
import journeys from "./fixtures/journeys.json";
import { checklistRows, costLabel, readCosts, storeChecklist, destinationCountry, needsAirports, overnightOutbound, ownAirports, partyOf, readChecklist, withChoice, type CheckInput, type CheckRow } from "./checklist";

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
    expect(r.flights.line).toBe("YYZ → PSA, FLR · 23 Aug – 4 Sep · 7 travellers");
    expect(r.flights.url).toBe("https://www.kayak.com/flights/YYZ-PSA,FLR/2027-08-23/2027-09-04/4adults/children-10-8-5?sort=bestflight_a");
  });
  it("Stays ticks itself: Villa Zambaldi covers every night (its check-out card is on the last day)", () => {
    expect(r.stays).toMatchObject({ state: "booked", line: "Booked", url: null, manual: null });
  });
  it("the four saved villas (interested, no day) never count — take the booked one away and it is open", () => {
    const noVilla = get("Tuscany", { cards: t.cards.filter((c) => c.place?.title !== "Villa Zambaldi") });
    const s = rowsOf(noVilla).stays;
    expect(s.state).toBe("open");
    expect(s.line).toBe("Lucca · 24 Aug – 4 Sep · 7 guests, 2 rooms");
    expect(s.url).toBe("https://www.kayak.com/hotels/Lucca/2027-08-24/2027-09-04/4adults/3children-10-8-5/2rooms");
  });
  it("some nights covered: counts them and searches the first open run where that night's plans are (Florence, as in the approved mock)", () => {
    const short = get("Tuscany", {
      cards: t.cards
        .filter((c) => !(c.place?.title === "Villa Zambaldi" && /check/i.test(String(c.details?.title ?? ""))))
        .map((c) => (c.place?.title === "Villa Zambaldi" ? { ...c, details: { ...(c.details ?? {}), check_out: "2027-08-31" } } : c)),
    });
    const s = rowsOf(short).stays;
    expect(s.state).toBe("open");
    expect(s.line).toBe("7 of 11 nights booked · next: Florence, 31 Aug – 4 Sep");
    expect(s.url).toBe("https://www.kayak.com/hotels/Florence/2027-08-31/2027-09-04/4adults/3children-10-8-5/2rooms");
  });
  it("Car is open: from the first airport at 2 pm, back at 10 am on the last day, 7+ seats for the seven", () => {
    expect(r.car.line).toBe("PSA · 24 Aug – 4 Sep");
    expect(r.car.url).toBe("https://www.kayak.com/cars/PSA/2027-08-24-14h/2027-09-04-10h?sort=rank_a&fs=carcapacity=pas_7_X");
  });
  it("before the airports arrive, Car searches the villa's town, never a code-less route", () => {
    const before = rowsOf(get("Tuscany", { airports: null }));
    expect(before.car.url).toBe("https://www.kayak.com/cars/Lucca/2027-08-24-14h/2027-09-04-10h?sort=rank_a&fs=carcapacity=pas_7_X");
    expect(before.flights.url).toBe("https://www.kayak.com/flights");
    expect(needsAirports(get("Tuscany"))).toBe(true);
  });
  it("a manual choice wins: Not needed on the car, Booked on flights", () => {
    const m = rowsOf({ ...t, trip: { ...t.trip, booking_checklist: { car: "skip", flights: "booked" } } });
    expect(m.car).toMatchObject({ state: "skip", line: "Not needed", manual: "skip", url: null });
    expect(m.flights).toMatchObject({ state: "booked", line: "Booked", manual: "booked", url: null });
  });
  it("a manual Not needed even overrides an automatic Booked", () => {
    expect(rowsOf({ ...t, trip: { ...t.trip, booking_checklist: { stays: "skip" } } }).stays.state).toBe("skip");
  });
});

describe("Japan (archived; six saved hotels, none booked)", () => {
  const r = rowsOf(get("Japan", { airports: ["NRT", "HND"] }));
  it("the ryokans holding day one as 'interested' do not tick Stays", () => {
    expect(r.stays.state).toBe("open");
    expect(r.stays.line).toBe("Tokyo · 2–15 Apr · 5 guests, 2 rooms");
    expect(r.stays.url).toBe("https://www.kayak.com/hotels/Tokyo/2028-04-02/2028-04-15/2adults/3children-10-8-5/2rooms");
  });
  it("flights leave the night before", () => {
    expect(r.flights.url).toBe("https://www.kayak.com/flights/YYZ-NRT,HND/2028-04-01/2028-04-15/2adults/children-10-8-5?sort=bestflight_a");
  });
});

describe("New York (Mia & Daddy): everything but a car is on the days", () => {
  const input = get("New York (Mia & Daddy)");
  const r = rowsOf(input);
  it("Flights and Stays tick themselves", () => {
    expect(r.flights).toMatchObject({ state: "booked", line: "Booked · 23 Jul and 26 Jul" });
    expect(r.stays).toMatchObject({ state: "booked", line: "Booked" });
  });
  it("the airport comes from the flight card, so no Claude call", () => {
    expect(ownAirports(input)).toEqual(["LGA"]);
    expect(needsAirports(input)).toBe(false);
  });
  it("the car is picked up two hours after landing (10:55 → 13h), at LaGuardia", () => {
    expect(r.car.url).toBe("https://www.kayak.com/cars/LGA/2026-07-23-13h/2026-07-26-10h");
  });
  it("a rental car on a day ticks Car", () => {
    const pick = { id: "car1", day_id: input.days[0].id, place_id: null, status: "in_itinerary", details: { title: "Pick up rental car · Hertz", drop_off: "2026-07-26" }, place: { sub_type: "transit", title: "Hertz", address: null } };
    expect(rowsOf({ ...input, cards: [...input.cards, pick] }).car).toMatchObject({ state: "booked", line: "Booked" });
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
    expect(car.url).toMatch(/^https:\/\/www\.kayak\.com\/cars\/[^/]+\/2026-08-31-14h\/2026-09-04-10h\?sort=rank_a&fs=carcapacity=pas_5_6$/);
  });
});

describe("Australia (flights on the days, no hotel)", () => {
  const r = rowsOf(get("Australia", { airports: ["SYD"] }));
  it("Flights ticks itself; Stays and Car stay open", () => {
    expect(r.flights).toMatchObject({ state: "booked", line: "Booked · 15 Feb and 20 Feb" });
    expect(r.stays.state).toBe("open");
    expect(r.car.state).toBe("open");
  });
  it("the car waits two hours after the 7:00 landing", () => {
    expect(r.car.url).toBe("https://www.kayak.com/cars/SYD/2026-02-15-09h/2026-02-20-10h");
  });
  it("the party is the journey's ages: 41 and 71 adults, one child of 8", () => {
    expect(r.stays.url).toContain("/2adults/1children-8");
  });
});

describe("every journey reads like sense", () => {
  for (const j of all) {
    it(`${j.title}: three rows, an open row always has a kayak.com link with no comma in a stay's place`, () => {
      const rows = checklistRows(get(j.title, { airports: ["AAA"] }));
      expect(rows.map((r) => r.key)).toEqual(["flights", "stays", "car"]);
      for (const r of rows) {
        expect(r.line.length).toBeGreaterThan(0);
        if (r.state === "open") expect(r.url).toMatch(/^https:\/\/www\.kayak\.com\//);
        else expect(r.url).toBeNull();
      }
      const stays = rows[1];
      if (stays.url?.includes("/hotels/")) expect(stays.url.split("/hotels/")[1].split("/")[0]).not.toMatch(/,|%2C/i);
    });
  }
});

describe("cars that fit the party (6 Oct 2026)", () => {
  it("New York (two people): no seats filter", () => {
    expect(rowsOf(get("New York (Mia & Daddy)")).car.url).toBe("https://www.kayak.com/cars/LGA/2026-07-23-13h/2026-07-26-10h");
  });
  it("Japan (five): 5–6 seats", () => {
    expect(rowsOf(get("Japan", { airports: ["NRT"] })).car.url).toMatch(/fs=carcapacity=pas_5_6$/);
  });
  it("Tuscany with three more (ten): 7+ seats and the line says two cars", () => {
    const t = get("Tuscany", { airports: ["PSA"] });
    const ten = rowsOf({ ...t, trip: { ...t.trip, party_size: 10, party_ages: [43, 40, 70, 70, 10, 8, 5, 45, 44, 12] } }).car;
    expect(ten.url).toBe("https://www.kayak.com/cars/PSA/2027-08-24-14h/2027-09-04-10h?sort=rank_a&fs=carcapacity=pas_7_X");
    expect(ten.line).toBe("PSA · 24 Aug – 4 Sep · you'll need two cars");
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
    expect(r.car).toMatchObject({ state: "booked", line: "Booked · €1,450", cost: { amount: 1450, currency: "EUR" } });
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
