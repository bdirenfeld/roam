import { describe, it, expect, vi } from "vitest";
import { getHelpUnread, setHelpUnread, subscribeHelpUnread, useHelpUnread, openHelp, HELP_EVENT, openHelpSheet, HELP_SHEET_EVENT } from "./unread";
describe("unread replies", () => {
  it("tells every door once per change, and stops when a door goes", () => {
    const a = vi.fn(), b = vi.fn();
    const offA = subscribeHelpUnread(a); subscribeHelpUnread(b);
    setHelpUnread(2); setHelpUnread(2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(getHelpUnread()).toBe(2);
    offA(); setHelpUnread(0);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    expect(typeof useHelpUnread).toBe("function");
  });
  it("opens Help by an event", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    openHelp();
    expect(dispatchEvent.mock.calls[0][0].type).toBe(HELP_EVENT);
    vi.unstubAllGlobals();
  });
  it("the way back to the Help sheet is its own signal, not the messenger's", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    openHelpSheet();
    expect(dispatchEvent.mock.calls.map((c) => c[0].type)).toEqual([HELP_SHEET_EVENT]);
    expect(HELP_SHEET_EVENT).not.toBe(HELP_EVENT);
    vi.unstubAllGlobals();
  });
});
