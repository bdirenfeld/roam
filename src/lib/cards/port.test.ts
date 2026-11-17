import { describe, it, expect } from "vitest";
import { isPortCard, portName, minutesAshore, ashoreLabel, isOvernight } from "./port";

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
