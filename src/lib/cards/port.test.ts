import { describe, it, expect } from "vitest";
import { isPortCard, portName, minutesAshore, ashoreLabel, isOvernight, nightsInPort, nightsPatch, portDayRole, otherPortDays, addIsoDays } from "./port";

// Don's Iceland cruise, as he entered the stops (live rows, 17 Nov 2026), once marked Port.
const grundarfjordur = { start_time: "07:00:00", end_time: "18:00:00", place: { sub_type: "port", title: "Grundarfjörður" } };

describe("port cards", () => {
  it("knows a port by its kind, not its name", () => {
    expect(isPortCard(grundarfjordur)).toBe(true);
    // As he first entered them: an Explore place named for the town.
    expect(isPortCard({ ...grundarfjordur, place: { sub_type: "self_directed", title: "Grundarfjörður" } })).toBe(false);
    expect(isPortCard({ start_time: null, end_time: null, place: null })).toBe(false);
  });

  it("time ashore is docks → all aboard", () => {
    expect(minutesAshore(grundarfjordur)).toBe(660);
    expect(ashoreLabel(grundarfjordur)).toBe("11 h ashore");
    expect(ashoreLabel({ ...grundarfjordur, start_time: "08:30:00" })).toBe("9 h 30 ashore");
  });

  it("no all-aboard time, or one not after docking, says nothing", () => {
    expect(ashoreLabel({ ...grundarfjordur, end_time: null })).toBeNull();
    expect(ashoreLabel({ ...grundarfjordur, end_time: "06:00:00" })).toBeNull();
  });

  it("names the port by its place, with a fallback", () => {
    expect(portName(grundarfjordur)).toBe("Grundarfjörður");
    expect(portName({ ...grundarfjordur, place: { sub_type: "port", title: "  " } })).toBe("Port");
  });
});

describe("overnight in port (17 Nov 2026)", () => {
  const isa = { start_time: "08:00:00", end_time: "18:00:00", place: { sub_type: "port", title: "Ísafjörður" }, details: { overnight: true } };
  it("docks 8am, all aboard 6pm the next day: 34 hours ashore", () => {
    expect(isOvernight(isa)).toBe(true);
    expect(minutesAshore(isa)).toBe(34 * 60);
    expect(ashoreLabel(isa)).toBe("34 h ashore");
  });
  it("an evening arrival leaving next morning works too; without the flag it is the same day", () => {
    expect(minutesAshore({ ...isa, start_time: "20:00:00", end_time: "07:00:00" })).toBe(11 * 60);
    expect(isOvernight({ ...isa, details: {} })).toBe(false);
    expect(minutesAshore({ ...isa, details: {} })).toBe(10 * 60);
  });
});

describe("nights in port, picked on the calendar (18 Nov 2026)", () => {
  const rvk = { start_time: "08:00:00", end_time: "18:00:00", place: { sub_type: "port", title: "Reykjavík" }, details: { nights: 2 } };
  it("docks Monday 8am, all aboard Wednesday 6pm: 2 nights, 58 hours ashore", () => {
    expect(nightsInPort(rvk)).toBe(2);
    expect(isOvernight(rvk)).toBe(true);
    expect(ashoreLabel(rvk)).toBe("58 h ashore");
  });
  it("the old overnight flag reads as one night; nonsense reads as none", () => {
    expect(nightsInPort({ ...rvk, details: { overnight: true } })).toBe(1);
    expect(nightsInPort({ ...rvk, details: { nights: 0 } })).toBe(0);
    expect(nightsInPort({ ...rvk, details: { nights: "2" } })).toBe(0);
    expect(nightsInPort({ ...rvk, end_time: null })).toBe(0);
  });
  it("writing nights clears the old flag, and 0 leaves neither", () => {
    expect(nightsPatch({ overnight: true, notes: "x" }, 2)).toEqual({ notes: "x", nights: 2 });
    expect(nightsPatch({ nights: 3, notes: "x" }, 0)).toEqual({ notes: "x" });
  });
  it("each day of the stay has its role", () => {
    expect(["2027-07-26", "2027-07-27", "2027-07-28", "2027-07-29", "2027-07-25"].map((d) => portDayRole(rvk, "2027-07-26", d))).toEqual(["docks", "in-port", "leaves", null, null]);
    expect(portDayRole({ ...rvk, details: {} }, "2027-07-26", "2027-07-27")).toBeNull();
  });
  it("other ports' days, for the calendar's dots", () => {
    const ports = [
      { id: "a", day_id: "d1", ...rvk },
      { id: "b", day_id: "d4", start_time: "07:00:00", end_time: "19:00:00", place: { sub_type: "port", title: "Portland" }, details: {} },
    ];
    const dates: Record<string, string> = { d1: "2027-07-26", d4: "2027-07-29" };
    expect(otherPortDays(ports, (id) => dates[id], "b")).toEqual({ "2027-07-26": "Reykjavík", "2027-07-27": "Reykjavík", "2027-07-28": "Reykjavík" });
    expect(otherPortDays(ports, (id) => dates[id], "a")).toEqual({ "2027-07-29": "Portland" });
    expect(addIsoDays("2027-07-31", 1)).toBe("2027-08-01");
  });
});
