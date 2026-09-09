import { describe, it, expect } from "vitest";
import {
  buildStayBrief, townFromAddress, partyFromAges, fitFromParty, kindFor, greatCircleKm,
  type BriefPin,
} from "./brief";

/**
 * Tuscany, 18–29 August 2027 — the placed pins copied from the database on
 * 2026-09-09 (cards with a place and a day, status in_itinerary). Blank note
 * cards are not pins and are left out, which is the point: 27 August has a
 * note at 09:30 and nothing placed, so it is a stay day.
 */
function pin(title: string, address: string, lat: number, lng: number, subType: string, dayDate: string, startTime: string): BriefPin {
  return { title, address, lat, lng, subType, dayDate, startTime };
}

const LUCCA = "55100 Lucca LU, Italy";
const FI = "50123 Firenze FI, Italy";

const TUSCANY: BriefPin[] = [
  pin("Pisa International Airport", "Piazzale Corradino D'Ascanio, 1, 56121 Pisa PI, Italy", 43.6869635, 10.3942843, "transit", "2027-08-18", "11:00:00"),
  pin("Villa Bottino", "Località Scilivano, 7, 55064 San Martino in Freddana LU, Italy", 43.9239504, 10.4276754, "hotel", "2027-08-18", "14:00:00"),
  pin("Forno a Vapore Amedeo Giusti", "Via Santa Lucia, 20, " + LUCCA, 43.8435394, 10.5031778, "restaurant", "2027-08-19", "09:00:00"),
  pin("Piazza San Michele", "P.za San Michele, " + LUCCA, 43.8430907, 10.5031507, "self_directed", "2027-08-19", "09:45:00"),
  pin("Buccellato Taddeucci", "P.za San Michele, 34, " + LUCCA, 43.842987, 10.5031921, "dessert", "2027-08-19", "11:30:00"),
  pin("Ciacco", "P.za Napoleone, 10, " + LUCCA, 43.841865, 10.5026964, "restaurant", "2027-08-19", "12:30:00"),
  pin("My Tuscan Kitchen", "Località Torricchio, N° 75, 56036 Montefoscoli PI, Italy", 43.5844149, 10.7564421, "guided", "2027-08-20", "15:30:00"),
  pin("Piazza San Michele", "P.za San Michele, " + LUCCA, 43.8430907, 10.5031507, "self_directed", "2027-08-21", "17:30:00"),
  pin("Trattoria da Giulio", "Via delle Conce, 45, " + LUCCA, 43.8454946, 10.4978507, "restaurant", "2027-08-21", "19:30:00"),
  pin("Gelateria Veneta", "Via V. Veneto, 74, " + LUCCA, 43.8396373, 10.5017177, "dessert", "2027-08-21", "21:00:00"),
  pin("Volterra AD 1398 medieval festival", "Piazza dei Priori, 56048 Volterra PI, Italy", 43.4020964, 10.8597101, "event", "2027-08-22", "10:00:00"),
  pin("Cave di Marmo Tours", "Strada Comunale per Colonnata, 1, 54033 Colonnata MS, Italy", 44.0823029, 10.1465774, "guided", "2027-08-23", "10:00:00"),
  pin("Mafalda Lardo di Colonnata IGP", "Piazza Palestro, 2, 54030 Carrara MS, Italy", 44.0862238, 10.1554585, "restaurant", "2027-08-23", "12:30:00"),
  pin("Caffè Gilli", "Via Roma, 1r, " + FI, 43.7719748, 11.2541636, "coffee", "2027-08-24", "10:30:00"),
  pin("Museo Leonardo Da Vinci", "Via del Castellaccio, 1r, 50121 Firenze FI, Italy", 43.7745539, 11.2585692, "guided", "2027-08-24", "11:00:00"),
  pin("David", "Via Ricasoli, 58/60, 50129 Firenze FI, Italy", 43.7767194, 11.2593217, "guided", "2027-08-24", "12:30:00"),
  pin("Vini e Vecchi Sapori", "Via dei Magazzini, 3/r, 50122 Firenze FI, Italy", 43.7700901, 11.2568157, "restaurant", "2027-08-24", "13:30:00"),
  pin("Vivoli", "Via Isola delle Stinche, 7r, 50122 Firenze FI, Italy", 43.7699351, 11.2600892, "dessert", "2027-08-24", "15:00:00"),
  pin("Giardino Bardini", "Costa S. Giorgio, 2, 50125 Firenze FI, Italy", 43.7633184, 11.2570423, "self_directed", "2027-08-24", "16:00:00"),
  pin("Savini Tartufi truffle hunt", "Piazza Corradino D'ascanio, 56036 Montanelli PI, Italy", 43.5911559, 10.7179027, "guided", "2027-08-25", "09:30:00"),
  pin("Antica Locanda di Sesto", "Via Ludovica, 1660, " + LUCCA, 43.9241454, 10.5267771, "restaurant", "2027-08-25", "20:00:00"),
  pin("La Spezia Centrale", "Piazzale Medaglie d'Oro al Valor Militare, 19122 La Spezia SP, Italy", 44.1113532, 9.8134318, "transit", "2027-08-26", "08:30:00"),
  pin("Monterosso public beach (Fegina)", "19016 Monterosso al Mare, SP, Italy", 44.1455723, 9.6490617, "self_directed", "2027-08-26", "09:30:00"),
  pin("Il Casello", "Lungomare Ferrovia casello, 70, 19016 Monterosso al Mare SP, Italy", 44.1459507, 9.6564578, "restaurant", "2027-08-26", "12:30:00"),
  pin("Vernazza", "Vernazza, SP, Italy", 44.1353502, 9.6827957, "self_directed", "2027-08-26", "14:00:00"),
  pin("Il Pirata delle 5 Terre", "Via Gavino, 36/38, 19018 Vernazza SP, Italy", 44.1364807, 9.685077, "dessert", "2027-08-26", "15:00:00"),
  pin("Cathedral of Santa Maria del Fiore", "Piazza del Duomo, 50122 Firenze FI, Italy", 43.773145, 11.2559602, "guided", "2027-08-28", "10:15:00"),
  pin("Mercato Centrale & San Lorenzo market", "Piazza del Mercato Centrale, " + FI, 43.7764676, 11.2528338, "shopping", "2027-08-28", "11:30:00"),
  pin("Trattoria Mario", "Via Rosina, 2r, " + FI, 43.7765605, 11.2545811, "restaurant", "2027-08-28", "12:30:00"),
  pin("Gelateria dei Neri", "Via dei Neri, 9/11R, 50122 Firenze FI, Italy", 43.7677669, 11.2590689, "dessert", "2027-08-28", "14:00:00"),
  pin("Buca di Sant'Antonio", "Via della Cervia, 3, " + LUCCA, 43.842762, 10.5016987, "restaurant", "2027-08-28", "19:30:00"),
  pin("Villa Bottino", "Località Scilivano, 7, 55064 San Martino in Freddana LU, Italy", 43.9239504, 10.4276754, "hotel", "2027-08-29", "08:00:00"),
  pin("Pisa International Airport", "Piazzale Corradino D'Ascanio, 1, 56121 Pisa PI, Italy", 43.6869635, 10.3942843, "transit", "2027-08-29", "10:00:00"),
];

const TUSCANY_INPUT = {
  startDate: "2027-08-18",
  endDate: "2027-08-29",
  partyAges: [43, 41, 10, 8, 5, 72, 71], // the live row: two couples, three kids
  partySize: 7,
  pins: TUSCANY,
};

describe("townFromAddress", () => {
  it("reads the Italian post-code form and drops the province", () => {
    expect(townFromAddress("P.za San Michele, 55100 Lucca LU, Italy")).toBe("Lucca");
    expect(townFromAddress("Piazzale Corradino D'Ascanio, 1, 56121 Pisa PI, Italy")).toBe("Pisa");
    expect(townFromAddress("19016 Monterosso al Mare, SP, Italy")).toBe("Monterosso al Mare");
  });
  it("reads the North American form", () => {
    expect(townFromAddress("123 Palm Canyon Dr, Palm Springs, CA 92262, USA")).toBe("Palm Springs");
  });
  it("skips a bare province code, and is null on nothing", () => {
    expect(townFromAddress("Vernazza, SP, Italy")).toBe("Vernazza");
    expect(townFromAddress(null)).toBeNull();
  });
});

describe("party, fit and kind", () => {
  it("counts the live Tuscany party: 4 adults, 3 kids, 2 seniors, one under five", () => {
    const p = partyFromAges([43, 41, 10, 8, 5, 72, 71], 7);
    expect(p).toEqual({ total: 7, adults: 4, kids: 3, seniors: 2, under5: false });
    expect(partyFromAges([43, 41, 10, 8, 4], 5).under5).toBe(true);
  });
  it("floors: two couples and three kids need 4 bedrooms and 3 baths, and the ground-floor question", () => {
    const fit = fitFromParty(partyFromAges([43, 41, 10, 8, 5, 72, 71], 7));
    expect(fit).toEqual({ bedrooms: 4, baths: 3, askGroundFloor: true, askCot: false });
  });
  it("a couple needs one of each and no questions", () => {
    expect(fitFromParty(partyFromAges([42, 40], 2))).toEqual({ bedrooms: 1, baths: 1, askGroundFloor: false, askCot: false });
  });
  it("falls back to party size when ages are missing", () => {
    expect(partyFromAges(null, 5)).toEqual({ total: 5, adults: 5, kids: 0, seniors: 0, under5: false });
    expect(partyFromAges([], null).total).toBe(2);
  });
  it("kind: short or a couple is a hotel; a week with kids is a house", () => {
    expect(kindFor(3, partyFromAges([43, 41, 10, 8, 5], 5))).toBe("hotel");
    expect(kindFor(11, partyFromAges([42, 40], 2))).toBe("hotel");
    expect(kindFor(11, partyFromAges([43, 41, 10, 8, 5], 5))).toBe("house");
    expect(kindFor(6, partyFromAges([43, 41, 30, 29], 4))).toBe("hotel");
  });
});

describe("buildStayBrief on Tuscany 2027", () => {
  const brief = buildStayBrief(TUSCANY_INPUT);

  it("counts the nights and the days", () => {
    expect(brief.nights).toBe(11);
    expect(brief.days).toBe(12);
    expect(brief.kind).toBe("house");
  });

  it("finds the evening centre in Lucca, on two evenings", () => {
    expect(brief.evening?.label).toBe("Lucca");
    expect(brief.evening?.days).toBe(2); // 21 and 28 August; Sesto on the 25th is 9 km out
    expect(brief.radiusMin).toBe(15);
  });

  it("makes the airport its own anchor, visited twice", () => {
    const airport = brief.anchors.find((a) => a.kind === "airport");
    expect(airport?.label).toBe("Pisa");
    expect(airport?.days).toBe(2);
  });

  it("never anchors on the stay itself", () => {
    expect(brief.anchors.some((a) => /Bottino/.test(a.label))).toBe(false);
  });

  it("clusters the day trips and weights Florence twice", () => {
    const labels = brief.anchors.filter((a) => a.kind === "daytrip").map((a) => `${a.label}:${a.days}`);
    expect(labels).toContain("Firenze:2");
    expect(labels).toContain("Volterra:1");
    expect(labels).toContain("Monterosso al Mare:1");
    // The cooking class and the truffle hunt are 3 km apart: one cluster, two days.
    expect(labels.some((l) => /^(Montefoscoli|Montanelli):2$/.test(l))).toBe(true);
    // Lucca's own daytime pins ride on the evening anchor, not a second one.
    expect(labels.some((l) => l.startsWith("Lucca:"))).toBe(false);
  });

  it("counts two and a half stay days: half the arrival, the 21st and the 27th", () => {
    expect(brief.stayDays).toBe(2.5);
  });

  it("suggests Florence as a second base and nothing else", () => {
    expect(brief.splitCandidates.map((s) => s.label)).toEqual(["Firenze"]);
    expect(brief.splitCandidates[0].days).toBe(2);
    expect(brief.splitCandidates[0].km).toBeGreaterThanOrEqual(50);
  });
});

describe("buildStayBrief with nothing scheduled", () => {
  it("has no evening, no anchors and every day is a stay day", () => {
    const b = buildStayBrief({ startDate: "2027-03-13", endDate: "2027-03-16", partyAges: [42, 40], partySize: 2, pins: [] });
    expect(b.evening).toBeNull();
    expect(b.anchors).toEqual([]);
    expect(b.stayDays).toBe(2.5); // half the first day, then two full days; departure never counts
    expect(b.splitCandidates).toEqual([]);
    expect(b.kind).toBe("hotel");
  });
});

describe("greatCircleKm", () => {
  it("Lucca to Florence is 61 km as the crow flies", () => {
    expect(Math.round(greatCircleKm(43.8431, 10.5032, 43.772, 11.2542))).toBe(61);
  });
});
