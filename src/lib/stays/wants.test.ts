import { describe, it, expect } from "vitest";
import { parseWants, wantVerdict, failsWants, wantsNote, wantsQuery } from "./wants";

describe("parseWants", () => {
  it("picks out what a listing can actually answer", () => {
    expect(parseWants("villa with a pool, playground nearby")).toEqual(["pool"]);
    expect(parseWants("pool and air conditioning")).toEqual(["pool", "ac"]);
    expect(parseWants("somewhere with A/C")).toEqual(["ac"]);
    expect(parseWants("swimming")).toEqual(["pool"]);
  });

  it("ignores what it cannot check, rather than pretending", () => {
    expect(parseWants("playground nearby, walk to the beach")).toEqual([]);
    expect(parseWants("")).toEqual([]);
    expect(parseWants(null)).toEqual([]);
  });

  it("does not match a word that merely contains one", () => {
    expect(parseWants("Liverpool")).toEqual([]);
    expect(parseWants("a nice place")).toEqual([]);
  });

  it("never repeats a key", () => {
    expect(parseWants("pool, pool, swimming pool")).toEqual(["pool"]);
  });
});

describe("wantVerdict", () => {
  it("keeps three states apart", () => {
    expect(wantVerdict("pool", { pool: true, ac: null })).toBe("yes");
    expect(wantVerdict("pool", { pool: false, ac: null })).toBe("no");
    expect(wantVerdict("pool", { pool: null, ac: null })).toBe("unknown");
  });
});

describe("failsWants", () => {
  it("drops only what the listing says is missing", () => {
    expect(failsWants(["pool"], { pool: false, ac: null })).toBe(true);
    expect(failsWants(["pool"], { pool: true, ac: null })).toBe(false);
    // The Tuscany case: no amenities at all. Nothing may be dropped for that.
    expect(failsWants(["pool"], { pool: null, ac: null })).toBe(false);
  });

  it("fails on any one of several must-haves", () => {
    expect(failsWants(["pool", "ac"], { pool: true, ac: false })).toBe(true);
    expect(failsWants([], { pool: false, ac: false })).toBe(false);
  });
});

describe("wantsNote", () => {
  it("says which one it could not verify, so a blank is never read as a yes", () => {
    expect(wantsNote(["pool"], { pool: null, ac: null })).toBe("Pool not listed");
    expect(wantsNote(["pool", "ac"], { pool: null, ac: null })).toBe("Pool and AC not listed");
    expect(wantsNote(["pool", "ac"], { pool: true, ac: null })).toBe("AC not listed");
  });

  it("says nothing when everything asked for is confirmed", () => {
    expect(wantsNote(["pool"], { pool: true, ac: null })).toBeNull();
    expect(wantsNote([], { pool: null, ac: null })).toBeNull();
  });
});

describe("wantsQuery", () => {
  it("carries the whole line into the search, tidied and capped", () => {
    expect(wantsQuery("  villa   with a pool ")).toBe("villa with a pool");
    expect(wantsQuery(null)).toBe("");
    expect(wantsQuery("x".repeat(200)).length).toBe(80);
  });
});
