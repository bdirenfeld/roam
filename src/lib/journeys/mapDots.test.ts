import { describe, it, expect } from "vitest";
import { ALL, COMING_UP, EARLIER, dotBounds, dotDates, dotFilters, filterDots, journeyDots, placeOf, showsMap, type DotSource } from "./mapDots";

// Brennan's journeys as they stood on 25 Nov 2026 (titles, places, dates and coordinates from the live database).
const t = (id: string, title: string, destination: string, lat: number | null, lng: number | null, start: string, end: string): DotSource =>
  ({ id, title, destination, destination_lat: lat, destination_lng: lng, start_date: start, end_date: end, cover_image_url: null });
const upcoming = [
  t("voss", "Chris Voss Training", "Irving, TX, USA", 32.814, -96.955, "2027-03-14", "2027-03-17"),
  t("tus", "Tuscany", "Tuscany, Italy", 43.567, 10.981, "2027-08-24", "2027-09-05"),
];
const past = [
  t("aus", "Australia", "Sydney, NSW, Australia", -33.869, 151.209, "2026-02-15", "2026-02-20"),
  t("cr", "Costa Rica", "Tamarindo, Guanacaste, Costa Rica", 10.299, -85.837, "2026-03-04", "2026-03-12"),
  t("rome", "Rome April 2026", "Rome, Italy", 41.903, 12.496, "2026-04-22", "2026-04-28"),
  t("ny", "New York", "New York, NY, USA", 40.713, -74.006, "2026-07-23", "2026-07-26"),
  t("sum", "Last Week of Summer", "Toronto & the GTA", 43.769, -79.459, "2026-08-31", "2026-09-04"),
];
const dots = journeyDots(upcoming, past, { voss: "/trips/voss/plan" }, "Sample trip — look around");

describe("the dots on the Journeys map", () => {
  it("one dot per journey: five taken (hollow) then two coming up (solid, drawn on top)", () => {
    expect(dots.map((d) => [d.id, d.upcoming])).toEqual([["aus", false], ["cr", false], ["rome", false], ["ny", false], ["sum", false], ["voss", true], ["tus", true]]);
  });

  it("a dot knows its place, its dates and where a click goes", () => {
    const voss = dots.find((d) => d.id === "voss")!;
    expect(voss).toMatchObject({ place: "Irving", lat: 32.814, lng: -96.955, year: 2027, dates: "Mar 14–17, 2027", href: "/trips/voss/plan" });
    expect(dots.find((d) => d.id === "tus")!.href).toBe("/trips/tus");
    expect(dots.find((d) => d.id === "sum")!.place).toBe("Toronto & the GTA"); // the week at home sits on Toronto
  });

  it("a journey with no place, at 0,0, or the Example has no dot", () => {
    const some = journeyDots(
      [t("a", "No place", "", null, null, "2027-01-01", "2027-01-02"), t("b", "Zero", "Somewhere", 0, 0, "2027-01-01", "2027-01-02"), t("c", "Sample trip — look around", "Paris, France", 48.857, 2.352, "2027-06-03", "2027-06-10")],
      [], {}, "Sample trip — look around",
    );
    expect(some).toEqual([]);
  });

  it("no map until there are two journeys to put on it", () => {
    expect(showsMap(dots)).toBe(true);
    expect(showsMap(dots.slice(0, 1))).toBe(false);
    expect(showsMap([])).toBe(false);
  });
});

describe("the buttons over the map", () => {
  it("All, Coming up, then a button per past year", () => {
    expect(dotFilters(dots)).toEqual([ALL, COMING_UP, "2026"]);
  });

  it("nothing coming up: no Coming up button", () => {
    expect(dotFilters(journeyDots([], past, {}))).toEqual([ALL, "2026"]);
  });

  it("many years: the four newest get a button, the rest share Earlier", () => {
    const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025].map((y) => t(`y${y}`, `Trip ${y}`, "Lisbon, Portugal", 38.7, -9.1, `${y}-05-01`, `${y}-05-08`));
    const many = journeyDots(upcoming, years, {});
    expect(dotFilters(many)).toEqual([ALL, COMING_UP, "2025", "2024", "2023", "2022", EARLIER]);
    expect(filterDots(many, EARLIER).map((d) => d.year)).toEqual([2019, 2020, 2021]);
  });

  it("each button shows only its journeys", () => {
    expect(filterDots(dots, ALL)).toHaveLength(7);
    expect(filterDots(dots, COMING_UP).map((d) => d.id)).toEqual(["voss", "tus"]);
    expect(filterDots(dots, "2026").map((d) => d.id)).toEqual(["aus", "cr", "rome", "ny", "sum"]);
    // A journey coming up in 2027 is not under a "2027" year button: years are for journeys taken.
    expect(filterDots(dots, "2027")).toEqual([]);
  });

  it("the frame around a set of dots", () => {
    expect(dotBounds(filterDots(dots, COMING_UP))).toEqual([[-96.955, 32.814], [10.981, 43.567]]);
    expect(dotBounds([])).toBeNull();
  });
});

describe("the words on a dot", () => {
  it("dates in one month, across months, across years, and a single day", () => {
    expect(dotDates("2027-03-14", "2027-03-17")).toBe("Mar 14–17, 2027");
    expect(dotDates("2027-08-24", "2027-09-05")).toBe("Aug 24 – Sep 5, 2027");
    expect(dotDates("2026-12-28", "2027-01-03")).toBe("Dec 28, 2026 – Jan 3, 2027");
    expect(dotDates("2027-03-14", "2027-03-14")).toBe("Mar 14, 2027");
  });

  it("the place is the first part of the destination, or the title when there is none", () => {
    expect(placeOf("Sydney, NSW, Australia", "Australia")).toBe("Sydney");
    expect(placeOf(null, "Somewhere")).toBe("Somewhere");
    expect(placeOf("  ", "Somewhere")).toBe("Somewhere");
  });
});
