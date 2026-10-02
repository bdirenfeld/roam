import { describe, it, expect } from "vitest";
import {
  VIDEOS, parseManifest, parseSeen, listed, forSurface, startHereVideo, fileUrl, posterUrl, manifestUrl, localSeenKey,
  type Available,
} from "./howTo";

const T = "2026-10-02T20:00:00Z";
const onlyFirst: Available = { "first-journey": 1 };
const all: Available = { "first-journey": 1, "planning-computer": 1, "on-the-trip": 1 };

describe("the video list", () => {
  it("is the mock's three, with its words and lengths", () => {
    expect(VIDEOS.map((v) => [v.id, v.title, v.length])).toEqual([
      ["first-journey", "Your first journey", "1 min"],
      ["planning-computer", "Planning on a computer", "1 min"],
      ["on-the-trip", "On the trip", "45 s"],
    ]);
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
