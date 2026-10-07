import { describe, it, expect } from "vitest";
import { eventDates, eventDay, cardEventDates } from "./eventDays";

const TUSCANY = ["2027-08-24", "2027-09-04"] as const;
const JAPAN = ["2028-04-02", "2028-04-15"] as const;

describe("the days an event is on", () => {
  it("the Bravio: one Sunday", () => {
    expect(eventDates("Usually Sun 29 Aug: barrel-rolling race between 8 medieval districts", ...TUSCANY)).toEqual(["2027-08-29"]);
  });
  it("ranges and pairs, as Find writes them", () => {
    expect(eventDates("Thu 13–Sat 15 Apr: Yayoi Matsuri — floats", ...JAPAN)).toEqual(["2028-04-13", "2028-04-14", "2028-04-15"]);
    expect(eventDates("Fri 7 Apr & Sat 8 Apr: Saga Dai Nenbutsu Kyogen", ...JAPAN)).toEqual(["2028-04-07", "2028-04-08"]);
    expect(eventDates("Usually Sat 28 Aug and Sat 4 Sep: free weekly 5 km park run", ...TUSCANY)).toEqual(["2027-08-28", "2027-09-04"]);
    expect(eventDates("Usually Fri 27 Aug–Sat 28 Aug: Palio opening", ...TUSCANY)).toEqual(["2027-08-27", "2027-08-28"]);
  });
  it("on every day of the trip, or no date: no constraint", () => {
    expect(eventDates("Sun 2 Apr–Sat 15 Apr: Miyako Odori — three shows daily", ...JAPAN)).toBeNull();
    expect(eventDates("Usually throughout late Aug–early Sep: Settembre Lucchese", ...TUSCANY)).toBeNull();
    expect(eventDates(null, ...TUSCANY)).toBeNull();
  });
  it("only the date part is read: a date in the description is not the event's", () => {
    expect(eventDates("Sun 9 Apr: Kamakura Matsuri — re-enacts a tale from 12 Jun 1185", ...JAPAN)).toEqual(["2028-04-09"]);
  });
});

describe("where a dropped event goes", () => {
  it("its own day, or the nearest of its days; anywhere when free", () => {
    expect(eventDay(["2027-08-29"], "2027-08-26")).toBe("2027-08-29");
    expect(eventDay(["2028-04-07", "2028-04-08"], "2028-04-12")).toBe("2028-04-08");
    expect(eventDay(["2028-04-07", "2028-04-08"], "2028-04-07")).toBe("2028-04-07");
    expect(eventDay(null, "2027-08-26")).toBe("2027-08-26");
  });
  it("reads a card Find saved; a restaurant has no dates", () => {
    const bravio = { place: { sub_type: "event" }, details: { find: { why: "Usually Sun 29 Aug: barrel race" } } };
    expect(cardEventDates(bravio, ...TUSCANY)).toEqual(["2027-08-29"]);
    expect(cardEventDates({ ...bravio, place: { sub_type: "restaurant" } }, ...TUSCANY)).toBeNull();
    expect(cardEventDates({ place: { sub_type: "event" }, details: {} }, ...TUSCANY)).toBeNull();
  });
});

import { datedEvents, pinsToPlan } from "./draftRows";
import type { Card } from "@/types/database";
describe("Plan my trip puts an event on its own day", () => {
  const days = Array.from({ length: 12 }, (_, i) => ({ id: "d" + (i + 1), date: new Date(Date.UTC(2027, 7, 24 + i)).toISOString().slice(0, 10) }));
  const bravio = { id: "b", status: "interested", day_id: null, place_id: "pb", details: { find: { why: "Usually Sun 29 Aug: barrel race" } }, place: { title: "Piazza Grande", type: "activity", sub_type: "event", lat: 43.09, lng: 11.78 } } as unknown as Card;
  const gelato = { id: "g", status: "interested", day_id: null, place_id: "pg", details: {}, place: { title: "Gelateria", type: "food", sub_type: "dessert", lat: 43.84, lng: 10.5 } } as unknown as Card;
  it("the Bravio on Sun 29 Aug (day 6), and out of the day groups", () => {
    expect(datedEvents([bravio, gelato], days)).toEqual([{ card: bravio, dayId: "d6" }]);
    expect(pinsToPlan([bravio, gelato], days).map((p) => p.id)).toEqual(["g"]);
    // Without days (the map's count of places to plan), it is still a place to plan.
    expect(pinsToPlan([bravio, gelato]).map((p) => p.id)).toEqual(["b", "g"]);
  });
  it("already on a day: left alone", () => {
    const placed = { ...bravio, id: "b2", status: "in_itinerary", day_id: "d6" } as Card;
    expect(datedEvents([bravio, placed], days)).toEqual([]);
  });
});

import { dayForCard, onlyOnLine } from "./eventDays";
describe("every door onto a day", () => {
  const days = Array.from({ length: 12 }, (_, i) => ({ id: "d" + (i + 1), date: new Date(Date.UTC(2027, 7, 24 + i)).toISOString().slice(0, 10) }));
  const bravio = { place: { sub_type: "event" }, details: { find: { why: "Usually Sun 29 Aug: barrel race" } } };
  it("puts the Bravio on Sunday whichever day was chosen, and says so", () => {
    expect(dayForCard(bravio, days, days[2])).toEqual({ day: days[5], moved: true, dates: ["2027-08-29"] });
    expect(dayForCard(bravio, days, days[5])).toEqual({ day: days[5], moved: false, dates: ["2027-08-29"] });
    expect(dayForCard({ place: { sub_type: "restaurant" } }, days, days[2])).toEqual({ day: days[2], moved: false, dates: [] });
    // His wording (1 Oct 2026): say why it moved.
    expect(onlyOnLine("Bravio delle Botti", "2027-08-29", ["2027-08-29"])).toBe("Bravio delle Botti only happens on Sun 29 Aug, so I moved it there");
    expect(onlyOnLine("Saga Dai Nenbutsu Kyogen", "2028-04-08", ["2028-04-07", "2028-04-08"])).toBe("Saga Dai Nenbutsu Kyogen only happens on Fri 7 Apr and Sat 8 Apr, so I moved it to Sat 8 Apr");
    expect(onlyOnLine("Yayoi Matsuri", "2028-04-13", ["2028-04-13", "2028-04-14", "2028-04-15"])).toBe("Yayoi Matsuri only happens on Thu 13 Apr to Sat 15 Apr, so I moved it to Thu 13 Apr");
  });
});

import { readFileSync } from "fs";
describe("every door onto a day keeps an event to its days", () => {
  it("the week's drops and moves, the pin's Put on a day, the phone's pick-and-place", () => {
    const board = readFileSync("src/components/plan/WeekBoard.tsx", "utf8");
    expect(board).toMatch(/const \{ day: target, moved \} = eventTarget\(card, dropped\)/);        // a pin dropped
    expect(board).toMatch(/const \{ day: target, moved \} = eventTarget\(d\.card, dayList\[g\.day\]\)/); // a card moved
    expect(board).toMatch(/const onOtherDays = dropped\.filter\(\(c\) => eventTarget\(c, target\)\.moved\)/); // several dropped
    const pop = readFileSync("src/components/map/MapPinPopup.tsx", "utf8");
    expect(pop).toMatch(/const \{ day, moved, dates \} = dayForCard\(card, days \?\? \[\], chosen\)/);
    expect(pop).toMatch(/placeId: card\.place_id, place: card\.place, details: card\.details/);
    // The lasso and, since 7 Oct 2026, the pin card on the journey Map go through lib/map/putOnDay.
    const phone = readFileSync("src/components/map/FullMapClient.tsx", "utf8");
    expect(phone).toMatch(/planPutOnDay\(chosen, day, /);
    expect(readFileSync("src/lib/map/putOnDay.ts", "utf8")).toMatch(/dayForCard\(card, days, day\)/);
  });
});
