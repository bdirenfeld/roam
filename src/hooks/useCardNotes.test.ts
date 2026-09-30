// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCardNotes, requestNotes, withNotes, _resetAsked } from "./useCardNotes";

const card = (id: string, o: Record<string, unknown> = {}) => ({ id, status: "in_itinerary", day_id: "d1", place_id: "p1", created_at: "2026-09-30T10:00:00Z", details: {}, ...o });
const calls: { cardIds: string[] }[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { cardIds: string[] };
    calls.push(body);
    return { ok: true, json: async () => ({ notes: Object.fromEntries(body.cardIds.map((id) => [id, "**Intent**\nWritten."])) }) };
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); calls.length = 0; _resetAsked(); });

describe("useCardNotes", () => {
  it("asks once for new cards on a day, and every screen showing them gets the notes", async () => {
    const week = vi.fn(), day = vi.fn();
    const cards = [card("a"), card("b"), card("old", { created_at: "2026-09-01T00:00:00Z" })];
    renderHook(() => useCardNotes("t1", cards, true, week));
    renderHook(() => useCardNotes("t1", cards, true, day));
    await act(async () => { vi.advanceTimersByTime(1600); await Promise.resolve(); });
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(calls).toHaveLength(1);                 // two screens, one request
    expect(calls[0].cardIds.sort()).toEqual(["a", "b"]);
    expect(week).toHaveBeenCalledWith({ a: "**Intent**\nWritten.", b: "**Intent**\nWritten." });
    expect(day).toHaveBeenCalledWith({ a: "**Intent**\nWritten.", b: "**Intent**\nWritten." });
  });

  it("never for a guest", async () => {
    renderHook(() => useCardNotes("t1", [card("a")], false, vi.fn()));
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(calls).toHaveLength(0);
  });

  it("Plan my trip's request counts: the screens do not ask again", async () => {
    await act(async () => { await requestNotes("t1", ["a"]); });
    renderHook(() => useCardNotes("t1", [card("a")], true, vi.fn()));
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(calls).toHaveLength(1);
  });
});

describe("withNotes", () => {
  it("puts the note in the card's details and leaves the rest", () => {
    expect(withNotes({ id: "a", details: { plan: { day: "d1" } } }, { a: "N" })).toEqual({ id: "a", details: { plan: { day: "d1" }, notes: "N" } });
    expect(withNotes({ id: "z", details: {} }, { a: "N" })).toEqual({ id: "z", details: {} });
  });
});

import { warmNotes } from "./useCardNotes";
describe("notes at once when a place is dropped", () => {
  it("asks straight away, not a second and a half later", async () => {
    renderHook(() => useCardNotes("t9", [card("now")], true, vi.fn()));
    await act(async () => { vi.advanceTimersByTime(1); await Promise.resolve(); });
    expect(calls.map((c) => c.cardIds)).toEqual([["now"]]);
  });
  it("writes the saved places' notes ahead, into the cache only, once per journey", () => {
    warmNotes("japan", ["s1", "s2"]);
    warmNotes("japan", ["s1", "s2"]);
    warmNotes("empty", []);
    expect(calls).toEqual([{ tripId: "japan", cardIds: ["s1", "s2"], warm: true }]);
  });
});
