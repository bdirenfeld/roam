import { describe, it, expect } from "vitest";
import { cleanPorts, portLabel, nextPort } from "./ports";
import { extractBookings } from "./prompt";

describe("a cruise's ports of call (17 Nov 2026, Don's Iceland cruise)", () => {
  it("keeps real ports in date order, drops days at sea and junk, tidies the times", () => {
    expect(cleanPorts([
      { date: "2027-07-22", port: "Ísafjörður, Iceland", arrive: "8:00", depart: "18:00" },
      { date: "2027-07-21", port: "Grundarfjörður, Iceland", arrive: "07:00", depart: "18:00:00" },
      { date: "2027-07-25", port: "At sea", arrive: null, depart: null },
      { date: "July 26", port: "Stornoway", arrive: "07:00", depart: "16:00" },
      { date: "2027-07-27", port: "", arrive: null, depart: null },
      "nonsense",
    ])).toEqual([
      { date: "2027-07-21", port: "Grundarfjörður, Iceland", arrive: "07:00", depart: "18:00" },
      { date: "2027-07-22", port: "Ísafjörður, Iceland", arrive: "08:00", depart: "18:00" },
    ]);
    expect(cleanPorts(null)).toBeNull();
    expect(cleanPorts([{ date: "2027-07-25", port: "Scenic cruising" }])).toBeNull();
  });

  it("the reader's cruise keeps its ports; any other booking loses a stray ports field", () => {
    const answer = JSON.stringify([
      { type: "cruise", title: "Viking Mars", date: "2027-07-20", address: "Reykjavík", check_out_date: "2027-07-30", ports: [{ date: "2027-07-21", port: "Grundarfjörður, Iceland", arrive: "07:00", depart: "18:00" }] },
      { type: "hotel", title: "Hótel Borg", ports: [{ date: "2027-07-21", port: "x" }] },
    ]);
    const [cruise, hotel] = extractBookings(answer);
    expect(cruise.ports).toEqual([{ date: "2027-07-21", port: "Grundarfjörður, Iceland", arrive: "07:00", depart: "18:00" }]);
    expect(hotel.ports).toBeNull();
  });

  it("a port's card is named for its town", () => {
    expect(portLabel("Grundarfjörður, Iceland")).toBe("Grundarfjörður");
    expect(portLabel("Akureyri")).toBe("Akureyri");
  });
});

describe("+ Add a port", () => {
  it("the day after the last port, or after boarding; never past the leaving day", () => {
    expect(nextPort([], "2027-07-20", "2027-07-30").date).toBe("2027-07-21");
    expect(nextPort([{ date: "2027-07-23", port: "Akureyri", arrive: null, depart: null }], "2027-07-20", "2027-07-30").date).toBe("2027-07-24");
    expect(nextPort([{ date: "2027-07-30", port: "x", arrive: null, depart: null }], "2027-07-20", "2027-07-30")).toEqual({ date: "2027-07-30", port: "", arrive: null, depart: null });
  });
});

describe("a night in port (17 Nov 2026)", () => {
  it("the same port two days running is one overnight stop", () => {
    expect(cleanPorts([
      { date: "2027-07-22", port: "Ísafjörður, Iceland", arrive: "08:00", depart: null },
      { date: "2027-07-23", port: "Ísafjörður", arrive: null, depart: "18:00" },
      { date: "2027-07-24", port: "Akureyri", arrive: "07:00", depart: "17:00" },
    ])).toEqual([
      { date: "2027-07-22", port: "Ísafjörður, Iceland", arrive: "08:00", depart: "18:00", overnight: true },
      { date: "2027-07-24", port: "Akureyri", arrive: "07:00", depart: "17:00" },
    ]);
  });
  it("keeps the reader's own overnight flag; a port two days apart stays two stops", () => {
    expect(cleanPorts([{ date: "2027-07-22", port: "Reykjavík", arrive: "08:00", depart: "18:00", overnight: true }])![0].overnight).toBe(true);
    expect(cleanPorts([{ date: "2027-07-20", port: "Reykjavík", arrive: "08:00", depart: "18:00" }, { date: "2027-07-22", port: "Reykjavík", arrive: "08:00", depart: "18:00" }])).toHaveLength(2);
  });
});
