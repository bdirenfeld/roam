import { describe, it, expect } from "vitest";
import {
  isTravelLeg, legTitle, legSubtitle, legDurationMins, shouldDrawLine, defaultFromForDay,
  legLines, withFrom, readFrom, formatLegDuration, legModeWord, type LegDay,
} from "./leg";

/**
 * The travel leg (7 Oct 2026). Fixtures are the G Adventures test journey's
 * rows as the live database holds them (c4e1a7b2…, days 21–24, Feb 2027):
 * Day 23 is the 13-hour truck from Lusaka to Mfuwe in the approved mock.
 */
const LUSAKA = { title: "Lusaka", lat: -15.4154677, lng: 28.2773267, google_place_id: "ChIJSaq8PH3zQBkR6xMgRsGT0NA", place_id: "23774ff9-0bbd-41fa-ac51-4543349825e3" };

const mfuwePlace = { id: "10266486-2afd-4c8a-8e5c-131c43d610fb", title: "Mfuwe", type: "logistics", sub_type: "transit", lat: -13.2549974, lng: 31.9326952 };

const truck = {
  id: "b7580610-4c12-479c-a313-febcfa19e58b",
  status: "in_itinerary",
  start_time: "06:00:00",
  end_time: "19:00:00",
  details: { title: "Lusaka → Mfuwe", named: true, from: LUSAKA, mode: "drive", mode_label: "Overland truck" },
  place: mfuwePlace,
};

const leg = (over: Record<string, unknown> = {}, details: Record<string, unknown> = {}) => ({
  ...truck, ...over, details: { ...truck.details, ...details },
});

describe("isTravelLeg", () => {
  it("is a transit place with a start", () => {
    expect(isTravelLeg(truck)).toBe(true);
  });
  it("is not a transit stop with no start (the airport, a rental car pick-up)", () => {
    expect(isTravelLeg({ ...truck, details: { title: "Pick up rental car" } })).toBe(false);
  });
  it("is not a hotel or a restaurant that somehow carries a from", () => {
    expect(isTravelLeg({ ...truck, place: { ...mfuwePlace, sub_type: "hotel" } })).toBe(false);
    expect(isTravelLeg({ ...truck, place: { ...mfuwePlace, type: "food", sub_type: "restaurant" } })).toBe(false);
  });
  it("is not a leg whose start has no real point", () => {
    expect(isTravelLeg(leg({}, { from: { title: "Lusaka" } }))).toBe(false);
    expect(isTravelLeg(leg({}, { from: { title: "", lat: 1, lng: 2 } }))).toBe(false);
    expect(readFrom({ from: { title: "X", lat: 200, lng: 0 } })).toBeNull();
  });
  it("a note card (no place) is never a leg", () => {
    expect(isTravelLeg({ ...truck, place: null })).toBe(false);
  });
});

describe("legTitle", () => {
  it("reads 'From → To' in full, the way a flight reads YYZ → LGA", () => {
    expect(legTitle(truck)).toBe("Lusaka → Mfuwe");
  });
  it("an unnamed leg is built from its start and its place", () => {
    expect(legTitle(leg({}, { named: false, title: undefined }))).toBe("Lusaka → Mfuwe");
  });
  it("a named tour leg keeps the town it names, not the gate its pin sits on", () => {
    const delta = leg({ place: { ...mfuwePlace, title: "Mokoro Station - Boro 2" } }, { title: "Maun → Okavango Delta", from: { title: "Maun", lat: -19.995, lng: 23.418 } });
    expect(legTitle(delta)).toBe("Maun → Okavango Delta");
  });
});

describe("legDurationMins / legSubtitle", () => {
  it("13 hours on the truck reads 'Overland truck · 13h'", () => {
    expect(legDurationMins(truck)).toBe(780);
    expect(legSubtitle(truck)).toBe("Overland truck · 13h");
  });
  it("uses the mode's own word when there is no label", () => {
    expect(legSubtitle(leg({ start_time: "08:30:00", end_time: "10:00:00" }, { mode: "ferry", mode_label: undefined }))).toBe("Ferry · 1h 30m");
    expect(legModeWord({ mode: "train" })).toBe("Train");
  });
  it("no mode, no mode word: the caption is only the length (7 Oct 2026, mock t05)", () => {
    expect(legModeWord({})).toBe("");
    expect(legModeWord(null)).toBe("");
    expect(legSubtitle(leg({}, { mode: undefined, mode_label: undefined }))).toBe("13h");
    expect(legSubtitle(leg({ start_time: null, end_time: null }, { mode: undefined, mode_label: undefined }))).toBe("");
  });
  it("an untimed leg says only its mode", () => {
    expect(legDurationMins(leg({ start_time: null, end_time: null }))).toBeNull();
    expect(legSubtitle(leg({ start_time: null, end_time: null }))).toBe("Overland truck");
  });
  it("an overnight leg wraps past midnight", () => {
    expect(legDurationMins(leg({ start_time: "22:00:00", end_time: "06:00:00" }))).toBe(480);
  });
  it("formats minutes the short way", () => {
    expect(formatLegDuration(45)).toBe("45m");
    expect(formatLegDuration(60)).toBe("1h");
    expect(formatLegDuration(95)).toBe("1h 35m");
  });
});

describe("shouldDrawLine — only legs over about an hour (his tweak 1)", () => {
  it("draws the 13-hour truck", () => {
    expect(shouldDrawLine(truck)).toBe(true);
  });
  it("draws at exactly an hour, not at 59 minutes", () => {
    expect(shouldDrawLine(leg({ start_time: "06:00:00", end_time: "07:00:00" }))).toBe(true);
    expect(shouldDrawLine(leg({ start_time: "06:00:00", end_time: "06:59:00" }))).toBe(false);
  });
  it("an untimed leg is drawn only when it is clearly far (Lusaka → Mfuwe is ~530 km)", () => {
    expect(shouldDrawLine(leg({ start_time: null, end_time: null }))).toBe(true);
    const near = { title: "Mfuwe airport", lat: -13.2589, lng: 31.9366 };
    expect(shouldDrawLine(leg({ start_time: null, end_time: null }, { from: near }))).toBe(false);
  });
  it("never a leg that starts where it ends (a border post after the truck)", () => {
    const same = { title: "Mfuwe", lat: mfuwePlace.lat, lng: mfuwePlace.lng };
    expect(shouldDrawLine(leg({}, { from: same }))).toBe(false);
  });
  it("never a plain transit stop", () => {
    expect(shouldDrawLine({ ...truck, details: {} })).toBe(false);
  });
});

describe("legLines", () => {
  it("gives the map [lng, lat] for the start, the end and the middle", () => {
    const [l] = legLines([truck]);
    expect(l.from).toEqual([LUSAKA.lng, LUSAKA.lat]);
    expect(l.to).toEqual([mfuwePlace.lng, mfuwePlace.lat]);
    expect(l.mid[0]).toBeCloseTo((LUSAKA.lng + mfuwePlace.lng) / 2);
    expect(l.mode).toBe("drive");
  });
  it("leaves out short legs and cut cards", () => {
    expect(legLines([leg({ end_time: "06:30:00" }), leg({ status: "cut" })])).toEqual([]);
  });
});

describe("withFrom", () => {
  it("a named A → B title takes the new A and keeps its B", () => {
    const eureka = { title: "Eureka Camping Park", lat: -15.5035103, lng: 28.2645026 };
    const d = withFrom(truck.details, eureka);
    expect(d.title).toBe("Eureka Camping Park → Mfuwe");
    expect(d.from).toEqual(eureka);
    expect(d.mode).toBe("drive"); // the truck's own mode, kept
  });
  it("does not guess a mode when a transit card first gets a start (7 Oct 2026, mock t05; was drive)", () => {
    const d = withFrom({ notes: "x" }, LUSAKA);
    expect(d).toEqual({ notes: "x", from: LUSAKA });
  });
});

// Days 21–24 as stored: the hotel is Shearwater until check-out on day 22,
// Eureka is checked into on day 22, Croc Valley on day 23.
const hotel = (id: string, title: string, lat: number, lng: number, g: string, placeId: string, t = "17:00:00") => ({
  id, place_id: placeId, status: "in_itinerary", start_time: t, details: null,
  place: { id: placeId, title, sub_type: "hotel", lat, lng, google_place_id: g },
});
const DAYS: LegDay[] = [
  { id: "d20", date: "2027-02-19", cards: [hotel("ecef281e", "Shearwater Explorers Village", -17.9241715, 25.8410587, "ChIJn9VzLVDlTxkRvqJzL68YEOE", "087b9d34", "14:30:00")] },
  { id: "d21", date: "2027-02-20", cards: [] },
  { id: "d22", date: "2027-02-21", cards: [
    { ...hotel("a3b5ae02", "Shearwater Explorers Village", -17.9241715, 25.8410587, "ChIJn9VzLVDlTxkRvqJzL68YEOE", "087b9d34", "05:30:00"), details: { title: "Check out of Shearwater Explorers Village" } },
    hotel("4dd508f2", "Eureka Camping Park", -15.5035103, 28.2645026, "ChIJG323yGLtQBkR2wnS5P2mPOM", "ee27ab67"),
  ] },
  { id: "d23", date: "2027-02-22", cards: [hotel("687eb6dd", "Croc Valley Camp", -13.1007165, 31.7944507, "ChIJs3TnCeLlGRkR4_BCclSuAHc", "edde0c4a", "19:00:00")] },
  { id: "d24", date: "2027-02-23", cards: [] },
];

describe("defaultFromForDay — a hand-added leg starts at last night's stay (his tweak 2)", () => {
  it("Day 23 starts at Eureka Camping Park, the night of the 21st", () => {
    expect(defaultFromForDay(DAYS, "d23")).toEqual({
      title: "Eureka Camping Park", lat: -15.5035103, lng: 28.2645026,
      google_place_id: "ChIJG323yGLtQBkR2wnS5P2mPOM", place_id: "ee27ab67",
    });
  });
  it("on check-out day it is the hotel you are leaving, not the one you check into that evening", () => {
    expect(defaultFromForDay(DAYS, "d22")?.title).toBe("Shearwater Explorers Village");
  });
  it("a night covered by a stay checked in days earlier still counts", () => {
    expect(defaultFromForDay(DAYS, "d24")?.title).toBe("Croc Valley Camp");
  });
  it("the first day, and an unknown day, have no default", () => {
    expect(defaultFromForDay(DAYS, "d20")).toBeNull();
    expect(defaultFromForDay(DAYS, "nope")).toBeNull();
  });
  it("an 'interested' hotel is not a stay", () => {
    const ideas: LegDay[] = [
      { id: "a", date: "2027-02-19", cards: [{ ...hotel("h", "Idea Lodge", 1, 2, "g", "p"), status: "interested" }] },
      { id: "b", date: "2027-02-20", cards: [] },
    ];
    expect(defaultFromForDay(ideas, "b")).toBeNull();
  });
});
