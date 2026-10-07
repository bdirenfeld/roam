import { describe, it, expect } from "vitest";
import type { Card } from "@/types/database";
import { savedPlaceMatches, withoutSaved } from "./hourSuggest";

// Tuscany's saved places, as the week holds them: some on days, some saved.
const place = (id: string, title: string, gid: string | null = null) =>
  ({ id, title, type: "food", sub_type: "restaurant", lat: 43, lng: 11, address: null, google_place_id: gid, cover_image_url: null, rating: null, price_level: null });
const card = (id: string, p: ReturnType<typeof place> | null) =>
  ({ id, place_id: p?.id ?? null, place: p, details: p ? {} : { title: "Note" } }) as unknown as Card;

const cards = [
  card("1", place("osteria", "Osteria del Borgo")),
  card("2", place("mario", "Buca Mario", "g-mario")),
  card("3", place("mario", "Buca Mario", "g-mario")),   // the same place on a second day
  card("4", place("cafe", "Caffè Gilli")),
  card("5", place("sant", "Trattoria La Buca")),
  card("6", null),                                      // a note has no place
];

describe("savedPlaceMatches", () => {
  it("matches by name, each place once, a name that starts with it first", () => {
    expect(savedPlaceMatches("buca", cards).map((p) => p.id)).toEqual(["mario", "sant"]);
  });

  it("folds accents and case", () => {
    expect(savedPlaceMatches("CAFFE", cards).map((p) => p.id)).toEqual(["cafe"]);
  });

  it("waits for two letters, and finds nothing for a name not saved", () => {
    expect(savedPlaceMatches("b", cards)).toEqual([]);
    expect(savedPlaceMatches("uffizi", cards)).toEqual([]);
  });
});

describe("withoutSaved", () => {
  it("drops Google's row for a place already offered from the journey", () => {
    const preds = [{ place_id: "g-mario" }, { place_id: "g-santantonio" }];
    expect(withoutSaved(preds, savedPlaceMatches("buca", cards))).toEqual([{ place_id: "g-santantonio" }]);
  });
});
