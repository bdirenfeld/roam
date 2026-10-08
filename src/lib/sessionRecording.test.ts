/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest";
import { clarityProjectFor, isOwnerEmail, shouldRecord, loadClarity } from "./sessionRecording";

describe("isOwnerEmail", () => {
  it("matches Brennan's accounts, any case, with + aliases", () => {
    expect(isOwnerEmail("bdirenfeld@gmail.com")).toBe(true);
    expect(isOwnerEmail(" BDirenfeld@Gmail.com ")).toBe(true);
    expect(isOwnerEmail("bdirenfeld+roamtest@gmail.com")).toBe(true);
    expect(isOwnerEmail("Brennan@Direnfeld.com")).toBe(true);
  });
  it("does not match testers or lookalikes", () => {
    expect(isOwnerEmail("ayshateja@gmail.com")).toBe(false);
    expect(isOwnerEmail("bdirenfeld@gmail.co")).toBe(false);
    expect(isOwnerEmail("xbdirenfeld@gmail.com")).toBe(false);
    expect(isOwnerEmail(null)).toBe(false);
    expect(isOwnerEmail("not-an-email")).toBe(false);
  });
});

describe("clarityProjectFor", () => {
  it("records only on the live site", () => {
    expect(clarityProjectFor("roam-roan.vercel.app", undefined)).toBe("yuj39nvz5w");
    expect(clarityProjectFor("localhost", undefined)).toBeNull();
    expect(clarityProjectFor("roam-git-main-bdirenfelds-projects.vercel.app", undefined)).toBeNull();
  });
  it("lets Vercel override or switch it off", () => {
    expect(clarityProjectFor("roam-roan.vercel.app", "abc123")).toBe("abc123");
    expect(clarityProjectFor("roam-roan.vercel.app", "off")).toBeNull();
    expect(clarityProjectFor("roam-roan.vercel.app", "  ")).toBe("yuj39nvz5w");
  });
});

describe("shouldRecord", () => {
  it("is off without a valid project ID", () => {
    expect(shouldRecord(undefined, "someone@x.com")).toBe(false);
    expect(shouldRecord("", null)).toBe(false);
    expect(shouldRecord("abc\"><script>", null)).toBe(false);
  });
  it("records testers and signed-out guests, never Brennan", () => {
    expect(shouldRecord("ab12cd34ef", "smovchovitch@gmail.com")).toBe(true);
    expect(shouldRecord("ab12cd34ef", null)).toBe(true);
    expect(shouldRecord("ab12cd34ef", "bdirenfeld@gmail.com")).toBe(false);
  });
});

describe("loadClarity", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    delete (window as unknown as { clarity?: unknown }).clarity;
  });
  it("adds the tag once and queues calls made before it loads", () => {
    const clarity = loadClarity("ab12cd34ef");
    clarity("identify", "user-1");
    loadClarity("ab12cd34ef");
    const tags = document.head.querySelectorAll("script");
    expect(tags.length).toBe(1);
    expect(tags[0].src).toBe("https://www.clarity.ms/tag/ab12cd34ef");
    expect(clarity.q).toEqual([["identify", "user-1"]]);
  });
});
