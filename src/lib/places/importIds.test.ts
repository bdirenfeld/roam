import { describe, it, expect } from "vitest";
// Imported from the script rather than from src/lib: it has to run under bare
// `node`, which cannot import TypeScript. Testing it from this side is the
// alternative to keeping a second copy of the logic in src/lib, and a second
// copy is how agendaOrder came to disagree with itself. `allowJs` in
// tsconfig.json is what lets tsc read it.
import { parseIds, batch } from "../../../scripts/import-places.mjs";

/**
 * The id list handed to `/api/places/bulk-import`.
 *
 * Both of these are about a real failure mode rather than tidiness. The route
 * caps a call at 50 ids and fails the WHOLE call on 51, so a 42-place import
 * that grows to 60 must split rather than error. And the ids arrive in
 * whatever shape the resolution step produced — a text file someone pasted, a
 * JSON array, or the array of objects a Places lookup returns — so the parser
 * accepts all three instead of making the caller normalise first.
 */

describe("parseIds", () => {
  it("reads one id per line", () => {
    expect(parseIds("ChIJaaa\nChIJbbb\n")).toEqual(["ChIJaaa", "ChIJbbb"]);
  });

  it("ignores blank lines and comments", () => {
    expect(parseIds("# Palm Springs\n\nChIJaaa\n\n  ChIJbbb  \n")).toEqual(["ChIJaaa", "ChIJbbb"]);
  });

  it("reads a JSON array of strings", () => {
    expect(parseIds('["ChIJaaa", "ChIJbbb"]')).toEqual(["ChIJaaa", "ChIJbbb"]);
  });

  it("reads a JSON array of objects, which is what a resolution step hands over", () => {
    const resolved = JSON.stringify([
      { name: "Parker Palm Springs", google_place_id: "ChIJaaa" },
      { name: "Sandfish", google_place_id: "ChIJbbb" },
    ]);
    expect(parseIds(resolved)).toEqual(["ChIJaaa", "ChIJbbb"]);
  });

  it("drops an entry that resolved to nothing rather than sending undefined", () => {
    // A name with no Google listing — a villa, a private chef, a driver — comes
    // back without an id. Sending it would fail the whole call on validation.
    const resolved = JSON.stringify([
      { name: "Villa la Magnolia" },
      { name: "Sandfish", google_place_id: "ChIJbbb" },
    ]);
    expect(parseIds(resolved)).toEqual(["ChIJbbb"]);
  });
});

describe("batch", () => {
  it("keeps a short list in one call", () => {
    expect(batch(["a", "b", "c"])).toEqual([["a", "b", "c"]]);
  });

  it("splits at the route's hard cap of 50", () => {
    const ids: string[] = [];
    for (let i = 0; i < 42 + 50; i++) ids.push("ChIJ" + i);
    const calls = batch(ids);
    expect(calls.length).toBe(2);
    expect(calls[0].length).toBe(50);
    expect(calls[1].length).toBe(42);
  });

  it("never emits an empty call, which the route rejects with a 400", () => {
    const ids: string[] = [];
    for (let i = 0; i < 100; i++) ids.push("ChIJ" + i);
    for (const call of batch(ids)) expect(call.length).toBeGreaterThan(0);
  });
});
