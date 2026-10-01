import { describe, it, expect } from "vitest";
import { parseYearly, dateIn, yearlyForTrip, yearlyKey, yearlyPrompt, type YearlyItem } from "./yearly";
import type { FindResult } from "./merge";

const r = (name: string, title: string, why: string): FindResult => ({ placeId: name, name, title, address: "", lat: 43, lng: 11, rating: null, reviews: null, why, source: null, from: "travellers", kids: true });
const bravio: YearlyItem = { result: r("Comune di Montepulciano", "Bravio delle Botti", "Eight districts race 80 kg barrels uphill."), rule: { month: 8, day: null, weekday: "Sun", nth: -1, days: 1 } };
const luminara: YearlyItem = { result: r("Lungarno", "Luminara di San Ranieri", "Pisa's riverfront lit by 70,000 candles."), rule: { month: 6, day: 16, weekday: null, nth: null, days: 1 } };
const settembre: YearlyItem = { result: r("Piazza Napoleone", "Settembre Lucchese", "Month of fairs, music and the funfair."), rule: { month: 9, day: null, weekday: null, nth: null, days: 30 } };
const palio: YearlyItem = { result: r("Piazza Mazzini", "Palio degli Arcieri", "Archers of Pescia's districts compete."), rule: { month: 8, day: 27, weekday: null, nth: null, days: 2 } };

describe("yearly events, found once per area", () => {
  it("a date rule for any year: the last Sunday of August", () => {
    expect(dateIn(bravio.rule, 2027)).toBe("2027-08-29");
    expect(dateIn(bravio.rule, 2028)).toBe("2028-08-27");
    expect(dateIn({ month: 4, day: null, weekday: "Sun", nth: 2, days: 1 }, 2028)).toBe("2028-04-09");
    expect(dateIn(luminara.rule, 2027)).toBe("2027-06-16");
    expect(dateIn(settembre.rule, 2027)).toBeNull();
  });
  it("Tuscany, 24 Aug – 4 Sep 2027: the Bravio and the Palio with their dates, the Settembre by its month; not June's Luminara", () => {
    const got = yearlyForTrip([bravio, luminara, settembre, palio], "2027-08-24", "2027-09-04");
    expect(got.map((x) => x.why)).toEqual([
      "Usually Sun 29 Aug: Eight districts race 80 kg barrels uphill.",
      "Usually in September: Month of fairs, music and the funfair.",
      "Usually Fri 27 Aug–Sat 28 Aug: Archers of Pescia's districts compete.",
    ]);
    expect(got[0].title).toBe("Bravio delle Botti");
  });
  it("one answer per area, for good; the question asks for the rule, not a year's date", () => {
    expect(yearlyKey(43.8298808, 10.4497198)).toBe("yearly|v1|43.8|10.4");
    expect(yearlyPrompt("Lucca, Italy")).toMatch(/"nth" \(1–4, or -1\s+for the last\)/);
  });
  it("reads Claude's answer", () => {
    const got = parseYearly(`{"events":[{"event":"Bravio delle Botti","name":"Piazza Grande","near":"Montepulciano","month":8,"day":null,"weekday":"Sunday","nth":-1,"days":1,"why":"Barrel race","source_name":"x","source_url":"https://x.it","kids":true},{"event":"","name":"x","month":3}]}`);
    expect(got).toEqual([{ event: "Bravio delle Botti", name: "Piazza Grande", near: "Montepulciano", month: 8, day: null, weekday: "Sun", nth: -1, days: 1, why: "Barrel race", sourceName: "x", sourceUrl: "https://x.it", kids: true }]);
  });
});

import { whatsOnUrl } from "./yearly";
describe("what's on, in Google's own listings", () => {
  it("events in the base's town in the trip's month", () => {
    expect(whatsOnUrl("Lucca", "2027-08-24")).toBe("https://www.google.com/search?q=events%20in%20Lucca%20August%202027&ibp=htl;events");
  });
});
