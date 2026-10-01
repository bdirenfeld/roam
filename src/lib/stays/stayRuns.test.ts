import { describe, it, expect } from "vitest";
import { stayRuns, stayOn, writtenCheckOut, type StayDay, type StayCard } from "./stayRuns";

// Every hotel card on a day, as the live database held them on 1 Oct 2026.
const hotel = (id: string, place: string, title: string, extra: Partial<StayCard> = {}): StayCard =>
  ({ id, place_id: place, status: "in_itinerary", place: { sub_type: "hotel", title }, details: {}, ...extra });
const on = (date: string, ...cards: StayCard[]): StayDay => ({ date, cards });

describe("stays from the journeys as they are stored", () => {
  it("Tuscany: a check-in card and a 'Check out of the villa' card", () => {
    const runs = stayRuns([
      on("2027-08-24", hotel("in", "villa", "Villa Zambaldi", { start_time: "14:00:00" })),
      on("2027-08-30"),
      on("2027-09-04", hotel("out", "villa", "Villa Zambaldi", { start_time: "08:00:00", details: { title: "Check out of the villa" } })),
    ], "2027-09-04");
    expect(runs).toEqual([{ cardId: "in", placeId: "villa", title: "Villa Zambaldi", checkIn: "2027-08-24", checkOut: "2027-09-04", nights: 11 }]);
  });

  it("Sandra: the same hotel put on four days in a row checks out the morning after the last", () => {
    const runs = stayRuns(["2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"].map((d, i) => on(d, hotel("c" + i, "conrad", "Conrad Fort Lauderdale Beach"))), "2026-12-06");
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ cardId: "c0", checkIn: "2026-11-25", checkOut: "2026-11-29", nights: 4 });
    // Her cruise days are not at the Conrad.
    expect(stayOn(runs, "2026-12-01")).toBeNull();
  });

  it("New York: check_out written on the card; the cut duplicate is ignored", () => {
    const runs = stayRuns([on("2026-07-23",
      hotel("ny", "howard", "11 Howard", { start_time: "14:00:00", details: { check_in: "2026-07-23", check_out: "2026-07-26" } }),
      hotel("dup", "howard", "11 Howard", { status: "cut" }),
    )], "2026-07-26");
    expect(runs).toEqual([{ cardId: "ny", placeId: "howard", title: "11 Howard", checkIn: "2026-07-23", checkOut: "2026-07-26", nights: 3 }]);
  });

  it("Rome: two hotels; the second's end_date was saved a year early", () => {
    const runs = stayRuns([
      on("2026-04-22", hotel("nh", "nh", "NH Collection", { start_time: "12:00:00" }), hotel("nh2", "nh", "NH Collection", { status: "interested" })),
      on("2026-04-24", hotel("banco", "banco", "Banco 19 B&B", { start_time: "15:00:00", details: { end_date: "2025-04-28", check_out_date: "Tue, Apr 28" } })),
    ], "2026-04-28");
    expect(runs.map((r) => [r.title, r.checkIn, r.checkOut, r.nights])).toEqual([
      ["NH Collection", "2026-04-22", "2026-04-24", 2],
      ["Banco 19 B&B", "2026-04-24", "2026-04-28", 4],
    ]);
  });

  it("Santa Barbara: check_out_date on the card", () => {
    const runs = stayRuns([on("2026-10-09", hotel("m", "inn", "Montecito Inn", { details: { check_out_date: "2026-10-12" } }))], "2026-10-12");
    expect(runs[0]).toMatchObject({ checkOut: "2026-10-12", nights: 3 });
  });

  it("Hocking Hills: the same lodge again three days later is the check-out day", () => {
    const runs = stayRuns([on("2026-10-09", hotel("a", "lodge", "Lodge")), on("2026-10-12", hotel("b", "lodge", "Lodge"))], "2026-10-12");
    expect(runs[0]).toMatchObject({ checkIn: "2026-10-09", checkOut: "2026-10-12", nights: 3 });
  });

  it("Europe: four hotels with nothing written run each to the next, the last to the journey's end", () => {
    const runs = stayRuns([
      on("2027-07-01", hotel("l", "lon", "London")), on("2027-07-10", hotel("p", "par", "Paris")),
      on("2027-07-20", hotel("u", "luc", "Lucca")), on("2027-08-10", hotel("b", "bcn", "Barcelona")),
    ], "2027-08-30");
    expect(runs.map((r) => `${r.title} ${r.checkIn}→${r.checkOut}`)).toEqual([
      "London 2027-07-01→2027-07-10", "Paris 2027-07-10→2027-07-20", "Lucca 2027-07-20→2027-08-10", "Barcelona 2027-08-10→2027-08-30",
    ]);
  });

  it("Japan: saved ryokans left on day one are not stays", () => {
    const runs = stayRuns([on("2028-04-02", ...["t", "h", "a"].map((x) => hotel(x, x, x, { status: "interested" })))], "2028-04-15");
    expect(runs).toEqual([]);
  });

  it("Costa Rica: a check-in and a 'Check out and leave for the airport' card", () => {
    const runs = stayRuns([
      on("2026-03-04", hotel("in", "casita", "Modern Casita", { details: { title: "Check in at the Casita" } })),
      on("2026-03-12", hotel("out", "casita", "Modern Casita", { details: { title: "Check out and leave for the airport" } })),
    ], "2026-03-12");
    expect(runs[0]).toMatchObject({ cardId: "in", checkOut: "2026-03-12", nights: 8 });
  });
});

describe("the stay shown on a day", () => {
  const runs = stayRuns([on("2026-04-22", hotel("nh", "nh", "NH")), on("2026-04-24", hotel("b", "b", "Banco", { details: { check_out: "2026-04-28" } }))], "2026-04-28");
  it("on a changeover day, the hotel checked into", () => expect(stayOn(runs, "2026-04-24")?.title).toBe("Banco"));
  it("between, the hotel whose night it is", () => expect(stayOn(runs, "2026-04-23")?.title).toBe("NH"));
  it("on the morning of check-out, the hotel left", () => expect(stayOn(runs, "2026-04-28")?.title).toBe("Banco"));
});

describe("a written check-out", () => {
  it("ignores text that is not a date", () => expect(writtenCheckOut({ check_out_date: "Tue, Apr 28" }, "2026-04-24")).toBeNull());
  it("ignores a date before check-in that cannot be mended", () => expect(writtenCheckOut({ check_out: "2026-01-01" }, "2026-04-24")).toBeNull());
});
