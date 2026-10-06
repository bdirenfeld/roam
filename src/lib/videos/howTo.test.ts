import { describe, it, expect } from "vitest";
import {
  VIDEOS, sharedLinkVideo, parseManifest, parseSeen, listed, forSurface, startHereVideo, fileUrl, posterUrl, manifestUrl, localSeenKey, widePlayerSize,
  type Available,
} from "./howTo";

const T = "2026-10-02T20:00:00Z";
const onlyFirst: Available = { "first-journey": 1 };
const all: Available = { "first-journey": 1, "planning-computer": 1, "on-the-trip": 1 };

describe("the video list", () => {
  it("the organiser's four in the order they use Roam, then the shared link's two (5 Oct 2026)", () => {
    expect(VIDEOS.map((v) => [v.id, v.title, v.length])).toEqual([
      ["first-journey", "Your first journey", "1 min"],
      ["planning-computer", "Planning on a computer", "1 min"],
      ["more-tricks", "Two more planning tricks", "20 s"],
      ["in-the-app", "Using Roam on your trip", "1 min"],
      ["before-the-trip", "Your shared link: before the trip", "45 s"],
      ["on-the-trip", "Your shared link: on the trip", "45 s"],
    ]);
  });

  it("video 4 is offered on one screen only: the phone's day once the trip is under way (2 Oct 2026)", () => {
    expect(VIDEOS.find((v) => v.id === "in-the-app")!.surfaces).toEqual(["trip-underway"]);
    expect(VIDEOS.filter((v) => v.surfaces.includes("trip-underway")).map((v) => v.id)).toEqual(["in-the-app"]);
    expect(forSurface("trip-underway", { ...all, "in-the-app": 1 }, {})).toBe("in-the-app");
    expect(forSurface("trip-underway", { ...all, "in-the-app": 1 }, { "in-the-app": T })).toBeNull();
    expect(forSurface("trip-underway", all, {})).toBeNull();
    const four: Available = { ...all, "in-the-app": 1 };
    expect(listed(four).map((v) => v.id)).toContain("in-the-app");
    for (const s of ["journeys-empty", "start-here", "start-here-computer", "shared-link"] as const) {
      expect(forSurface(s, { "in-the-app": 1 }, {})).toBeNull();
    }
  });

  it("each video shows in at most two places before it is gone (the mock's table)", () => {
    expect(VIDEOS.find((v) => v.id === "first-journey")!.surfaces).toEqual(["journeys-empty", "start-here", "start-here-computer"]);
    expect(VIDEOS.find((v) => v.id === "planning-computer")!.surfaces).toEqual(["start-here-computer"]);
    expect(VIDEOS.find((v) => v.id === "on-the-trip")!.surfaces).toEqual(["shared-link"]);
  });

  it("files are distinct and never in the repo's public folder", () => {
    const names = VIDEOS.flatMap((v) => [v.file, v.poster]);
    expect(new Set(names).size).toBe(names.length);
    const url = fileUrl("https://x.supabase.co/", VIDEOS[0], { "first-journey": 3 });
    expect(url).toBe("https://x.supabase.co/storage/v1/object/public/how-to-videos/first-journey.mp4?v=3");
    expect(posterUrl("https://x.supabase.co", VIDEOS[0], { "first-journey": 3 })).toContain("/how-to-videos/first-journey.jpg?v=3");
    expect(manifestUrl("https://x.supabase.co")).toBe("https://x.supabase.co/storage/v1/object/public/how-to-videos/videos.json");
  });
});

describe("videos.json switches them on", () => {
  it("a version above 0 is on; 0, junk and unknown ids are off", () => {
    expect(parseManifest({ "first-journey": 2, "planning-computer": 0, "on-the-trip": "1", other: 4 })).toEqual({ "first-journey": 2 });
  });
  it("no manifest, or not an object: nothing is on", () => {
    expect(parseManifest(null)).toEqual({});
    expect(parseManifest([1])).toEqual({});
    expect(listed(parseManifest(undefined))).toEqual([]);
  });
  it("today: only video 1 is up, so the menu lists one and video 3's strip never shows", () => {
    expect(listed(onlyFirst).map((v) => v.id)).toEqual(["first-journey"]);
    expect(forSurface("shared-link", onlyFirst, {})).toBeNull();
    expect(forSurface("shared-link", all, {})).toBe("on-the-trip");
  });
});

describe("what someone has seen", () => {
  it("keeps only known ids with a time", () => {
    expect(parseSeen({ "first-journey": T, "planning-computer": "", junk: T })).toEqual({ "first-journey": T });
    expect(parseSeen(null)).toEqual({});
  });
  it("once gone, video 1 leaves the Journeys page and the phone card", () => {
    expect(forSurface("journeys-empty", all, {})).toBe("first-journey");
    expect(forSurface("journeys-empty", all, { "first-journey": T })).toBeNull();
    expect(startHereVideo({ computer: false, available: all, seenAtLoad: { "first-journey": T }, goneNow: { "first-journey": T } })).toBeNull();
  });
  it("the menu lists a video whether or not it has been seen", () => {
    expect(listed(all)).toHaveLength(3);
  });
});

describe("Start here carries one video at a time", () => {
  it("phone: video 1 as a row, never video 2", () => {
    expect(startHereVideo({ computer: false, available: all, seenAtLoad: {}, goneNow: {} })).toEqual({ id: "first-journey", style: "row" });
    expect(startHereVideo({ computer: false, available: all, seenAtLoad: { "first-journey": T }, goneNow: { "first-journey": T } })).toBeNull();
  });
  it("computer: video 1 first; closing it does NOT slide video 2 in during the same visit", () => {
    expect(startHereVideo({ computer: true, available: all, seenAtLoad: {}, goneNow: {} })).toEqual({ id: "first-journey", style: "row" });
    expect(startHereVideo({ computer: true, available: all, seenAtLoad: {}, goneNow: { "first-journey": T } })).toBeNull();
  });
  it("computer, the next visit: video 2 as the quiet line; gone, nothing", () => {
    const seen = { "first-journey": T };
    expect(startHereVideo({ computer: true, available: all, seenAtLoad: seen, goneNow: seen })).toEqual({ id: "planning-computer", style: "line" });
    const both = { ...seen, "planning-computer": T };
    expect(startHereVideo({ computer: true, available: all, seenAtLoad: both, goneNow: both })).toBeNull();
  });
  it("video 2 not uploaded yet: the computer's card has nothing after video 1", () => {
    const seen = { "first-journey": T };
    expect(startHereVideo({ computer: true, available: onlyFirst, seenAtLoad: seen, goneNow: seen })).toBeNull();
  });
  it("nothing uploaded: no video row at all", () => {
    expect(startHereVideo({ computer: true, available: {}, seenAtLoad: {}, goneNow: {} })).toBeNull();
  });
});

it("a visitor's key is per video", () => {
  expect(localSeenKey("on-the-trip")).toBe("roam:video-seen:on-the-trip");
});

describe("the computer's centred player (2 Oct 2026)", () => {
  it("is two-thirds of a laptop's width at 16:9", () => {
    expect(widePlayerSize(16 / 9, 1440, 900)).toEqual({ width: 960, height: 540 });
    expect(widePlayerSize(16 / 9, 1200, 900)).toEqual({ width: 800, height: 450 });
  });
  it("never wider than 960 px on a big monitor", () => {
    expect(widePlayerSize(16 / 9, 2560, 1440).width).toBe(960);
  });
  it("a 4:5 video is held to the window's height, not stretched to its width", () => {
    const s = widePlayerSize(4 / 5, 1440, 900);
    expect(s.height).toBeLessThanOrEqual(900 * 0.8);
    expect(s.width / s.height).toBeCloseTo(0.8, 2);
  });
  it("an unknown shape plays as 16:9", () => {
    expect(widePlayerSize(NaN, 1200, 900)).toEqual({ width: 800, height: 450 });
  });
});

describe("the shared link's video 3 (5 Oct 2026)", () => {
  const both: Available = { "before-the-trip": 1, "on-the-trip": 2 };
  it("before the first day: Before the trip; from the first day: On the trip", () => {
    expect(sharedLinkVideo("2027-08-24", "2026-10-05", both)).toBe("before-the-trip");
    expect(sharedLinkVideo("2027-08-24", "2027-08-24", both)).toBe("on-the-trip");
    expect(sharedLinkVideo("2026-07-23", "2026-10-05", both)).toBe("on-the-trip");
  });
  it("offers the other one when the fitting one is off; neither, nothing", () => {
    expect(sharedLinkVideo("2027-08-24", "2026-10-05", { "on-the-trip": 2 })).toBe("on-the-trip");
    expect(sharedLinkVideo("2026-07-23", "2026-10-05", { "before-the-trip": 1 })).toBe("before-the-trip");
    expect(sharedLinkVideo("2027-08-24", "2026-10-05", { "first-journey": 1 })).toBeNull();
  });
  it("no dates yet counts as before", () => {
    expect(sharedLinkVideo(null, "2026-10-05", both)).toBe("before-the-trip");
  });
  it("the two new videos are in the Videos list, in order, when switched on", () => {
    const six: Available = { "first-journey": 2, "planning-computer": 2, "more-tricks": 1, "before-the-trip": 1, "on-the-trip": 2, "in-the-app": 1 };
    expect(listed(six).map((v) => v.id)).toEqual(["first-journey", "planning-computer", "more-tricks", "in-the-app", "before-the-trip", "on-the-trip"]);
    expect(VIDEOS.find((v) => v.id === "more-tricks")!.surfaces).toEqual([]);
  });
});
