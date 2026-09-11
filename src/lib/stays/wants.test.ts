import { describe, it, expect } from "vitest";
import { parseAsk, verdict, failsAsk, unansweredNote, askNote, askBonus, askSummary, suggestions } from "./wants";

/** What Google lists on a property that has a pool and a kitchen but no AC. */
const VILLA = ["Outdoor pool", "Free parking", "Kitchen", "Washer", "Pet-friendly"];
/** A hotel with air conditioning and no pool — and it SAYS it has no pool. */
const HOTEL = ["Air conditioning", "Free Wi-Fi", "Free breakfast", "Bar"];
const HOTEL_NOT = ["No pool"];
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
    // A no has to be STATED. This test used to read the four-word HOTEL list
    // as a complete inventory, which is the assumption that emptied the Osaka
    // list twice: a real list is two or three highlights (11 Sept 2026).
    expect(verdict("pool", HOTEL, HOTEL_NOT)).toBe("no");
    expect(verdict("pool", HOTEL)).toBe("unknown");
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
    expect(failsAsk(ask, HOTEL, HOTEL_NOT)).toBe(true);
    // Silence is not a contradiction.
    expect(failsAsk(ask, HOTEL)).toBe(false);
    expect(failsAsk(ask, VILLA)).toBe(false);
    // The Tuscany case: no amenities anywhere. Nothing may be dropped for that.
    expect(failsAsk(ask, NONE)).toBe(false);
  });

  it("never drops for a nice-to-have", () => {
    expect(failsAsk(parseAsk("a pool would be nice"), HOTEL, HOTEL_NOT)).toBe(false);
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

/**
 * The rule that emptied Osaka.
 *
 * These are REAL amenity lists, pulled from SerpApi on 11 Sept 2026 for
 * Osaka, 10-15 April 2027, two adults and three children. Every one of the
 * eighteen properties looked like this, and not one mentioned breakfast — so
 * "must have breakfast" read every list as a denial and deleted all of them.
 * The list then filled with map rows that can never carry a price, and
 * Brennan reported "no rates for Osaka" three times.
 */
describe("a short list is not an inventory", () => {
  const DOYANEN = ["Free Wi-Fi", "Kid-friendly"];
  const FAMILIAR = ["Free Wi-Fi", "Accessible", "Kid-friendly"];
  const LEGALIE = ["Free Wi-Fi", "Kitchen"];
  const TENGACHAYA: string[] = [];

  it("never reads a missing word as a no", () => {
    for (const list of [DOYANEN, FAMILIAR, LEGALIE, TENGACHAYA]) {
      expect(verdict("breakfast", list)).toBe("unknown");
      expect(verdict("pool", list)).toBe("unknown");
    }
  });

  it("still says yes to what the list does name", () => {
    expect(verdict("wifi", DOYANEN)).toBe("yes");
    expect(verdict("kitchen", LEGALIE)).toBe("yes");
    expect(verdict("accessible", FAMILIAR)).toBe("yes");
    expect(verdict("kids", DOYANEN)).toBe("yes");
  });

  it("says no only when the listing states it", () => {
    expect(verdict("ac", DOYANEN, ["No air conditioning"])).toBe("no");
    expect(verdict("pets", FAMILIAR, ["Not pet-friendly"])).toBe("no");
    // The exclusion is about something else, so the want is still unknown.
    expect(verdict("breakfast", DOYANEN, ["No air conditioning"])).toBe("unknown");
  });

  it("keeps every real Osaka listing against a breakfast must-have", () => {
    const ask = parseAsk("breakfast");
    expect(ask.musts.map((m) => m.key)).toContain("breakfast");
    for (const list of [DOYANEN, FAMILIAR, LEGALIE, TENGACHAYA]) {
      expect(failsAsk(ask, list), JSON.stringify(list)).toBe(false);
    }
  });

  it("still drops one that says it has no pool when a pool is required", () => {
    const ask = parseAsk("we need a pool");
    expect(failsAsk(ask, ["Free Wi-Fi"], ["No pool"])).toBe(true);
    expect(failsAsk(ask, ["Free Wi-Fi"], [])).toBe(false);
  });
});

/**
 * Google names Wi-Fi on 68 of 76 real properties and breakfast on 13, so a
 * must-have can be perfectly reasonable and mostly unanswerable. He asked to
 * be told that once instead of reading "not listed" five times.
 */
describe("saying when a must-have could not be checked", () => {
  const OSAKA = [
    { amenities: ["Free Wi-Fi", "Kid-friendly"] },
    { amenities: ["Free Wi-Fi", "Kitchen"] },
    { amenities: [] },
    { amenities: ["Free Wi-Fi", "Accessible"] },
    { amenities: ["Free Wi-Fi"] },
  ];

  it("says so when most of the list cannot answer", () => {
    expect(unansweredNote(parseAsk("breakfast"), OSAKA))
      .toBe("Google doesn't say either way about breakfast for any of these. Worth checking the listing.");
  });

  it("counts when only some cannot answer", () => {
    const mixed = [{ amenities: ["Free breakfast"] }, ...OSAKA.slice(0, 3)];
    expect(unansweredNote(parseAsk("breakfast"), mixed))
      .toBe("Google doesn't say either way about breakfast for 3 of these 4. Worth checking the listing.");
  });

  it("says nothing when the data does answer", () => {
    expect(unansweredNote(parseAsk("wifi"), OSAKA)).toBeNull();
    // Stated absent is an answer too, even though it is a no.
    expect(unansweredNote(parseAsk("pool"), [{ amenities: ["Free Wi-Fi"], excluded: ["No pool"] }])).toBeNull();
  });

  it("says nothing when he asked for nothing, or there is nothing to check", () => {
    expect(unansweredNote(parseAsk(null), OSAKA)).toBeNull();
    expect(unansweredNote(parseAsk("breakfast"), [])).toBeNull();
  });

  it("never counts a nice-to-have as a must", () => {
    expect(unansweredNote(parseAsk("breakfast would be nice"), OSAKA)).toBeNull();
  });

  it("names two at most, busiest first", () => {
    const note = unansweredNote(parseAsk("we need breakfast, a hot tub and a shuttle"), OSAKA) ?? "";
    expect(note.split(" or ").length).toBeLessThanOrEqual(2);
    expect(note).toMatch(/breakfast|hot tub|airport shuttle/);
  });
});
