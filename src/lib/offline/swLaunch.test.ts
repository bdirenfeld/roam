import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import vm from "vm";

// public/sw.js run in a fake service-worker scope (3 Oct 2026, launch speed):
// opening the app on Journeys must not wait on a slow server when a copy is cached.
function loadSw(net: (req: unknown) => Promise<Response>, cached: Response | null) {
  const listeners: Record<string, (e: unknown) => void> = {};
  const cache = { match: vi.fn(async () => cached), put: vi.fn(), add: vi.fn() };
  const scope = {
    self: { addEventListener: (t: string, f: (e: unknown) => void) => { listeners[t] = f; }, location: { origin: "https://roam.test" }, skipWaiting: () => undefined, clients: { claim: () => undefined } },
    caches: { match: vi.fn(async () => cached), open: vi.fn(async () => cache), keys: async () => [], delete: async () => true },
    fetch: net, URL, Response, Promise, setTimeout, console,
  };
  vm.runInNewContext(readFileSync(join(__dirname, "..", "..", "..", "public", "sw.js"), "utf8"), scope);
  return (path: string) => new Promise<Response>((resolve) => {
    listeners.fetch({ request: { method: "GET", mode: "navigate", url: `https://roam.test${path}`, headers: { get: () => null } }, respondWith: (p: Promise<Response>) => p.then(resolve) });
  });
}

describe("the service worker opens Journeys without waiting on a cold server", () => {
  it("answers from the cached copy when the network is slow", async () => {
    const slow = () => new Promise<Response>((r) => setTimeout(() => r(new Response("fresh")), 5000));
    const open = loadSw(slow, new Response("cached"));
    const t0 = Date.now();
    const res = await open("/trips");
    expect(await res.text()).toBe("cached");
    expect(Date.now() - t0).toBeLessThan(3000);
  }, 10000);

  it("the installed app opens straight on Journeys, no redirect from /", () => {
    const m = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "public", "manifest.json"), "utf8"));
    expect(m.start_url).toBe("/trips");
  });

  it("answers from the network when it's quick", async () => {
    const open = loadSw(async () => new Response("fresh"), new Response("cached"));
    expect(await (await open("/trips")).text()).toBe("fresh");
  });

  it("other pages stay network-first: a day never shows a stale copy just because the server is slow", async () => {
    const slow = () => new Promise<Response>((r) => setTimeout(() => r(new Response("fresh")), 1800));
    const open = loadSw(slow, new Response("cached"));
    expect(await (await open("/trips/t1/days/d1")).text()).toBe("fresh");
  }, 10000);
});
