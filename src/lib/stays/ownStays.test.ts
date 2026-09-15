import { describe, it, expect } from "vitest";
import { bookedStay, pickSaved, isNotAStay, MAX_SAVED_ROWS } from "./ownStays";

// Real shapes off the live database, 15 Sept 2026.
const tuscany = [
  { place_id: "bottino", title: "Villa Bottino", lat: 43.92, lng: 10.43, scheduledDays: ["2027-08-18", "2027-08-29"] },
  { place_id: "guinigi", title: "VILLA GUINIGI EXCLUSIVE RESIDENCE & POOL", lat: 43.91, lng: 10.57, scheduledDays: null },
];
const rome = [
  { place_id: "nh", title: "Hotel NH Collection Roma Palazzo Cinquecento", lat: 41.9, lng: 12.5, scheduledDays: ["2026-04-22"] },
  { place_id: "banco", title: "Banco 19 B&B", lat: 41.9, lng: 12.47, scheduledDays: ["2026-04-24"] },
];
const japan = [
  { place_id: "hoshinoya", title: "HOSHINOYA Tokyo", lat: 35.69, lng: 139.77, scheduledDays: [] },
  { place_id: "asaba", title: "Asaba Ryokan", lat: 34.97, lng: 138.92, scheduledDays: null },
];

describe("bookedStay", () => {
  it("is the place the journey names, even when the name carries an address", () => {
    const cr = [{ place_id: "casita", title: "Modern Casita", lat: 10.28, lng: -85.84, scheduledDays: ["2026-03-04", "2026-03-12"] }];
    expect(bookedStay(cr, "Modern Casita, Playa Langosta")).toBe("casita");
    expect(bookedStay(tuscany, "Villa Bottino")).toBe("bottino");
  });
  it("without a name, is the stay scheduled on the earliest day", () => {
    expect(bookedStay(rome, null)).toBe("nh");
  });
  it("a saved idea that merely holds a day is not booked", () => {
    expect(bookedStay(japan, null)).toBeNull();
  });
  it("a name that matches nothing falls through to the schedule", () => {
    expect(bookedStay(tuscany, "Some Other Villa")).toBe("bottino");
    expect(bookedStay(japan, "Some Other Hotel")).toBeNull();
  });
});

describe("pickSaved", () => {
  const tokyo = { lat: 35.68, lng: 139.76 };
  const rows = [
    { name: "Gora Kadan Fuji", lat: 35.37, lng: 138.86 },
    { name: "HOSHINOYA Tokyo", lat: 35.69, lng: 139.77 },
    { name: "Asaba Ryokan", lat: 34.97, lng: 138.92 },
    { name: "Hamacho Hotel", lat: 35.68, lng: 139.79 },
  ];
  it("keeps at most two, the nearest to the base", () => {
    const out = pickSaved(rows, tokyo);
    expect(out).toHaveLength(MAX_SAVED_ROWS);
    expect(out.map((r) => r.name).sort()).toEqual(["HOSHINOYA Tokyo", "Hamacho Hotel"]);
  });
  it("a chosen or hearted row is never dropped, and does not push a nearer one out below the cap", () => {
    const out = pickSaved(rows.map((r) => (r.name === "Asaba Ryokan" ? { ...r, hearted: true } : r)), tokyo);
    expect(out.map((r) => r.name)).toEqual(["Asaba Ryokan", "HOSHINOYA Tokyo"]);
  });
  it("chosen and hearted together may exceed the cap — that was his decision", () => {
    const out = pickSaved(rows.map((r) => ({ ...r, chosen: r.name === "Gora Kadan Fuji", hearted: r.name === "Asaba Ryokan" || r.name === "Hamacho Hotel" })), tokyo);
    expect(out).toHaveLength(3);
  });
  it("an empty list is an empty list", () => {
    expect(pickSaved([], tokyo)).toEqual([]);
  });
});

describe("isNotAStay", () => {
  it("turns the kennel away, by name or by type", () => {
    expect(isNotAStay("Holiday Pet Care")).toBe(true);
    expect(isNotAStay("Somewhere Nice", ["pet_store", "point_of_interest"])).toBe(true);
  });
  it("keeps every real stay, however it is named", () => {
    for (const n of ["Villa Bottino", "La Magnolia", "HOSHINOYA Tokyo", "Modern Casita", "Montecito Inn", "11 Howard", "Banco 19 B&B"]) {
      expect(isNotAStay(n)).toBe(false);
    }
    expect(isNotAStay("Dog & Duck", ["lodging"])).toBe(false);
  });
});
