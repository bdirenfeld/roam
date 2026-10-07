import { describe, it, expect } from "vitest";
import rome from "./fixtures/rome.json";
import journeys from "@/lib/booking/fixtures/journeys.json";
import type { CheckCard } from "@/lib/booking/checklist";
import { bookedInHome, bookedSpend, paidOf, toHome, type BookedSpend } from "./booked";
import { compute, defaultAssumptions, type Assumptions } from "./model";

// Real journeys from the live database (6 Oct 2026). None of their cards has a
// price yet — confirmations before 6 Oct were read without one, and the reader
// is never re-run on old uploads — so each test adds the price a new upload
// would write, on the card it would write it to.
type Trip = { start_date: string; end_date: string; booking_checklist?: Record<string, unknown> | null };
type J = { title: string; trip: Trip; days: { id: string; date: string }[]; cards: CheckCard[] };
const journey = (title: string): J => (journeys as unknown as J[]).find((j) => j.title === title)!;
const romeJ = rome as unknown as J;
const priced = (cards: CheckCard[], id: string, paid_total: number, paid_currency: string) =>
  cards.map((c) => (c.id === id ? { ...c, details: { ...(c.details ?? {}), paid_total, paid_currency } } : c));
const spendOf = (j: J, cards = j.cards, checklist: Record<string, unknown> = {}) =>
  bookedSpend({ trip: { ...j.trip, booking_checklist: checklist }, days: j.days, cards });

describe("Rome: a round trip under one reference, two hotels, one of them priced", () => {
  // The reader wrote the fare on both AC890 legs (B24EDV): it must count once.
  let cards = priced(romeJ.cards, "284ddc65-4e18-44ce-8124-32d96fb69e5b", 2140.6, "CAD");
  cards = priced(cards, "f5943aea-5d92-49f8-a0b5-b102f75708a6", 2140.6, "CAD");
  cards = priced(cards, "ca49a153-e1b7-448e-b3e6-68eb86830070", 1180, "EUR"); // Banco 19, 24–28 Apr
  const spend = spendOf(romeJ, cards);

  it("the fare once, Banco 19's four nights paid, NH Collection's two still open", () => {
    expect(spend.flights).toEqual([{ amount: 2140.6, currency: "CAD" }]);
    expect(spend.stays).toEqual([{ amount: 1180, currency: "EUR" }]);
    expect(spend).toMatchObject({ nightsPaid: 4, nights: 6, car: [] });
  });

  it("in dollars at the estimate's euro rate", () => {
    expect(bookedInHome(spend, "EUR", 1.603)).toEqual({ flights: 2141, accommodation: { paid: 1892, nightsPaid: 4, nights: 6 }, unconverted: 0 });
  });

  it("the budget: flights are the fare; stays are Banco 19 plus two nights at $260; booked vs still estimated", () => {
    const a: Assumptions = { ...defaultAssumptions(2, 6), flightPerPerson: 1050, nightlyRate: 260, carEnabled: false, contingencyPct: 10 };
    const est = compute(a, { uncostedExcursions: 0, rolledExcursionCount: 0, booked: bookedInHome(spend, "EUR", 1.603) });
    const line = (k: string) => est.lines.find((l) => l.key === k)!;
    expect(line("flights")).toMatchObject({ amount: 2141, booked: 2141, bookedNote: "Booked" });
    expect(line("accommodation")).toMatchObject({ amount: 1892 + 520, booked: 1892, count: 2, bookedNote: "Booked · 4 of 6 nights" });
    expect(est.booked).toBe(2141 + 1892);
    // Contingency is on the estimated part only (the two open nights), not on money paid.
    expect(est.contingency).toBe(52);
    expect(est.total).toBe(2141 + 2412 + 52);
    expect(est.estimated).toBe(520 + 52);
    expect(est.booked + est.estimated).toBe(est.total);
  });

  it("without any price, the budget is exactly the estimate it was", () => {
    const a: Assumptions = { ...defaultAssumptions(2, 6), flightPerPerson: 1050, nightlyRate: 260, carEnabled: false };
    const before = compute(a, { uncostedExcursions: 0, rolledExcursionCount: 0 });
    const after = compute(a, { uncostedExcursions: 0, rolledExcursionCount: 0, booked: bookedInHome(spendOf(romeJ), "EUR", 1.603) });
    expect(after.total).toBe(before.total);
    expect(after.booked).toBe(0);
    expect(after.estimated).toBe(before.total);
    expect(after.lines.every((l) => l.booked == null)).toBe(true);
  });
});

describe("Tuscany: the villa paid in euros covers every night", () => {
  const t = journey("Tuscany");
  // The price sits on the check-in card (14:00, 24 Aug), never the check-out.
  const cards = priced(t.cards, "199c4b2e-7b25-43b3-aaa0-8ba12074a6ec", 9800, "EUR");
  const spend = spendOf(t, cards);
  it("all eleven nights paid; the line is the villa and nothing else", () => {
    expect(spend).toMatchObject({ stays: [{ amount: 9800, currency: "EUR" }], nightsPaid: 11, nights: 11 });
    const a: Assumptions = { ...defaultAssumptions(7, 11), nightlyRate: 768, flightPerPerson: 1200, carDayRate: 210, carEnabled: true };
    const est = compute(a, { uncostedExcursions: 0, rolledExcursionCount: 0, booked: bookedInHome(spend, "EUR", 1.611) });
    expect(est.lines.find((l) => l.key === "accommodation")).toMatchObject({ amount: 15788, booked: 15788, bookedNote: "Booked" });
    // Flights and car are still the estimate.
    expect(est.lines.find((l) => l.key === "flights")).toMatchObject({ amount: 8400 });
    expect(est.lines.find((l) => l.key === "flights")!.booked).toBeUndefined();
  });
  it("a car marked Booked by hand with what it cost counts, even with car hire switched off", () => {
    const s = spendOf(t, t.cards, { car: "booked", costs: { car: { amount: 1450, currency: "EUR" } } });
    expect(s.car).toEqual([{ amount: 1450, currency: "EUR" }]);
    const a: Assumptions = { ...defaultAssumptions(7, 11), carDayRate: 210, carEnabled: false };
    const est = compute(a, { uncostedExcursions: 0, rolledExcursionCount: 0, booked: bookedInHome(s, "EUR", 1.611) });
    expect(est.lines.find((l) => l.key === "car")).toMatchObject({ enabled: true, amount: 2336, booked: 2336 });
  });
  it("a cost typed on a row then set to Not needed no longer counts", () => {
    expect(spendOf(t, t.cards, { car: "skip", costs: { car: { amount: 1450, currency: "EUR" } } }).car).toEqual([]);
  });
  it("Stays marked Booked by hand with a cost: every night is paid", () => {
    const s = spendOf(t, t.cards.filter((c) => c.place?.title !== "Villa Zambaldi"), { stays: "booked", costs: { stays: { amount: 9000, currency: "EUR" } } });
    expect(s).toMatchObject({ nightsPaid: 11, stays: [{ amount: 9000, currency: "EUR" }] });
  });
});

describe("New York (Mia & Daddy): a hotel in US dollars on a trip priced in US dollars", () => {
  const j = journey("New York (Mia & Daddy)");
  let cards = priced(j.cards, "56cd9eaf-3d12-4db9-b076-066cfc4a6398", 1350, "USD"); // 11 Howard
  cards = priced(cards, "2760a9ba-4f8e-4274-aa69-b519b997abcc", 612, "CAD"); // AC8458 out; the reader leaves the return blank
  it("three nights paid; the fare is in dollars already", () => {
    const s = spendOf(j, cards);
    expect(s).toMatchObject({ nightsPaid: 3, nights: 3, flights: [{ amount: 612, currency: "CAD" }] });
    expect(bookedInHome(s, "USD", 1.379)).toEqual({ flights: 612, accommodation: { paid: 1862, nightsPaid: 3, nights: 3 }, unconverted: 0 });
  });
  it("the cut duplicate 11 Howard card never counts", () => {
    const cut = priced(j.cards, "3a010cbd-8eb6-42eb-866c-326db72e6a9c", 1350, "USD");
    expect(spendOf(j, cut).stays).toEqual([]);
  });
});

describe("Australia: a fare in a third currency", () => {
  const j = journey("Australia");
  const cards = priced(j.cards, j.cards.find((c) => c.place?.sub_type === "flight_arrival")!.id, 6200, "AUD");
  it("converts at the estimate's rate when it is the journey's currency, else the reference table", () => {
    const s = spendOf(j, cards);
    expect(bookedInHome(s, "AUD", 0.993).flights).toBe(6157);
    // The Sydney budget row says EUR (a stale row): AUD then comes off the reference table.
    expect(bookedInHome(s, "EUR", 1.47).flights).toBe(6157);
  });
  it("a currency with no rate at all is left out and counted, never guessed", () => {
    const s: BookedSpend = { flights: [{ amount: 100, currency: "XYZ" }], stays: [], car: [], nightsPaid: 0, nights: 5 };
    expect(bookedInHome(s, "AUD", 0.993)).toEqual({ unconverted: 1 });
    expect(toHome({ amount: 100, currency: "CAD" }, "AUD", 0.993)).toBe(100);
  });
});

describe("paidOf", () => {
  it("reads only a positive number with a three-letter code", () => {
    expect(paidOf({ paid_total: 10, paid_currency: "EUR" })).toEqual({ amount: 10, currency: "EUR" });
    expect(paidOf({ paid_total: "10", paid_currency: "EUR" })).toBeNull();
    expect(paidOf({ paid_total: 0, paid_currency: "EUR" })).toBeNull();
    expect(paidOf({ paid_total: 10 })).toBeNull();
    expect(paidOf(null)).toBeNull();
  });
});

// A person whose home is not Canada (6 Oct 2026): their own currency counts
// at 1, the journey's at the screen's rate, anything else through the table.
describe("toHome / bookedInHome for a US person", () => {
  it("US dollars count as they are; CAD goes through the reference table", () => {
    expect(toHome({ amount: 500, currency: "USD" }, "EUR", 1.16, "USD")).toBe(500);
    expect(toHome({ amount: 1000, currency: "EUR" }, "EUR", 1.16, "USD")).toBe(1160);
    expect(toHome({ amount: 1379, currency: "CAD" }, "EUR", 1.16, "USD")).toBeCloseTo(1000, 6);
  });
  it("a Canadian is unchanged when no home is given", () => {
    expect(toHome({ amount: 500, currency: "CAD" }, "EUR", 1.6)).toBe(500);
    expect(toHome({ amount: 500, currency: "USD" }, "EUR", 1.6)).toBe(689.5);
  });
  it("the booked flights add up in USD", () => {
    const spend: BookedSpend = { flights: [{ amount: 900, currency: "USD" }, { amount: 100, currency: "EUR" }], stays: [], car: [], nightsPaid: 0, nights: 5 };
    expect(bookedInHome(spend, "EUR", 1.16, "USD")).toEqual({ flights: 1016, unconverted: 0 });
  });
});
