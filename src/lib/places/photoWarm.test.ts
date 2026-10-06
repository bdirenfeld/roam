import { describe, it, expect } from "vitest";
import {
  galleryUrls,
  indexesToWarm,
  liveCachedUrl,
  mergePhotoCache,
  photoCacheKey,
  warmMarker,
  WARM_KEY,
} from "./photoWarm";

// A real row (places d03e07dc…, 10 photos), copied out of the live database
// on 5 Oct 2026: the cover, its thumbnail and photo 1 stored, each with its
// own expiry — the shape every place has today.
const BASE = "https://ejluvgjiqcwvqhzqpkrz.supabase.co/storage/v1/object/public/place-photos/d03e07dc-42d3-4f7b-8f0c-9fbe33f4fe00";
const LIVE_ROW = {
  "0": { url: `${BASE}/0.jpg`, until: "2026-10-07T12:30:37.881Z" },
  "1": { url: `${BASE}/1.png`, until: "2026-10-24T22:34:21.590Z" },
  t0: { url: `${BASE}/0-thumb.jpg`, until: "2026-10-06T16:59:34.952Z" },
};
const NOW = Date.parse("2026-10-05T23:00:00Z");

describe("photoCacheKey", () => {
  it("is the bare index for full size and t-prefixed for a thumbnail", () => {
    expect(photoCacheKey(3)).toBe("3");
    expect(photoCacheKey(0, "thumb")).toBe("t0");
  });
});

describe("liveCachedUrl", () => {
  it("returns a stored URL inside its 30 days", () => {
    expect(liveCachedUrl(LIVE_ROW, "1", NOW)).toBe(`${BASE}/1.png`);
  });
  it("returns null once the copy has lapsed (Google terms: temporary only)", () => {
    expect(liveCachedUrl(LIVE_ROW, "0", Date.parse("2026-10-08T00:00:00Z"))).toBeNull();
  });
  it("never treats the warm marker as a photo", () => {
    expect(liveCachedUrl({ [WARM_KEY]: warmMarker(NOW) }, WARM_KEY, NOW)).toBeNull();
  });
  it("survives null, arrays and junk", () => {
    expect(liveCachedUrl(null, "0", NOW)).toBeNull();
    expect(liveCachedUrl([], "0", NOW)).toBeNull();
    expect(liveCachedUrl({ "0": { url: "x" } }, "0", NOW)).toBeNull();
  });
});

describe("galleryUrls", () => {
  it("gives the gallery our copy where there is one, null elsewhere", () => {
    const urls = galleryUrls(LIVE_ROW, 10, NOW);
    expect(urls).toHaveLength(10);
    expect(urls[0]).toBe(`${BASE}/0.jpg`);
    expect(urls[1]).toBe(`${BASE}/1.png`);
    expect(urls.slice(2).every((u) => u === null)).toBe(true);
  });
  it("never lists more than Google's ten", () => {
    expect(galleryUrls({}, 25, NOW)).toHaveLength(10);
  });
});

describe("indexesToWarm", () => {
  it("copies every slide still missing, except the cover the card fetches itself", () => {
    expect(indexesToWarm(LIVE_ROW, 10, NOW)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });
  it("re-copies a lapsed slide", () => {
    const later = Date.parse("2026-10-25T00:00:00Z"); // photo 1 has lapsed by now
    expect(indexesToWarm(LIVE_ROW, 3, later)).toEqual([1, 2]);
  });
  it("asks nothing once the place was warmed inside its 30 days — once per place", () => {
    const warmed = { ...LIVE_ROW, [WARM_KEY]: warmMarker(NOW) };
    expect(indexesToWarm(warmed, 10, NOW)).toEqual([]);
    // ...and asks again after the marker lapses, when the copies have too.
    expect(indexesToWarm(warmed, 10, NOW + 31 * 86400_000)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
  it("has nothing to do for a one-photo or photo-less place", () => {
    expect(indexesToWarm({}, 1, NOW)).toEqual([]);
    expect(indexesToWarm(null, 0, NOW)).toEqual([]);
  });
});

describe("mergePhotoCache", () => {
  it("adds new copies without losing the ones other requests stored", () => {
    const merged = mergePhotoCache(LIVE_ROW, { "2": { url: `${BASE}/2.jpg`, until: "2026-11-04T00:00:00Z" } });
    expect(Object.keys(merged).sort()).toEqual(["0", "1", "2", "t0"]);
    expect(merged.t0).toEqual(LIVE_ROW.t0);
  });
  it("starts from nothing when the column is empty", () => {
    expect(mergePhotoCache(null, { "1": { url: "u", until: "x" } })).toEqual({ "1": { url: "u", until: "x" } });
  });
});
