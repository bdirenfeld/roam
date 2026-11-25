import { describe, it, expect } from "vitest";
import { cleanBody, conversations, isUrgent, isUuid, mayAlert, mayAsk, messageCode, pictureType, safeScreen, threadOf, tripFromScreen, unreadElsewhere, MAX_BODY, type HelpRow } from "./message";

const ID = "ece938aa-db7b-4436-bb59-442cc0dc5e10";
const row = (id: string, user_id: string, from_admin: boolean, created_at: string, body = "hi"): HelpRow => ({ id, user_id, from_admin, body, created_at, picture_path: null, context: null, read_at: null });

describe("a help message", () => {
  it("keeps the words and the line breaks, drops nothing-messages and control characters", () => {
    expect(cleanBody("  two\nlines\u0000 ")).toBe("two\nlines");
    expect(cleanBody("   ")).toBeNull();
    expect(cleanBody(4)).toBeNull();
    expect(cleanBody("x".repeat(5000))!.length).toBe(MAX_BODY);
  });
  it("never keeps a share link's token or a query", () => {
    expect(safeScreen("/journey/SECRET/day?x=1")).toBe("/journey/[link]/day");
    expect(safeScreen(`/trips/${ID}/map?pin=9#a`)).toBe(`/trips/${ID}/map`);
    expect(safeScreen("https://evil.example")).toBeNull();
    expect(safeScreen(null)).toBeNull();
  });
  it("finds the journey, and only a real one", () => {
    expect(tripFromScreen(`/trips/${ID}/plan`)).toBe(ID);
    expect(tripFromScreen("/trips/new")).toBeNull();
    expect(tripFromScreen(null)).toBeNull();
    expect(isUuid("x")).toBe(false);
  });
  it("gives a code Clarity can be searched for", () => { expect(messageCode(ID)).toBe("RM-ECE938"); });
  it("spots money, sign-in, lost work and privacy; leaves ideas alone", () => {
    ["I was charged twice", "I can’t sign in", "lost my whole plan", "delete my data please", "my day is gone", "paid but it's still locked"].forEach((t) => expect(isUrgent(t), t).toBe(true));
    ["Let my sister suggest restaurants", "Love the map", "a sign in Italian is wrong on the display"].slice(0, 2).forEach((t) => expect(isUrgent(t), t).toBe(false));
  });
  it("limits strangers to 3 an hour and 10 a day, and never cuts off a conversation", () => {
    expect(mayAsk(2, 9, false)).toBe(true);
    expect(mayAsk(3, 3, false)).toBe(false);
    expect(mayAsk(0, 10, false)).toBe(false);
    expect(mayAsk(5, 12, true)).toBe(true);
    expect(mayAsk(20, 20, true)).toBe(false);
    expect(mayAsk(0, 40, true)).toBe(false);
  });
  it("caps alerts, with room kept for urgent ones", () => {
    expect(mayAlert(false, 19)).toBe(true);
    expect(mayAlert(false, 20)).toBe(false);
    expect(mayAlert(true, 24)).toBe(true);
    expect(mayAlert(true, 25)).toBe(false);
  });
  it("reads a picture's kind from its bytes", () => {
    const pad = (a: number[]) => new Uint8Array(a.concat(Array(12).fill(0)));
    expect(pictureType(pad([0xff, 0xd8, 0xff]))).toBe("image/jpeg");
    expect(pictureType(pad([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
    expect(pictureType(new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]))).toBe("image/webp");
    expect(pictureType(pad([60, 115, 118, 103]))).toBeNull();
    expect(pictureType(new Uint8Array(2))).toBeNull();
  });
  it("lists who is waiting first: urgent, then longest; answered last, newest first", () => {
    const c = conversations([
      row("1", "idea-late", false, "2026-11-24T12:00"), row("2", "idea-early", false, "2026-11-24T09:00"),
      row("3", "urgent", false, "2026-11-24T13:00", "I was charged twice"),
      row("5", "done-old", true, "2026-11-20T10:00"), row("4", "done-old", false, "2026-11-20T09:00"),
      row("6", "done-new", false, "2026-11-23T09:00"), row("7", "done-new", true, "2026-11-23T10:00"),
    ]);
    expect(c.map((x) => x.userId)).toEqual(["urgent", "idea-early", "idea-late", "done-new", "done-old"]);
    expect(c[4].rows.map((r) => r.id)).toEqual(["4", "5"]);
  });
  it("keeps each journey's conversation apart, and the one outside any journey", () => {
    const c = conversations([
      { ...row("1", "sam", false, "1"), trip_id: "paris" }, { ...row("2", "sam", true, "2"), trip_id: "paris" },
      { ...row("3", "sam", false, "3"), trip_id: null }, { ...row("4", "sam", false, "4"), trip_id: "rome" },
    ]);
    expect(c.map((x) => [x.tripId, x.waiting, x.rows.length])).toEqual([[null, true, 1], ["rome", true, 1], ["paris", false, 2]]);
    expect(new Set(c.map((x) => x.key)).size).toBe(3);
  });
  it("a journey they can't open has no thread of its own", () => {
    const can = (id: string) => id === "paris";
    expect(threadOf("paris", can)).toBe("paris");
    expect(threadOf("rome", can)).toBeNull();
    expect(threadOf(null, can)).toBeNull();
  });
  it("finds unread replies waiting in other threads, never the one on screen or read ones", () => {
    const can = () => true;
    const rows = [
      { from_admin: true, read_at: null, trip_id: "paris" }, { from_admin: true, read_at: null, trip_id: "paris" },
      { from_admin: true, read_at: "x", trip_id: "rome" }, { from_admin: false, read_at: null, trip_id: "rome" },
      { from_admin: true, read_at: null, trip_id: null },
    ];
    expect(unreadElsewhere(rows, null, can)).toEqual([{ trip: "paris", unread: 2 }]);
    expect(unreadElsewhere(rows, "paris", can)).toEqual([{ trip: null, unread: 1 }]);
  });
  it("is urgent only while unanswered", () => {
    expect(conversations([row("1", "a", false, "1", "refund please"), row("2", "a", true, "2")])[0].urgent).toBe(false);
  });
});
