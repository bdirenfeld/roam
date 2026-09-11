import { describe, it, expect } from "vitest";
import { shortlist, cutReason, type Row, type ShortlistOpts } from "./shortlist";

/**
 * The test that looks at the LIST.
 *
 * Every number below came out of stay_candidates on 11 Sept 2026 — his own
 * journeys, the drive minutes Google actually returned, the names Google
 * actually gave. Nothing here was invented, because the last three rounds of
 * invented fixtures agreed with the code and he still found the problem in
 * two seconds.
 *
 * Each case asks one question: given what a real run had in front of it, is
 * the list it produced one a person would call sensible?
 */

const r = (name: string, toCentre: number, hours: number, kept = false): Row => ({ name, toCentre, hours, kept });
const OPTS = (radiusMin: number, nights: number): ShortlistOpts => ({ radiusMin, nights });

describe("New York — the one he opened", () => {
  // "For New York nothing is in Manhattan near my pins." Every Manhattan hotel
  // had been shown before, so they were skipped outright and the five slots
  // filled with brand-new places across the river.
  const ROWS = [
    r("Archer Hotel New York", 20, 3.6),
    r("Artezen Hotel", 29, 4.7),
    r("11 Howard", 29, 4.0),
    r("15 Minutes From Manhattan Luxury", 29, 5.0),
    r("Incredible NYC and Water Views 3 bedrooms", 28, 6.6),
    r("Rainforest Retreat Spacious 4BR / 2BA", 40, 7.0),
    r("Massive 1,000 sq ft", 44, 6.9),
  ];

  it("keeps what is in the city and cuts what is across the river", () => {
    const out = shortlist(ROWS, OPTS(15, 3)).map((x) => x.name);
    expect(out).toContain("Archer Hotel New York");
    expect(out).toContain("Artezen Hotel");
    expect(out).not.toContain("Rainforest Retreat Spacious 4BR / 2BA");
    expect(out).not.toContain("Massive 1,000 sq ft");
  });

  it("names the reason, so a cut is never a mystery", () => {
    const best = 3.6;
    expect(cutReason(r("Massive 1,000 sq ft", 44, 6.9), best, OPTS(15, 3))).toBe("too far");
    expect(cutReason(r("Archer Hotel New York", 20, 3.6), best, OPTS(15, 3))).toBeNull();
  });

  it("puts the nearest first", () => {
    expect(shortlist(ROWS, OPTS(15, 3))[0].name).toBe("Archer Hotel New York");
  });
});

describe("every other journey he has, with its real numbers", () => {
  // (journey, radiusMin, nights, rows, what must survive, what must not)
  const CASES: { why: string; opts: ShortlistOpts; rows: Row[]; keep: string[]; cut: string[] }[] = [
    {
      why: "Tuscany — villas spread round Lucca, and one he rejected at 35 min",
      opts: OPTS(15, 11),
      rows: [
        r("Casa Titti", 3, 21.5), r("Villa Brunetta", 11, 20.3), r("Casa Barbra", 16, 22.5),
        r("The Healing Garden", 20, 22.8), r("Villa Bottino", 24, 27.8), r("Villa Clara", 35, 23.4),
      ],
      keep: ["Casa Titti", "Casa Barbra", "The Healing Garden", "Villa Bottino"],
      cut: [],
    },
    {
      why: "Tokyo — his own saved ryokans are in Hakone, two hours out",
      opts: OPTS(15, 8),
      rows: [
        r("HOSHINOYA Tokyo", 21, 11.8), r("Hamacho Hotel", 23, 12.3),
        r("ANA InterContinental Tokyo", 25, 11.4),
        r("Gora Kadan Fuji", 112, 25.9), r("Asaba Ryokan", 142, 31.7), r("Takefue", 864, 119.8),
      ],
      keep: ["HOSHINOYA Tokyo", "Hamacho Hotel", "ANA InterContinental Tokyo"],
      cut: ["Gora Kadan Fuji", "Asaba Ryokan", "Takefue"],
    },
    {
      why: "Palm Springs — a run that once proposed a cabin in Minnesota",
      opts: OPTS(15, 7),
      rows: [
        r("Desert Vacation Villas", 11, 15.0), r("Acme House Company", 13, 15.3),
        r("Old Ranch Inn", 17, 16.1), r("Acres Landing", 24, 17.2),
        r("Highland Springs Ranch & Inn", 42, 28.1),
        r("Classic Minnesota Cabin", 1749, 869.1), r("Andy's Place", 2812, 1398.2),
      ],
      keep: ["Desert Vacation Villas", "Old Ranch Inn", "Acres Landing"],
      cut: ["Highland Springs Ranch & Inn", "Classic Minnesota Cabin", "Andy's Place"],
    },
    {
      why: "Sydney — city flats against farm stays two hours down the coast",
      opts: OPTS(15, 5),
      rows: [
        r("InterContinental Sydney", 4, 4.4), r("YHA Sydney Harbour", 6, 5.1),
        r("Sydney Harbourside Apartment", 14, 7.1), r("Coogee Beach Escape", 18, 7.6),
        r("Blueberry Hills on Comleroy", 72, 24.4), r("The Woods Farm Jervis Bay", 148, 49.9),
      ],
      keep: ["InterContinental Sydney", "YHA Sydney Harbour", "Sydney Harbourside Apartment"],
      cut: ["Blueberry Hills on Comleroy", "The Woods Farm Jervis Bay"],
    },
    {
      why: "Santa Barbara — Carpinteria itself against a hotel up in Ventura",
      opts: OPTS(15, 3),
      rows: [
        r("Playa One Bedroom", 6, 2.8), r("Carpinteria Dreamin'", 7, 3.1),
        r("Montecito Inn", 8, 1.6), r("Casa Del Mar Inn", 12, 1.9),
        r("Bella Vista", 17, 5.0), r("Crowne Plaza Ventura Beach", 20, 5.6),
      ],
      keep: ["Playa One Bedroom", "Montecito Inn", "Casa Del Mar Inn"],
      cut: [],
    },
    {
      why: "Rome — everything genuinely is in Rome, so nothing may be cut",
      opts: OPTS(15, 6),
      rows: [
        r("B&B Guesthouse Park Pines", 6, 7.6), r("Courtyard by Marriott Rome", 10, 8.0),
        r("Banco 19 B&B", 20, 5.7), r("Sentho Roma", 31, 7.1),
        r("Hotel NH Collection Roma Palazzo Cinquecento", 34, 9.0),
      ],
      keep: ["B&B Guesthouse Park Pines", "Banco 19 B&B", "Sentho Roma", "Hotel NH Collection Roma Palazzo Cinquecento"],
      cut: [],
    },
    {
      why: "Costa Rica — five villas, all in Tamarindo",
      opts: OPTS(15, 8),
      rows: [
        r("Luxury 4BR 4BTH Villa", 3, 16.3), r("Beach Facing, large pool", 3, 16.5),
        r("Ocean View Sunrise", 3, 16.5), r("Elegant Tropical Villa Retreat", 5, 17.7),
        r("Modern Casita", 8, 18.8),
      ],
      keep: ["Luxury 4BR 4BTH Villa", "Modern Casita"],
      cut: [],
    },
  ];

  for (const c of CASES) {
    it(c.why, () => {
      const out = shortlist(c.rows, c.opts).map((x) => x.name);
      for (const k of c.keep) expect(out, `${k} should have survived`).toContain(k);
      for (const x of c.cut) expect(out, `${x} should have been cut`).not.toContain(x);
    });
  }

  it("never cuts a place he saved, chose or hearted", () => {
    const rows = [r("ANA InterContinental Tokyo", 25, 11.4), r("Takefue", 864, 119.8, true)];
    expect(shortlist(rows, OPTS(15, 8)).map((x) => x.name)).toContain("Takefue");
  });

  it("never answers with nothing", () => {
    const allBad = [r("Far A", 300, 90), r("Far B", 400, 120)];
    const out = shortlist(allBad, OPTS(15, 3));
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Far A");
  });

  it("survives a journey Google would not quote a drive time for", () => {
    const rows = [{ name: "Unknown road", toCentre: null, hours: 4, kept: false }];
    expect(shortlist(rows, OPTS(15, 3))).toHaveLength(1);
  });
});
