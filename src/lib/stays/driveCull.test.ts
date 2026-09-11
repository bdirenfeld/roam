import { describe, it, expect } from "vitest";
import { tooMuchDriving } from "./drive";

/**
 * The rule, checked against every candidate his nine journeys have produced.
 *
 * Each row is (journey, nights, this candidate's driving hours, the best
 * candidate's hours), read straight out of stay_candidates on 11 Sept 2026.
 * KEEP means it belongs on the list; DROP means it was on the list and should
 * never have been: "look at the New York hotels being recommended, those
 * don't make a whole lot of sense."
 */
type Row = { why: string; nights: number; hours: number; best: number; keep: boolean };

const REAL: Row[] = [
  // ── belong there ────────────────────────────────────────────────────────
  { why: "New York · The Bowery Hotel", nights: 3, hours: 3.1, best: 3.0, keep: true },
  { why: "New York · Artezen Hotel", nights: 3, hours: 4.2, best: 3.0, keep: true },
  { why: "Tuscany · Villa Bottino, which he weighed up himself", nights: 11, hours: 27.8, best: 19.4, keep: true },
  { why: "Tuscany · The Healing Garden", nights: 11, hours: 22.8, best: 19.4, keep: true },
  { why: "Japan · Park Front at Universal Studios", nights: 13, hours: 19.6, best: 11.4, keep: true },
  { why: "Costa Rica · Modern Casita", nights: 8, hours: 18.8, best: 16.3, keep: true },
  { why: "Rome · NH Collection Palazzo Cinquecento", nights: 6, hours: 9.0, best: 5.7, keep: true },
  { why: "Palm Springs · Old Ranch Inn", nights: 7, hours: 16.1, best: 15.0, keep: true },
  { why: "Australia · Sydney Harbourside Apartment", nights: 5, hours: 7.1, best: 4.4, keep: true },
  { why: "Santa Barbara · Carpinteria Beach Front Bungalow", nights: 3, hours: 3.2, best: 1.6, keep: true },

  // ── do not ──────────────────────────────────────────────────────────────
  { why: "New York · the Airbnb banner ad, 3.7 h over three nights", nights: 3, hours: 6.7, best: 3.0, keep: false },
  { why: "Santa Barbara · a hotel in Ventura", nights: 3, hours: 5.6, best: 1.6, keep: false },
  { why: "Japan · Takefue, a ryokan in Kyushu, on the Osaka list", nights: 13, hours: 119.8, best: 11.4, keep: false },
  { why: "Palm Springs · a cabin in Minnesota", nights: 7, hours: 869.1, best: 15.0, keep: false },
  { why: "Palm Springs · a cottage on the St Lawrence", nights: 7, hours: 1349.7, best: 15.0, keep: false },
  { why: "Australia · a farm stay in Jervis Bay", nights: 5, hours: 49.9, best: 4.4, keep: false },
  { why: "Palm Springs · Highland Springs Ranch", nights: 7, hours: 28.1, best: 15.0, keep: false },
];

describe("extra driving that stops being worth it", () => {
  for (const r of REAL) {
    it(`${r.keep ? "keeps" : "drops"} ${r.why}`, () => {
      expect(tooMuchDriving(r.hours, r.best, r.nights)).toBe(!r.keep);
    });
  }

  it("never drops the best one, or one that is closer than the best", () => {
    expect(tooMuchDriving(15, 15, 7)).toBe(false);
    expect(tooMuchDriving(12, 15, 7)).toBe(false);
  });

  it("holds for a single night, where the allowance cannot go to zero", () => {
    expect(tooMuchDriving(1.5, 1, 1)).toBe(false);
    expect(tooMuchDriving(3, 1, 1)).toBe(true);
    expect(tooMuchDriving(3, 1, 0)).toBe(true);
  });

  it("says nothing when a drive time is missing", () => {
    expect(tooMuchDriving(NaN, 3, 5)).toBe(false);
    expect(tooMuchDriving(9, NaN, 5)).toBe(false);
  });
});
