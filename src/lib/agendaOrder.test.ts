import { describe, it, expect } from "vitest";
import { agendaOrder, type OrderableCard } from "./agendaOrder";

/**
 * Rome, 22 April 2026, day 1 — the six real cards, copied from the database on
 * 2026-09-07 with their real times and positions.
 *
 * This is the day the bug was visible on. The flight leaves Toronto at 19:45
 * and lands in Rome at 10:20 the next morning; the card is stored departure
 * first. Sorted on raw `start_time` it lands FOURTH, between the aperitivo and
 * dinner — a flight you are still on while apparently drinking in Rome. The
 * owner's agenda never showed that, because it sorts through `cardTimes`. The
 * guest itinerary did, for eight weeks, because it had its own copy of the
 * rule that read `start_time` directly.
 */
function card(
  place: string,
  subType: string | null,
  start: string | null,
  end: string | null,
  position: number,
  details: Record<string, unknown> = {},
): OrderableCard & { place_title: string } {
  return {
    place_title: place,
    start_time: start,
    end_time: end,
    position,
    details,
    place: subType === null ? null : { sub_type: subType },
  };
}

const ROME_DAY_1 = [
  card("Hotel NH Collection", "hotel", "12:00:00", null, 2),
  card("Colosseum", "guided", "15:30:00", "18:30:00", 3),
  card("Aperitivo — Bar Farnese", "bar", "18:30:00", "20:00:00", 4),
  card("Flight to Rome — Air Canada", "flight_arrival", "19:45:00", "10:20:00", 1, {
    departure_time: "19:45",
    arrival_time: "10:20+1day",
  }),
  card("Roscioli Salumeria con Cucina", "restaurant", "20:00:00", "22:30:00", 5),
  card("Night Walk — Pantheon, Navona, Trevi", "self_directed", "21:30:00", "23:00:00", 6),
];

const order = (cards: typeof ROME_DAY_1) =>
  [...cards].sort(agendaOrder).map((c) => c.place_title);

describe("agendaOrder — Rome day 1, the day that showed the bug", () => {
  it("puts the arriving flight first, at the time it lands", () => {
    expect(order(ROME_DAY_1)[0]).toBe("Flight to Rome — Air Canada");
  });

  it("orders the whole day by when things happen", () => {
    expect(order(ROME_DAY_1)).toEqual([
      "Flight to Rome — Air Canada", // lands 10:20
      "Hotel NH Collection", // 12:00
      "Colosseum", // 15:30
      "Aperitivo — Bar Farnese", // 18:30
      "Roscioli Salumeria con Cucina", // 20:00
      "Night Walk — Pantheon, Navona, Trevi", // 21:30
    ]);
  });

  it("would place the flight fourth if it sorted on stored start_time", () => {
    // Not a test of our code — a record of what the guest page used to do, so
    // the difference this function makes is written down and not just claimed.
    const naive = [...ROME_DAY_1].sort((a, b) =>
      (a.start_time ?? "").localeCompare(b.start_time ?? ""),
    );
    expect(naive.map((c) => c.place_title)[3]).toBe("Flight to Rome — Air Canada");
  });

  it("does not depend on the order the rows arrive in", () => {
    const reversed = [...ROME_DAY_1].reverse();
    expect(order(reversed)).toEqual(order(ROME_DAY_1));
  });
});

describe("agendaOrder — untimed cards", () => {
  const timed = card("Colosseum", "guided", "15:30:00", null, 9);
  const untimedA = card("Pick up the keys", null, null, null, 1);
  const untimedB = card("Ring the villa", null, null, null, 2);

  it("sends untimed cards to the end of the day", () => {
    expect(order([untimedA, timed, untimedB])).toEqual([
      "Colosseum",
      "Pick up the keys",
      "Ring the villa",
    ]);
  });

  it("holds untimed cards in position order, not input order", () => {
    expect(order([untimedB, untimedA])).toEqual(["Pick up the keys", "Ring the villa"]);
  });

  it("treats a missing position as zero rather than throwing", () => {
    // The guest projection types position as nullable; the owner's does not.
    const noPos = { ...untimedA, position: null } as OrderableCard & { place_title: string };
    expect(() => order([noPos, untimedB])).not.toThrow();
  });
});

describe("agendaOrder — same time", () => {
  it("breaks a tie on position", () => {
    const a = card("Coffee", "coffee", "09:00:00", null, 2);
    const b = card("Bakery", "coffee", "09:00:00", null, 1);
    expect(order([a, b])).toEqual(["Bakery", "Coffee"]);
  });
});
