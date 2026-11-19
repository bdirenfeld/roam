import { describe, it, expect } from "vitest";
import { homeRole, homePlan, isDomestic, savedDrive, homeKeyOf, homeCode, minsLabel, homeBands } from "./homeLegs";

// His flights as stored (19 Nov 2026).
const tuscanyOut = { origin_airport: "YYZ", arriving_at: "PSA" };
const romeHome = { origin_airport: "Roma Fiumicino Airport (FCO)", arriving_at: "Toronto-Pearson Int. (YYZ)" };
const pisaMid = { origin_airport: "Frankfurt FRA", arriving_at: "Pisa PSA" };

describe("getting to the airport and home (19 Nov 2026)", () => {
  it("knows which flights leave from home and which come back", () => {
    expect(homeRole(tuscanyOut, "YYZ")).toBe("leaving");
    expect(homeRole(romeHome, "Toronto Pearson (YYZ)")).toBe("returning");
    expect(homeRole(pisaMid, "YYZ")).toBeNull();
    expect(homeRole(tuscanyOut, null)).toBeNull();
    expect(homeCode("Toronto Pearson (YYZ)")).toBe("YYZ");
  });

  it("Tuscany out, 7 PM, international: at Pearson by 4:00, leave home 3:30 with a 30-minute drive", () => {
    expect(homePlan("leaving", tuscanyOut, "19:00:00", null, 30)).toEqual({ role: "leaving", early: 180, drive: 30, atAirport: "16:00:00", leave: "15:30:00" });
  });

  it("no drive yet: the airport time still shows, the leave time waits", () => {
    expect(homePlan("leaving", tuscanyOut, "19:00:00", null, null)).toMatchObject({ atAirport: "16:00:00", leave: null });
  });

  it("Rome home lands 4:00 PM: an hour for bags and customs, a 35-minute drive, home about 5:35", () => {
    expect(homePlan("returning", romeHome, "12:25:00", "16:00:00", 35)).toEqual({ role: "returning", bags: 60, drive: 35, land: "16:00:00", home: "17:35:00" });
  });

  it("a flight in Canada: 2 h early and 30 min for bags; a flight can set its own", () => {
    expect(isDomestic("YYZ", "YVR")).toBe(true);
    expect(isDomestic("YYZ", "LAS")).toBe(false);
    expect(homePlan("leaving", { origin_airport: "YYZ", arriving_at: "YVR" }, "09:00:00", null, 30)).toMatchObject({ early: 120, atAirport: "07:00:00", leave: "06:30:00" });
    expect(homePlan("returning", { origin_airport: "YVR", arriving_at: "YYZ" }, null, "17:00:00", 30)).toMatchObject({ bags: 30, home: "18:00:00" });
    expect(homePlan("leaving", { ...tuscanyOut, airport_early_min: 150 }, "19:00:00", null, 30)).toMatchObject({ early: 150, leave: "16:00:00" });
  });

  it("a saved drive counts only for the home it was measured from", () => {
    const key = homeKeyOf(43.77, -79.41);
    expect(savedDrive({ home_drive: { from: key, mins: 30, traffic: true } }, key)).toBe(30);
    expect(savedDrive({ home_drive: { from: "1.000,1.000", mins: 30 } }, key)).toBeNull();
    expect(savedDrive({}, key)).toBeNull();
    expect(savedDrive({ home_drive: { from: key, mins: 21 } }, key)).toBeNull();
  });

  it("says lengths plainly", () => {
    expect([180, 150, 45].map(minsLabel)).toEqual(["3 h", "2 h 30", "45 min"]);
  });
});

describe("the week's home strips (19 Nov 2026)", () => {
  const ds = [{ id: "d0", date: "2027-08-24" }, { id: "d1", date: "2027-08-25" }];
  const key = homeKeyOf(43.77, -79.41);
  const out = { id: "yyz", day_id: "d0", start_time: "19:00:00", end_time: null, status: "in_itinerary", details: { origin_airport: "YYZ", arriving_at: "PSA", home_drive: { from: key, mins: 30, traffic: true } }, place: { title: "YYZ Terminal 1", sub_type: "flight_arrival" } };
  const land = { id: "psa", day_id: "d1", start_time: "11:30:00", end_time: "12:30:00", status: "in_itinerary", details: { origin_airport: "YYZ", arriving_at: "PSA" }, place: { title: "Pisa International Airport", sub_type: "flight_arrival" } };

  it("Tuscany out: the drive 3:30–4:00, then the airport 4:00–7:00, labelled", () => {
    const b = homeBands(ds, [out, land], "YYZ", key, 7, 23).get("d0")!;
    expect(b.map((x) => [x.kind, x.from, x.to, x.label])).toEqual([
      ["airport", 960, 1140, "At the airport · 3 h before"],
      ["drive", 930, 960, "Leave home 3:30 PM"],
    ]);
  });

  it("no saved drive: only the airport time; no home airport: nothing", () => {
    const bare = { ...out, details: { origin_airport: "YYZ", arriving_at: "PSA" } };
    expect(homeBands(ds, [bare, land], "YYZ", key, 7, 23).get("d0")!.map((x) => x.kind)).toEqual(["airport"]);
    expect(homeBands(ds, [out, land], null, key, 7, 23).size).toBe(0);
  });

  it("Rome home lands 4:00 PM: bags 4:00–5:00, then the drive to ~5:35", () => {
    const rd = [{ id: "r", date: "2026-04-28" }];
    const home = { id: "h", day_id: "r", start_time: "12:25:00", end_time: "16:00:00", status: "in_itinerary", details: { ...romeHome, home_drive: { from: key, mins: 35, traffic: true } }, place: { title: "Flight to Toronto", sub_type: "flight_departure" } };
    expect(homeBands(rd, [home], "YYZ", key, 7, 23).get("r")!.map((x) => [x.kind, x.from, x.to, x.label])).toEqual([
      ["bags", 960, 1020, "Bags and customs"],
      ["drive", 1020, 1055, "Home ~5:35 PM"],
    ]);
  });
});
