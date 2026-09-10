import { describe, it, expect } from "vitest";
import { parseAsk, verdict, failsAsk, askNote, askBonus, askSummary, suggestions } from "./wants";

/** What Google lists on a property that has a pool and a kitchen but no AC. */
const VILLA = ["Outdoor pool", "Free parking", "Kitchen", "Washer", "Pet-friendly"];
/** A hotel with air conditioning and no pool. */
const HOTEL = ["Air conditioning", "Free Wi-Fi", "Free breakfast", "Bar"];
/** Off the map or out of his own saves: no amenity data at all. */
const NONE: string[] = [];

describe("the sentence Brennan wants to be able to write", () => {
  const ask = parseAsk("yes, we need a pool and a playground nearby or like shops and cafes would be nice");

  it("makes the pool a must", () => {
    expect(ask.musts.map((w) => w.noun)).toEqual(["Pool"]);
  });

  it("keeps the playground on the must side, and admits it cannot check it", () => {
    expect(ask.unchecked).toContainEqual({ phrase: "playground nearby", kind: "must" });
  });

  it("turns everything after 'or ... would be nice' into a nice-to-have", () => {
    const nice = ask.unchecked.filter((u) => u.kind === "nice").map((u) => u.phrase);
    expect(nice).toEqual(["shops", "cafes"]);
  });

  it("throws away the scaffolding — 'yes' and 'we need' are not asks", () => {
    const phrases = ask.unchecked.map((u) => u.phrase);
    expect(phrases).not.toContain("yes");
    expect(phrases.some((p) => /^we\b|^need/.test(p))).toBe(false);
  });

  it("says back exactly what it did with it", () => {
    expect(askSummary(ask)).toEqual({
      must: "Must have: Pool",
      nice: null,
      loose: "Can't check, so it steers the search: playground nearby, shops, cafes",
    });
  });
});

describe("reading must from nice", () => {
  it("treats a bare list as must — typing it is the ask", () => {
    const a = parseAsk("pool, kitchen");
    expect(a.musts.map((w) => w.noun)).toEqual(["Pool", "Kitchen"]);
    expect(a.nices).toEqual([]);
  });

  it("takes 'would be nice' as the downgrade", () => {
    const a = parseAsk("must have a kitchen, a pool would be nice");
    expect(a.musts.map((w) => w.noun)).toEqual(["Kitchen"]);
    expect(a.nices.map((w) => w.noun)).toEqual(["Pool"]);
  });

  it("reads 'ideally' and 'prefer' the same way", () => {
    expect(parseAsk("ideally a hot tub").nices.map((w) => w.noun)).toEqual(["Hot tub"]);
    expect(parseAsk("we'd prefer parking").nices.map((w) => w.noun)).toEqual(["Parking"]);
  });

  it("lets 'and' list more of whatever kind the segment already was", () => {
    const a = parseAsk("nice to have a gym and a pool");
    expect(a.nices.map((w) => w.noun)).toEqual(["Gym", "Pool"]);
    expect(a.musts).toEqual([]);
  });

  it("never files the same thing twice", () => {
    const a = parseAsk("pool, swimming pool, a pool would be nice");
    expect(a.musts.map((w) => w.noun)).toEqual(["Pool"]);
    expect(a.nices).toEqual([]);
  });

  it("has a much wider vocabulary than the pool it started with", () => {
    const a = parseAsk("kitchen, laundry, parking, wifi, dog friendly, step-free, cot");
    expect(a.musts.map((w) => w.key)).toEqual(["kitchen", "laundry", "parking", "wifi", "pets", "accessible", "kids"]);
  });

  it("is empty on an empty line", () => {
    expect(parseAsk("")).toEqual({ musts: [], nices: [], unchecked: [], query: "" });
    expect(parseAsk(null).musts).toEqual([]);
  });
});

describe("verdict", () => {
  it("keeps the three states apart", () => {
    expect(verdict("pool", VILLA)).toBe("yes");
    expect(verdict("pool", HOTEL)).toBe("no");
    expect(verdict("pool", NONE)).toBe("unknown");
    expect(verdict("pool", null)).toBe("unknown");
  });

  it("knows a word it has never heard of is not a no", () => {
    expect(verdict("playground", VILLA)).toBe("unknown");
  });
});

describe("failsAsk", () => {
  const ask = parseAsk("we need a pool");

  it("drops only what the listing contradicts", () => {
    expect(failsAsk(ask, HOTEL)).toBe(true);
    expect(failsAsk(ask, VILLA)).toBe(false);
    // The Tuscany case: no amenities anywhere. Nothing may be dropped for that.
    expect(failsAsk(ask, NONE)).toBe(false);
  });

  it("never drops for a nice-to-have", () => {
    expect(failsAsk(parseAsk("a pool would be nice"), HOTEL)).toBe(false);
  });
});

describe("what the row says", () => {
  it("names what it could not verify, capped so it does not run on", () => {
    expect(askNote(parseAsk("pool"), NONE)).toBe("Pool not listed");
    expect(askNote(parseAsk("pool, kitchen"), NONE)).toBe("Pool and Kitchen not listed");
    expect(askNote(parseAsk("pool, kitchen, gym, parking"), NONE)).toBe("Pool and Kitchen +2 not listed");
  });

  it("says nothing once everything asked for is confirmed", () => {
    expect(askNote(parseAsk("pool, kitchen"), VILLA)).toBeNull();
  });

  it("calls out a nice-to-have that turned up", () => {
    expect(askBonus(parseAsk("a pool would be nice"), VILLA)).toBe("Pool");
    expect(askBonus(parseAsk("a pool would be nice"), HOTEL)).toBeNull();
    expect(askBonus(parseAsk("we need a pool"), VILLA)).toBeNull();
  });
});

describe("suggestions", () => {
  it("offers words that suit the journey, so the box is not a blank page", () => {
    expect(suggestions({ house: true })).toEqual(["Pool", "Kitchen", "Laundry", "Parking"]);
    expect(suggestions({ house: false })).toEqual(["Pool", "Breakfast", "AC", "Parking"]);
  });

  it("leads with step-free when someone older is coming, and caps at five", () => {
    const s = suggestions({ house: true, askGroundFloor: true, askCot: true });
    expect(s[0]).toBe("Step-free");
    expect(s.length).toBe(5);
  });
});
