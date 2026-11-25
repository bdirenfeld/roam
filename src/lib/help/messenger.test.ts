import { describe, it, expect, vi, beforeEach } from "vitest";

const fb = vi.hoisted(() => ({ boot: vi.fn(), show: vi.fn(), unread: null as ((n: number) => void) | null, fail: false }));
vi.mock("featurebase-js", () => ({
  default: (s: unknown) => { if (fb.fail) throw new Error("blocked"); fb.boot(s); },
  whenReady: (f: () => void) => f(),
  onUnreadCountChange: (f: (n: number) => void) => { fb.unread = f; },
  show: () => fb.show(),
}));

import { FEATUREBASE_APP_ID, __resetMessenger, messengerReady, openMessenger, startMessenger } from "./messenger";
import { getHelpUnread, setHelpUnread } from "./unread";

beforeEach(() => { __resetMessenger(); fb.boot.mockClear(); fb.show.mockClear(); fb.fail = false; fb.unread = null; setHelpUnread(0); });

describe("the messenger", () => {
  it("is not there until it has started: Help falls back to Roam's own chat", () => {
    expect(messengerReady()).toBe(false);
    expect(openMessenger()).toBe(false);
    expect(fb.show).not.toHaveBeenCalled();
  });
  it("starts once as the signed-in person, with no floating button, and opens on demand", async () => {
    expect(await startMessenger("jwt-1")).toBe(true);
    expect(await startMessenger("jwt-1")).toBe(true);
    expect(fb.boot).toHaveBeenCalledTimes(1);
    expect(fb.boot).toHaveBeenCalledWith({ appId: FEATUREBASE_APP_ID, featurebaseJwt: "jwt-1", hideDefaultLauncher: true });
    expect(openMessenger()).toBe(true);
    expect(fb.show).toHaveBeenCalledTimes(1);
  });
  it("lights Roam's own dot when a reply is waiting", async () => {
    await startMessenger("jwt-1");
    fb.unread!(2);
    expect(getHelpUnread()).toBe(2);
  });
  it("a messenger that won't load leaves Help on Roam's own chat", async () => {
    fb.fail = true;
    expect(await startMessenger("jwt-1")).toBe(false);
    expect(messengerReady()).toBe(false);
  });
});
