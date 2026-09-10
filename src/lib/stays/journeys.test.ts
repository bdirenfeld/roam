import { describe, it, expect } from "vitest";
import journeys from "./fixtures/journeys.json";
import { buildStayBrief, countryOfPins, type BriefPin, type StayBrief } from "./brief";
import { areaHeadline, areaLine, splitText } from "./text";

/**
 * Every journey Brennan has, run through the brief and read the way he would.
 *
 * "Where to stay" shipped on 9 Sept 2026 verified on Tuscany alone. His first
 * tap on Japan showed every row reading "Kagoshima 21 h 44 · adds 13 hours of
 * driving": a cluster hours away is a second base, not a day trip. The same
 * pull of all nine journeys found the airports on Australia and Costa Rica
 * stored as `flight_arrival`, not `transit`, so the airport anchor had been
 * silently missing on both — and Rome's departure flight is a pin at Toronto
 * Pearson, which must never become a Rome anchor.
 *
 * The fixture is `fixtures/journeys.json`: each journey's placed pins, pulled
 * from the live database (see roam-ship §3 for how). Refresh it when journeys
 * change; add a case here whenever a journey shows something new.
 */

interface Fixture {
  title: string; startDate: string; endDate: string;
  partyAges: number[] | null; partySize: number | null; archived: boolean; pins: BriefPin[];
}
const ALL = journeys as Fixture[];

/** The country segment of an address, or null when the address stops at a postal code. */
function country(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(",").map((s) => s.trim());
  const last = parts[parts.length - 1] || "";
  if (!last || /\d/.test(last) || parts.length < 2) return null;
  return last;
}

const briefs = new Map<string, StayBrief>();
for (const j of ALL) {
  briefs.set(j.title, buildStayBrief({ startDate: j.startDate, endDate: j.endDate, partyAges: j.partyAges, partySize: j.partySize, pins: j.pins }));
}

describe("the brief over every journey", () => {
  it("covers all nine journeys, archived ones included", () => {
    expect(ALL.length).toBeGreaterThanOrEqual(9);
    expect(ALL.some((j) => j.archived)).toBe(true);
  });

  for (const j of ALL) {
    const b = briefs.get(j.title)!;

    it(`${j.title}: nights, stay days and labels make sense`, () => {
      expect(b.nights).toBe(b.days - 1);
      expect(b.stayDays).toBeLessThanOrEqual(b.days - 1);
      expect(b.stayDays).toBeGreaterThanOrEqual(0);
      for (const a of b.anchors) {
        expect(a.label.trim().length).toBeGreaterThan(1);
        expect(/^\d/.test(a.label)).toBe(false);
      }
    });

    it(`${j.title}: every anchor is in the same country as the evening centre`, () => {
      if (!b.evening) return;
      const evPin = j.pins.find((p) => p.dayDate && (p.startTime ?? "") >= "17:00");
      const home = country(evPin?.address ?? null);
      if (!home) return;
      for (const a of b.anchors) {
        // Find a pin that produced this anchor and check its country.
        const near = j.pins.find((p) => Math.abs(p.lat - a.lat) < 0.2 && Math.abs(p.lng - a.lng) < 0.2);
        if (near?.address) expect(country(near.address), `${a.kind} anchor "${a.label}"`).toBe(home);
      }
    });
  }
});

describe("what each journey should say", () => {
  const ev = (t: string) => briefs.get(t)?.evening?.label;
  const airport = (t: string) => briefs.get(t)?.anchors.find((a) => a.kind === "airport")?.label ?? null;

  it("Tuscany: south of Lucca toward Pisa, Pisa airport, Florence a split candidate", () => {
    const b = briefs.get("Tuscany")!;
    expect(ev("Tuscany")).toBe("Lucca");
    expect(airport("Tuscany")).toBe("Pisa");
    expect(areaHeadline(b)).toBe("South of Lucca, toward Pisa.");
    expect(b.splitCandidates.map((s) => s.label)).toEqual(["Firenze"]);
  });

  it("Costa Rica: evenings in Tamarindo, the Liberia airport counts, the inland day trips do not move the base", () => {
    const b = briefs.get("Costa Rica")!;
    expect(ev("Costa Rica")).toBe("Tamarindo");
    expect(airport("Costa Rica")).toBe("Liberia");
    expect(b.kind).toBe("house");
    expect(b.splitCandidates).toEqual([]);
  });

  it("Australia: Sydney evenings, Sydney airport (stored as a flight, not transit), a hotel for three", () => {
    const b = briefs.get("Australia")!;
    expect(ev("Australia")).toBe("Sydney");
    expect(airport("Australia")).toBe("Mascot");
    expect(b.fit).toEqual({ bedrooms: 2, baths: 1, askGroundFloor: true, askCot: false });
  });

  it("Rome: the departure flight at Toronto Pearson is never an anchor", () => {
    const b = briefs.get("Rome April 2026")!;
    expect(ev("Rome April 2026")).toBe("Roma");
    expect(b.anchors.some((a) => a.lat > 43)).toBe(false);
    expect(airport("Rome April 2026")).not.toBeNull();
  });

  it("New York: a hotel for two in New York, LaGuardia as the airport", () => {
    const b = briefs.get("New York (Mia & Daddy)")!;
    expect(ev("New York (Mia & Daddy)")).toBe("New York");
    expect(b.kind).toBe("hotel");
    expect(airport("New York (Mia & Daddy)")).toBe("East Elmhurst");
  });

  it("Japan: a Tokyo evening centre and Kagoshima far enough to be a second base, not a day trip", () => {
    const b = briefs.get("Japan")!;
    expect(b.evening).not.toBeNull();
    const far = b.anchors.filter((a) => a.kind === "daytrip" && a.kmFromEvening > 500);
    for (const a of far) expect(a.kmFromEvening).toBeGreaterThan(500);
    // Whatever is that far away shows up as a split candidate when visited on 2+ days.
    for (const a of far.filter((a) => a.days >= 2)) expect(b.splitCandidates.map((s) => s.label)).toContain(a.label);
  });

it("Santa Barbara: the centre follows the pins, not one polo match at five", () => {
    // Ranking on evenings alone put this on Carpinteria, where he has a single
    // pin, while ten of thirteen sat in Santa Barbara and Montecito, and every
    // suggestion came back fifteen minutes from the wrong town (10 Sept 2026).
    const b = briefs.get("Santa Barbara Anniversary 2026")!;
    expect(ev("Santa Barbara Anniversary 2026")).toBe("Montecito");
    expect(b.evening!.label).not.toBe("Carpinteria");
  });

  it("Japan: a centre won on pins alone does not claim to have evenings", () => {
    const b = briefs.get("Japan")!;
    if (!b.evening!.evenings) expect(areaLine(b, null)).toMatch(/around/);
  });

  it("Japan: thirteen nights reaching Kagoshima is not one base", () => {
    // Nothing on this journey is on the itinerary — all 31 pins carry day
    // one's id and the Plan board is empty — so the old rule, which wanted a
    // cluster visited on 2+ separate DAYS, could never fire and a trip
    // spanning 1,000 km read "One base is enough" (Brennan, 10 Sept 2026).
    const b = briefs.get("Japan")!;
    expect(b.bases.length).toBeGreaterThan(1);
    expect(b.bases[0].label).toBe("Tokyo");
    expect(b.bases.reduce((n, x) => n + x.nights, 0)).toBe(b.nights);
    for (const x of b.bases) expect(x.nights).toBeGreaterThanOrEqual(2);
    expect(splitText(b, {})).toMatch(/Too spread out for one base/);
  });

  it("every other journey still needs only one base", () => {
    for (const j of ALL) {
      if (j.title === "Japan") continue;
      const b = briefs.get(j.title)!;
      expect(b.bases.length, `${j.title} wants ${b.bases.length} bases`).toBe(1);
      expect(b.bases[0].nights).toBe(b.nights);
    }
  });

  it("Last Week of Summer: at home, no airport, and a day out is still a day out", () => {
    const b = briefs.get("Last Week of Summer")!;
    expect(airport("Last Week of Summer")).toBeNull();
    expect(b.splitCandidates).toEqual([]);
  });
});

describe("the search's own inputs, per journey", () => {
  it("knows which country each journey is in, so the search is not biased home", () => {
    const countries = Object.fromEntries(ALL.map((j) => [j.title, countryOfPins(j.pins)]));
    expect(countries).toMatchObject({
      "Australia": "Australia",
      "Costa Rica": "Costa Rica",
      "Japan": "Japan",
      "New York (Mia & Daddy)": "USA",
      "Palm Springs": "USA",
      "Rome April 2026": "Italy",
      "Santa Barbara Anniversary 2026": "USA",
      "Tuscany": "Italy",
      "Last Week of Summer": "Canada",
    });
  });

  it("every journey has a centre to search around", () => {
    for (const j of ALL) {
      const b = briefs.get(j.title)!;
      expect(b.evening, `${j.title} has no centre`).not.toBeNull();
    }
  });
});
