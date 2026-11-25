import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fb = vi.hoisted(() => ({ boot: vi.fn(), messages: vi.fn(), fresh: vi.fn(), unread: null as ((n: number) => void) | null, ready: true, fail: false }));
vi.mock("featurebase-js", () => ({
  default: (s: unknown) => { if (fb.fail) throw new Error("blocked"); fb.boot(s); },
  whenReady: (f: () => void) => { if (fb.ready) f(); },
  onUnreadCountChange: (f: (n: number) => void) => { fb.unread = f; },
  showMessages: () => fb.messages(),
  showNewMessage: () => fb.fresh(),
}));

import { FEATUREBASE_APP_ID, __resetMessenger, initMessenger, messengerStatus, openMessenger } from "./messenger";
import { getHelpUnread, setHelpUnread } from "./unread";

let jwt: string | null;
let release: (() => void) | null;
beforeEach(() => {
  __resetMessenger(); fb.boot.mockClear(); fb.messages.mockClear(); fb.fresh.mockClear(); fb.fail = false; fb.ready = true; fb.unread = null; setHelpUnread(0);
  jwt = "jwt-1"; release = null;
  vi.stubGlobal("fetch", vi.fn(() => new Promise((done) => {
    const answer = () => done({ ok: true, redirected: false, json: () => Promise.resolve({ jwt }) });
    if (release === null) answer(); else release = answer;
  })));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("the messenger", () => {
  it("starts once as the signed-in person, with no floating button", async () => {
    expect(await initMessenger()).toBe(true);
    expect(await initMessenger()).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fb.boot).toHaveBeenCalledTimes(1);
    expect(fb.boot).toHaveBeenCalledWith({ appId: FEATUREBASE_APP_ID, featurebaseJwt: "jwt-1", hideDefaultLauncher: true });
    expect(messengerStatus()).toBe("ready");
  });
  it("a door lands on the list of past conversations, or on a new question", async () => {
    expect(await openMessenger()).toBe(true);
    expect(fb.messages).toHaveBeenCalledTimes(1);
    expect(await openMessenger("new")).toBe(true);
    expect(fb.fresh).toHaveBeenCalledTimes(1);
  });
  it("a door opened before it has started WAITS for it, and never falls through to the other chat", async () => {
    release = () => {};
    let landed: boolean | null = null;
    const door = openMessenger().then((ok) => { landed = ok; });
    await new Promise((r) => setTimeout(r, 20));
    expect(landed).toBeNull();
    expect(messengerStatus()).toBe("unknown");
    release!();
    await door;
    expect(landed).toBe(true);
    expect(fb.messages).toHaveBeenCalledTimes(1);
  });
  it("no identity (the secret is unset, or signed out): Roam's own chat", async () => {
    jwt = null;
    expect(await openMessenger()).toBe(false);
    expect(messengerStatus()).toBe("off");
    expect(fb.boot).not.toHaveBeenCalled();
  });
  it("blocked by an ad blocker (it boots but never comes up): Roam's own chat, after the wait", async () => {
    fb.ready = false;
    expect(await initMessenger(30)).toBe(false);
    expect(messengerStatus()).toBe("off");
    expect(await openMessenger()).toBe(false);
    expect(fb.messages).not.toHaveBeenCalled();
  });
  it("a messenger that throws leaves Help on Roam's own chat", async () => {
    fb.fail = true;
    expect(await initMessenger()).toBe(false);
    expect(messengerStatus()).toBe("off");
  });
  it("lights Roam's own dot when a reply is waiting", async () => {
    await initMessenger();
    fb.unread!(2);
    expect(getHelpUnread()).toBe(2);
  });
});
