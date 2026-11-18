import { describe, it, expect } from "vitest";
import { cruiseDayIds, isShipMarker, shipSpans, shipSpanSource, BOARD_FALLBACK_MIN } from "./cruiseDays";
import { draftDays } from "./draftRows";
import type { Card } from "@/types/database";

// Don's Iceland cruise as it sits in the database (17 Nov 2026): the terminal
// on 20 Jul, his ports as Explore places, "At Sea" notes on 25 and 28 Jul.
const dates = Array.from({ length: 17 }, (_, i) => `2027-07-${String(16 + i).padStart(2, "0")}`.replace("07-32", "08-01"));
const days = dates.map((date, i) => ({ id: `d${i + 1}`, date, day_number: i + 1 }));
const dayOf = (date: string) => days.find((d) => d.date === date)!.id;
const place = (title: string, sub_type: string, type = "activity") => ({ id: title, title, sub_type, type });
const card = (date: string, p: ReturnType<typeof place> | null, details: Record<string, unknown> = {}, start: string | null = null) =>
  ({ id: `${date}-${p?.title ?? details.title}`, day_id: dayOf(date), place: p, details, start_time: start, end_time: null, status: "in_itinerary" }) as unknown as Card;

const don = [
  card("2027-07-16", place("Bergstaðastræti 31", "hotel", "logistics"), {}, "15:00:00"),
  card("2027-07-20", place("Reykjavík Cruise Terminal", "transit", "logistics")),
  card("2027-07-21", place("Grundarfjörður", "self_directed"), {}, "07:00:00"),
  card("2027-07-25", null, { title: "At Sea" }),
  card("2027-07-28", null, { title: "At Sea" }),
];

describe("days on the ship", () => {
  it("knows a ship marker by kind or by words, not a town", () => {
    expect(isShipMarker(don[1])).toBe(true);
    expect(isShipMarker(don[3])).toBe(true);
    expect(isShipMarker(card("2027-07-22", place("Ísafjörður", "port", "logistics")))).toBe(true);
    expect(isShipMarker(don[2])).toBe(false);
    expect(isShipMarker(card("2027-07-17", place("Harbour seafood", "restaurant", "food")))).toBe(false);
  });

  it("runs from boarding to the last sea day; the Reykjavík days before stay plannable", () => {
    const at = cruiseDayIds(days, don);
    expect(Array.from(at).map((id) => days.find((d) => d.id === id)!.date)).toEqual(["2027-07-20", "2027-07-21", "2027-07-22", "2027-07-23", "2027-07-24", "2027-07-25", "2027-07-26", "2027-07-27", "2027-07-28"]);
    expect(at.has(dayOf("2027-07-18"))).toBe(false);
  });

  it("Plan my trip gives a sea day nothing (the Blue Lagoon went on 25 Jul)", () => {
    const free = draftDays(days, don);
    expect(free.find((d) => d.date === "2027-07-25")!.free).toBe(0);
    expect(free.find((d) => d.date === "2027-07-18")!.free).toBe(1);
  });

  it("a journey with no cruise is untouched", () => {
    expect(cruiseDayIds(days, [don[0]]).size).toBe(0);
  });
});

describe("ship time, painted blue on the week (17 Nov 2026)", () => {
  // Don's journey after his ports were marked Port: Grundarfjörður 7am–6pm, Ísafjörður overnight.
  const port = (date: string, title: string, start: string, end: string, details: Record<string, unknown> = {}) =>
    ({ ...card(date, place(title, "port", "logistics"), details, start), end_time: end }) as unknown as Card;
  const cruise = [
    card("2027-07-20", place("Reykjavík Cruise Terminal", "transit", "logistics")),
    port("2027-07-21", "Grundarfjörður", "07:00:00", "18:00:00"),
    port("2027-07-22", "Ísafjörður", "08:00:00", "18:00:00", { overnight: true }),
    card("2027-07-24", null, { title: "At Sea" }),
  ];
  const spans = shipSpans(days, cruise);
  const on = (date: string) => spans.get(dayOf(date));

  it("boarding day from the evening when the terminal card has no time", () => {
    expect(on("2027-07-20")).toEqual([[BOARD_FALLBACK_MIN, 1440]]);
  });
  it("a port day is the day less the hours ashore", () => {
    expect(on("2027-07-21")).toEqual([[0, 420], [1080, 1440]]);
  });
  it("a night in port: ashore from docking to midnight, then until all aboard the next day", () => {
    expect(on("2027-07-22")).toEqual([[0, 480]]);
    expect(on("2027-07-23")).toEqual([[1080, 1440]]);
  });
  it("a sea day is blue all day; days off the ship get nothing", () => {
    expect(on("2027-07-24")).toEqual([[0, 1440]]);
    expect(on("2027-07-19")).toBeUndefined();
  });
  it("each blue stretch knows the card it starts from: the port just left, or boarding (18 Nov 2026)", () => {
    const from = (date: string, start: number) => shipSpanSource(days, cruise, dayOf(date), start)?.place?.title ?? null;
    expect(from("2027-07-20", BOARD_FALLBACK_MIN)).toBe("Reykjavík Cruise Terminal");
    expect(from("2027-07-21", 0)).toBe("Reykjavík Cruise Terminal");
    expect(from("2027-07-21", 1080)).toBe("Grundarfjörður");
    expect(from("2027-07-22", 0)).toBe("Grundarfjörður");
    // the night in port: the ship leaves Ísafjörður at 6 pm on the 23rd, and the sea day after is still Ísafjörður's
    expect(from("2027-07-23", 1080)).toBe("Ísafjörður");
    expect(from("2027-07-24", 0)).toBe("Ísafjörður");
    // while still tied up in Ísafjörður overnight, the last port left is Grundarfjörður
    expect(from("2027-07-23", 0)).toBe("Grundarfjörður");
    expect(shipSpanSource(days, cruise, "nope", 0)).toBeNull();
  });
  it("a cruise that starts on a port day with nothing before it has no source for its first morning", () => {
    const portOnly = [{ ...card("2027-07-21", place("Grundarfjörður", "port", "logistics"), {}, "07:00:00"), end_time: "18:00:00" }] as unknown as Card[];
    expect(shipSpanSource(days, portOnly, dayOf("2027-07-21"), 0)).toBeNull();
    expect(shipSpanSource(days, portOnly, dayOf("2027-07-21"), 1080)?.place?.title).toBe("Grundarfjörður");
  });
  it("naming a day \"Day at sea\" is enough on its own", () => {
    const named = days.map((d) => (d.date === "2027-07-26" ? { ...d, theme: "Day at sea" } : d));
    expect(shipSpans(named, []).get(dayOf("2027-07-26"))).toEqual([[0, 1440]]);
    expect(shipSpans(days, []).size).toBe(0);
  });
});
