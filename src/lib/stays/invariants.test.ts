import { describe, it, expect } from "vitest";
import { buildStayBrief, type BriefPin } from "./brief";
import { areaHeadline, areaLine, splitText } from "./text";
import { priceWindow } from "./priceWindow";

/**
 * A test that GOES LOOKING.
 *
 * Brennan, 11 Sept 2026: "can you build something that goes looking for bugs?"
 * Every other test in this repo exists because something already broke — it
 * pins down a case I was shown. This one invents journeys I was never shown
 * and checks the things that must be true of all of them.
 *
 * It generates thousands of journeys: parties of one to nine, trips of two
 * nights to two months, pins scattered from one street to one continent, some
 * scheduled and some not, some with no times at all. Then it asserts the
 * statements that can never be false — the nights add up, no sentence ever
 * says "undefined", a base is never zero nights.
 *
 * The seed is printed on failure and the generator is deterministic, so any
 * journey it finds can be replayed exactly.
 */

/** Deterministic PRNG (mulberry32), so a failure is reproducible from its seed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOWNS = ["Lucca", "Firenze", "Tokyo", "Osaka", "Tamarindo", "Sydney", "Roma", "Palm Springs"];
const COUNTRIES = ["Italy", "Japan", "Costa Rica", "Australia", "USA"];

function makeJourney(seed: number) {
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

  const nights = int(1, 60);
  const start = new Date(Date.UTC(2027, int(0, 11), int(1, 28)));
  const end = new Date(start.getTime() + nights * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  // A party of anything from a solo trip to three generations.
  const size = int(1, 9);
  const ages = Array.from({ length: size }, () => pick([4, 8, 12, 16, 34, 41, 68, 72]));

  // Pins in one to five clusters, anywhere from the same street to 1,500 km apart.
  const clusters = int(1, 5);
  const country = pick(COUNTRIES);
  const centres = Array.from({ length: clusters }, () => ({
    lat: -40 + r() * 80,
    lng: -170 + r() * 340,
    town: pick(TOWNS),
  }));
  const spread = pick([0.01, 0.05, 0.3, 3, 14]);      // degrees between pins in a cluster

  const pins: BriefPin[] = [];
  const pinCount = int(0, 40);
  for (let i = 0; i < pinCount; i++) {
    const c = centres[Math.floor(r() * centres.length)];
    const scheduled = r() < 0.6;
    const dayOffset = int(0, Math.max(0, nights));
    const timed = r() < 0.5;
    pins.push({
      title: `Place ${i}`,
      address: `${int(1, 99)} Via Test, ${int(10000, 99999)} ${c.town}, ${country}`,
      lat: c.lat + (r() - 0.5) * spread,
      lng: c.lng + (r() - 0.5) * spread,
      subType: pick(["restaurant", "event", "transit", "hotel", "beach", null]),
      dayDate: scheduled ? iso(new Date(start.getTime() + dayOffset * 86400000)) : null,
      startTime: scheduled && timed ? `${String(int(6, 22)).padStart(2, "0")}:00:00` : null,
      scheduled,
    });
  }

  return { seed, startDate: iso(start), endDate: iso(end), partyAges: ages, partySize: size, pins };
}

const BAD_COPY = /undefined|NaN|\bnull\b|\b0 (days|evenings|nights)\b|\bNaN\b/;

describe("invariants over journeys nobody wrote by hand", () => {
  const SEEDS = 2000;

  it(`holds over ${SEEDS} generated journeys`, () => {
    // A search that explores nothing passes everything. These counters are
    // asserted at the end, so weakening the generator fails the test rather
    // than quietly turning it into decoration.
    const seen = { noPins: 0, noCentre: 0, oneBase: 0, multiBase: 0, maxBases: 0, bigParty: 0, longTrip: 0, unscheduled: 0 };

    for (let seed = 1; seed <= SEEDS; seed++) {
      const j = makeJourney(seed);
      const where = `seed ${seed}`;
      const b = buildStayBrief(j);

      if (!j.pins.length) seen.noPins++;
      if (!b.evening) seen.noCentre++;
      if (b.bases.length === 1) seen.oneBase++;
      if (b.bases.length > 1) seen.multiBase++;
      seen.maxBases = Math.max(seen.maxBases, b.bases.length);
      if (j.partySize > 6) seen.bigParty++;
      if (b.nights > 30) seen.longTrip++;
      if (j.pins.length && j.pins.every((p) => !p.scheduled)) seen.unscheduled++;

      // ── the shape of the journey ──────────────────────────────────────
      expect(b.nights, where).toBe(b.days - 1);
      expect(b.stayDays, where).toBeGreaterThanOrEqual(0);
      expect(b.stayDays, where).toBeLessThanOrEqual(Math.max(0, b.days - 1));

      // ── the bases ─────────────────────────────────────────────────────
      if (b.bases.length) {
        const total = b.bases.reduce((n, x) => n + x.nights, 0);
        expect(total, `${where}: base nights must add up to the journey`).toBe(b.nights);
        for (const base of b.bases) {
          expect(base.nights, `${where}: "${base.label}" has ${base.nights} nights`).toBeGreaterThanOrEqual(0);
          expect(base.label.trim().length, where).toBeGreaterThan(0);
          expect(/^\d/.test(base.label), `${where}: base labelled "${base.label}"`).toBe(false);
          expect(Number.isFinite(base.lat) && Number.isFinite(base.lng), where).toBe(true);
        }
        // More bases than there are nights to sleep in them is nonsense.
        expect(b.bases.length, where).toBeLessThanOrEqual(Math.max(1, b.nights));
      }

      // ── the anchors ───────────────────────────────────────────────────
      for (const a of b.anchors) {
        expect(a.days, `${where}: anchor "${a.label}" weighted ${a.days}`).toBeGreaterThanOrEqual(1);
        expect(a.label.trim().length, where).toBeGreaterThan(0);
        expect(/^\d/.test(a.label), `${where}: anchor labelled "${a.label}"`).toBe(false);
        expect(Number.isFinite(a.kmFromEvening), where).toBe(true);
      }

      // ── the sentences the person actually reads ───────────────────────
      const head = areaHeadline(b) ?? "";
      const line = areaLine(b, b.anchors.length ? 30 : null) ?? "";
      const split = splitText(b, {}) ?? "";
      for (const [what, text] of [["headline", head], ["line", line], ["split", split]] as const) {
        expect(text, `${where}: ${what} reads "${text}"`).not.toMatch(BAD_COPY);
      }

      // ── the dates a price is asked for ────────────────────────────────
      const w = priceWindow(j.startDate, j.endDate, new Date("2026-09-11T12:00:00Z"));
      expect(w.end > w.start, `${where}: price window ${w.start}..${w.end}`).toBe(true);
      const span = (Date.parse(w.end) - Date.parse(w.start)) / 86400000;
      expect(span, `${where}: price window is ${span} nights, journey is ${b.nights}`).toBe(b.nights);
    }

    // The search has to have actually been somewhere.
    expect(seen.noPins, "journeys with no pins at all").toBeGreaterThan(10);
    expect(seen.noCentre, "journeys with nowhere to centre on").toBeGreaterThan(10);
    expect(seen.oneBase, "ordinary one-base journeys").toBeGreaterThan(100);
    expect(seen.multiBase, "journeys needing more than one place to sleep").toBeGreaterThan(100);
    expect(seen.maxBases, "the most bases any journey needed").toBeGreaterThanOrEqual(4);
    expect(seen.bigParty, "parties too big for a hotel room").toBeGreaterThan(100);
    expect(seen.longTrip, "trips longer than a month").toBeGreaterThan(100);
    expect(seen.unscheduled, "journeys with nothing on the itinerary").toBeGreaterThan(5);
  });

  it("never invents a centre for a journey with no pins", () => {
    const empty = buildStayBrief({ startDate: "2027-05-01", endDate: "2027-05-08", partyAges: [40], partySize: 1, pins: [] });
    expect(empty.evening).toBeNull();
    expect(empty.bases).toEqual([]);
    expect(areaHeadline(empty)).toBeNull();
    expect(areaLine(empty, null)).toBeNull();
  });

  it("survives a journey where every pin sits on the same spot", () => {
    const pins: BriefPin[] = Array.from({ length: 12 }, (_, i) => ({
      title: `Same ${i}`, address: "1 Via Uno, 55100 Lucca, Italy",
      lat: 43.8431, lng: 10.5032, subType: "restaurant",
      dayDate: "2027-05-02", startTime: "19:00:00", scheduled: true,
    }));
    const b = buildStayBrief({ startDate: "2027-05-01", endDate: "2027-05-08", partyAges: [40, 38], partySize: 2, pins });
    expect(b.bases).toHaveLength(1);
    expect(b.bases[0].nights).toBe(b.nights);
  });
});
