import { describe, it, expect } from "vitest";
import { airportCity, carCapacity, twoCars, carsUrl, flightsUrl, kayakParty, kayakPlace, roomsFor, staysUrl, travellers, englishTown } from "./kayak";

// The URL shapes Brennan checked live on kayak.com, 6 Oct 2026. Tuscany's party:
// seven people, [43, 40, 70, 70, 10, 8, 5].
const tuscany = kayakParty([43, 40, 70, 70, 10, 8, 5], 7);

describe("kayakParty", () => {
  it("splits Tuscany into four adults and three children with their ages", () => {
    expect(tuscany).toEqual({ adults: 4, children: [10, 8, 5] });
    expect(travellers(tuscany)).toBe(7);
  });
  it("sends a baby as age 1, never 0", () => {
    expect(kayakParty([38, 36, 0, 1], 4).children).toEqual([1, 1]);
  });
  it("with no ages, everyone in the head count is an adult (Rome: 2, no ages)", () => {
    expect(kayakParty(null, 2)).toEqual({ adults: 2, children: [] });
    expect(kayakParty([], null)).toEqual({ adults: 1, children: [] });
  });
  it("one room per four people", () => {
    expect(roomsFor(tuscany)).toBe(2);
    expect(roomsFor(kayakParty([40, 40], 2))).toBe(1);
    expect(roomsFor(kayakParty([40, 40, 9, 7], 4))).toBe(1);
    expect(roomsFor(kayakParty([40, 40, 9, 7, 4], 5))).toBe(2);
  });
});

describe("flightsUrl", () => {
  it("builds Brennan's verified Tuscany search exactly", () => {
    expect(flightsUrl({ from: "YYZ", to: ["PSA"], out: "2027-08-24", back: "2027-09-04", party: tuscany }))
      .toBe("https://www.kayak.com/flights/YYZ-PSA/2027-08-24/2027-09-04/4adults/children-10-8-5?sort=bestflight_a");
  });
  it("comma-joins several arrival airports", () => {
    expect(flightsUrl({ from: "YYZ", to: ["FLR", "PSA"], out: "2027-08-24", back: "2027-09-04", party: tuscany }))
      .toBe("https://www.kayak.com/flights/YYZ-FLR,PSA/2027-08-24/2027-09-04/4adults/children-10-8-5?sort=bestflight_a");
  });
  it("leaves the children segment out when there are none", () => {
    expect(flightsUrl({ from: "YYZ", to: ["LGA"], out: "2026-10-30", back: "2026-11-01", party: kayakParty([40, 40], 2) }))
      .toBe("https://www.kayak.com/flights/YYZ-LGA/2026-10-30/2026-11-01/2adults?sort=bestflight_a");
  });
  it("never puts a town in the route (Kayak drops it): no codes, or no home airport, is the plain flights page", () => {
    expect(flightsUrl({ from: "YYZ", to: ["Lucca"], out: "2027-08-24", back: "2027-09-04", party: tuscany })).toBe("https://www.kayak.com/flights");
    expect(flightsUrl({ from: null, to: ["PSA"], out: "2027-08-24", back: "2027-09-04", party: tuscany })).toBe("https://www.kayak.com/flights");
  });
});

describe("staysUrl", () => {
  it("builds Brennan's verified Lucca search exactly", () => {
    expect(staysUrl({ place: kayakPlace("Lucca", "Italy"), checkIn: "2027-08-24", checkOut: "2027-09-04", party: tuscany }))
      .toBe("https://www.kayak.com/hotels/Lucca-Italy/2027-08-24/2027-09-04/4adults/3children-10-8-5/2rooms");
  });
  it("strips commas from the place (a comma falls back to Kayak's generic page)", () => {
    expect(kayakPlace("Lucca, Italy")).toBe("Lucca-Italy");
    expect(kayakPlace("New York", "USA")).toBe("New-York-USA");
    expect(kayakPlace("Tokyo", "Japan")).not.toContain(",");
  });
  it("leaves out children when none, and one room (Kayak's default)", () => {
    expect(staysUrl({ place: "Brooklyn-USA", checkIn: "2026-10-30", checkOut: "2026-11-01", party: kayakParty([40, 40], 2) }))
      .toBe("https://www.kayak.com/hotels/Brooklyn-USA/2026-10-30/2026-11-01/2adults");
  });
});

describe("carsUrl", () => {
  it("builds Brennan's verified Pisa search exactly", () => {
    expect(carsUrl({ at: "PSA", pickUp: "2027-08-24", pickUpHour: 14, dropOff: "2027-09-04", dropOffHour: 10 }))
      .toBe("https://www.kayak.com/cars/PSA/2027-08-24-14h/2027-09-04-10h");
  });
  it("is always kayak.com — kayak.ca does not resolve on his network", () => {
    expect(carsUrl({ at: "PSA", pickUp: "2027-08-24", pickUpHour: 9, dropOff: "2027-09-04", dropOffHour: 10 })).toMatch(/^https:\/\/www\.kayak\.com\/cars\/PSA\/2027-08-24-09h\//);
  });
});

describe("cars that fit the party (seats filter verified live 6 Oct 2026)", () => {
  const at = { at: "PSA", pickUp: "2027-08-24", pickUpHour: 14, dropOff: "2027-09-04", dropOffHour: 10 };
  it("four or fewer: no filter, the URL Brennan checked", () => {
    expect(carCapacity(4)).toBeNull();
    expect(carsUrl({ ...at, people: 4 })).toBe("https://www.kayak.com/cars/PSA/2027-08-24-14h/2027-09-04-10h");
    expect(carsUrl({ ...at, people: 2 })).toBe("https://www.kayak.com/cars/PSA/2027-08-24-14h/2027-09-04-10h");
  });
  it("five or six: 5–6 seats", () => {
    expect(carsUrl({ ...at, people: 5 })).toBe("https://www.kayak.com/cars/PSA/2027-08-24-14h/2027-09-04-10h?sort=rank_a&fs=carcapacity=pas_5_6");
    expect(carCapacity(6)).toBe("pas_5_6");
  });
  it("seven to nine: 7+ seats (Tuscany's seven)", () => {
    expect(carsUrl({ ...at, people: 7 })).toBe("https://www.kayak.com/cars/PSA/2027-08-24-14h/2027-09-04-10h?sort=rank_a&fs=carcapacity=pas_7_X");
    expect(carCapacity(9)).toBe("pas_7_X");
  });
  it("ten or more: still 7+, and two cars", () => {
    expect(carsUrl({ ...at, people: 11 })).toBe("https://www.kayak.com/cars/PSA/2027-08-24-14h/2027-09-04-10h?sort=rank_a&fs=carcapacity=pas_7_X");
    expect(twoCars(10)).toBe(true);
    expect(twoCars(9)).toBe(false);
  });
});

describe("englishTown (6 Oct 2026, tested live on Kayak)", () => {
  it("turns local spellings into the English Kayak resolves", () => {
    expect(englishTown("Firenze")).toBe("Florence");
    expect(englishTown("Roma")).toBe("Rome"); // bare "Roma" opened Roma, Queensland
    expect(englishTown("Lisboa")).toBe("Lisbon");
    expect(englishTown(" München ")).toBe("Munich");
  });
  it("leaves names it does not know alone", () => {
    expect(englishTown("Lucca")).toBe("Lucca");
    expect(englishTown("Positano")).toBe("Positano");
  });
});

describe("airportCity: the row's line says cities, the link keeps codes", () => {
  it("names the airports his journeys use", () => {
    expect(airportCity("YYZ")).toBe("Toronto");
    expect(airportCity("PSA")).toBe("Pisa");
    expect(airportCity("LGA")).toBe("New York");
    expect(airportCity("SYD")).toBe("Sydney");
  });
  it("an unknown or malformed code is null (the line falls back to the code)", () => {
    expect(airportCity("ZZZ")).toBeNull();
    expect(airportCity("Pisa")).toBeNull();
    expect(airportCity(null)).toBeNull();
  });
});
