import { describe, it, expect } from "vitest";
import { isPortCard, portName, minutesAshore, ashoreLabel } from "./port";

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
