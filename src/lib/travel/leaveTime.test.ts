import { describe, it, expect } from "vitest";
import { planLeave, withLeave, type DayStop } from "./leaveTime";

// Brennan's real Thu 26 Aug 2027 (Tuscany), as it sits in the database.
const SAN_MICHELE = { lat: 43.8430, lng: 10.5050 };
const STATION_CAR_PARK = { lat: 43.8374125, lng: 10.5061477 };
const AUG26: DayStop[] = [
  { title: "Lucca Wandering — Walls → San Michele → Anfiteatro → Torre Guinigi", start_time: "09:15:00", end_time: "15:30:00", ...SAN_MICHELE },
  { title: "Forno a Vapore Amedeo Giusti", start_time: "12:30:00", end_time: "13:15:00", lat: 43.8441, lng: 10.5037 },
  { title: "Dinner at the villa", start_time: "18:00:00", end_time: "19:00:00", lat: null, lng: null },
];

describe("planLeave — when a trip added by hand leaves (14 Nov 2026)", () => {
  it("arrives by the stop it is going to: villa → Lucca station car park, 10 min, for the 9:15 walk", () => {
    const p = planLeave(AUG26, STATION_CAR_PARK, 10);
    expect(p.leave).toBe("09:05");
    expect(p.arrive).toBe("09:15");
    expect(p.why).toEqual({ kind: "arrive_by", title: AUG26[0].title, at: "09:15" });
  });

  it("the earliest nearby stop wins, not the lunch later in the same town", () => {
    expect(planLeave(AUG26, SAN_MICHELE, 30).leave).toBe("08:45");
  });

  it("rounds the trip to five minutes, like the end time a travel-time tap sets", () => {
    expect(planLeave(AUG26, STATION_CAR_PARK, 12).leave).toBe("09:05");
  });

  it("nothing near where you are going: leave when the day's last timed stop ends", () => {
    const p = planLeave(AUG26, { lat: 43.7766715, lng: 11.2479159 }, 80);
    expect(p.leave).toBe("19:00");
    expect(p.arrive).toBe("20:20");
    expect(p.why?.kind).toBe("after");
    expect(p.why?.title).toBe("Dinner at the villa");
  });

  it("a day with nothing timed leaves at 9:00", () => {
    expect(planLeave([{ title: "Gelato", start_time: null, end_time: null, lat: 43.84, lng: 10.5 }], STATION_CAR_PARK, 10))
      .toEqual({ leave: "09:00", arrive: "09:10", why: null });
  });

  it("no travel time known: the leave time stands, no arrival is made up", () => {
    const p = planLeave(AUG26, STATION_CAR_PARK, null);
    expect(p.leave).toBe("09:15");
    expect(p.arrive).toBeNull();
  });

  it("a time typed by hand moves the arrival with it", () => {
    expect(withLeave("08:30", 10)).toEqual({ leave: "08:30", arrive: "08:40", why: null });
  });
});

describe("planLeave — another travel card is not a stop (live test, 14 Nov 2026)", () => {
  it("the morning drive to the station car park is skipped; the trip arrives by the 9:15 walk", () => {
    const withDrive: DayStop[] = [
      { title: "Villa Zambaldi → Lucca (station car park)", start_time: "08:45:00", end_time: "08:55:00", ...STATION_CAR_PARK, travel: true },
      ...AUG26,
    ];
    const p = planLeave(withDrive, SAN_MICHELE, 15);
    expect(p.why).toEqual({ kind: "arrive_by", title: AUG26[0].title, at: "09:15" });
    expect(p.leave).toBe("09:00");
  });
});
