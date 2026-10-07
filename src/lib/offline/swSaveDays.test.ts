import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import vm from "vm";

// public/sw.js saving every day of an upcoming journey (7 Oct 2026, offline),
// run in a fake service-worker scope with a real in-memory page cache.
const ORIGIN = "https://roam.test";

type Net = (url: string, init?: RequestInit) => Promise<Response>;

function loadSw(net: Net) {
  const listeners: Record<string, (e: unknown) => void> = {};
  const store = new Map<string, Response>();
  const keyOf = (k: unknown) => (typeof k === "string" ? new URL(k, ORIGIN).href : (k as { url: string }).url);
  const cache = {
    match: vi.fn(async (k: unknown) => store.get(keyOf(k))?.clone() ?? undefined),
    put: vi.fn(async (k: unknown, r: Response) => { store.set(keyOf(k), r); }),
    add: vi.fn(async () => undefined),
  };
  const fetchSpy = vi.fn(net);
  const scope = {
    self: { addEventListener: (t: string, f: (e: unknown) => void) => { listeners[t] = f; }, location: { origin: ORIGIN }, skipWaiting: () => undefined, clients: { claim: () => undefined } },
    caches: { match: cache.match, open: vi.fn(async () => cache), keys: async () => [], delete: async () => true },
    fetch: fetchSpy, URL, Response, Promise, setTimeout, console, Set, JSON, Date, String, Array,
  };
  vm.runInNewContext(readFileSync(join(__dirname, "..", "..", "..", "public", "sw.js"), "utf8"), scope);
  const post = async (data: unknown) => {
    let work: Promise<unknown> = Promise.resolve();
    listeners.message({ data, waitUntil: (p: Promise<unknown>) => { work = p; } });
    await work;
  };
  const navigate = (path: string) => new Promise<Response>((resolve) => {
    listeners.fetch({ request: { method: "GET", mode: "navigate", url: `${ORIGIN}${path}`, headers: { get: () => null } }, respondWith: (p: Promise<Response>) => p.then(resolve) });
  });
  return { post, navigate, store, fetchSpy };
}

const msg = (days: { url: string; date: string }[]) => ({ type: "roam:save-days", tripId: "t1", days });
const page = (body: string) => new Response(body, { status: 200, headers: { "Content-Type": "text/html" } });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

describe("the service worker saves every day it is handed", () => {
  it("fetches each day once, with the cookie, and keeps it under its plain URL", async () => {
    const sw = loadSw(async (url) => page(`day ${url}`));
    await sw.post(msg([{ url: "/trips/t1/days/d1", date: "2026-11-01" }, { url: "/trips/t1/days/d2", date: "2026-11-02" }, { url: "/trips/t1/days/d3", date: "2026-11-03" }]));
    expect(sw.fetchSpy).toHaveBeenCalledTimes(3);
    expect(sw.fetchSpy.mock.calls[0][1]).toMatchObject({ credentials: "same-origin" });
    for (const d of ["d1", "d2", "d3"]) expect(sw.store.has(`${ORIGIN}/trips/t1/days/${d}`)).toBe(true);
  });

  it("never more than two at a time", async () => {
    let inFlight = 0, most = 0;
    const sw = loadSw(async () => {
      inFlight++; most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return page("x");
    });
    await sw.post(msg(Array.from({ length: 7 }, (_, i) => ({ url: `/trips/t1/days/d${i}`, date: `2026-11-0${i + 1}` }))));
    expect(sw.fetchSpy).toHaveBeenCalledTimes(7);
    expect(most).toBe(2);
  });

  it("keeps no redirect, no error, no opaque reply", async () => {
    const redirected = page("login");
    Object.defineProperty(redirected, "redirected", { value: true });
    const replies: Record<string, Response> = {
      "/trips/t1/days/r": redirected,
      "/trips/t1/days/e": new Response("oops", { status: 500 }),
      "/trips/t1/days/n": new Response(null, { status: 204 }),
    };
    const sw = loadSw(async (url) => replies[new URL(url).pathname]);
    await sw.post(msg(Object.keys(replies).map((url) => ({ url, date: "2026-11-01" }))));
    expect(Array.from(sw.store.keys()).filter((k) => k.includes("/days/"))).toEqual([]);
  });

  it("ignores anything that is not a day of a journey", async () => {
    const sw = loadSw(async () => page("x"));
    await sw.post(msg([{ url: "https://evil.test/trips/t1/days/d1", date: "2026-11-01" }, { url: "/api/places/photo?x=1", date: "2026-11-01" }]));
    await sw.post({ type: "something-else", tripId: "t1", days: [{ url: "/trips/t1/days/d1", date: "2026-11-01" }] });
    expect(sw.fetchSpy).not.toHaveBeenCalled();
  });

  it("offline, a saved day opens from the cache", async () => {
    let online = true;
    const sw = loadSw(async (url) => { if (!online) throw new TypeError("offline"); return page(`day ${new URL(url).pathname}`); });
    await sw.post(msg([{ url: "/trips/t1/days/d2", date: "2026-11-02" }]));
    online = false;
    expect(await (await sw.navigate("/trips/t1/days/d2")).text()).toBe("day /trips/t1/days/d2");
  });

  it("offline, /trips/{id} (the map's Back) goes to today's saved day", async () => {
    let online = true;
    const sw = loadSw(async () => { if (!online) throw new TypeError("offline"); return page("x"); });
    const t = today();
    await sw.post(msg([{ url: "/trips/t1/days/before", date: "2000-01-01" }, { url: "/trips/t1/days/today", date: t }, { url: "/trips/t1/days/after", date: "2999-01-01" }]));
    online = false;
    const res = await sw.navigate("/trips/t1");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(`${ORIGIN}/trips/t1/days/today`);
  });

  it("offline, /trips/{id} with nothing saved still gets the offline page path (no redirect)", async () => {
    const sw = loadSw(async () => { throw new TypeError("offline"); });
    const res = await sw.navigate("/trips/t9");
    expect(res.status).not.toBe(302);
  });
});
