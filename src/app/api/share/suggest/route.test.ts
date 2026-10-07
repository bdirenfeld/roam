import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * /api/share/suggest for a place shared from Google Maps (7 Oct 2026): the
 * place comes back as the suggestion row with no Claude call — the name is
 * already in the share, or in the link once it is followed.
 */

const underQuota = vi.fn(async () => true);
vi.mock("@/lib/api/guard", () => ({
  requireUser: async () => ({ supabase: {}, user: { id: "u1" } }),
  underQuota: (...a: unknown[]) => underQuota(...(a as [])),
  quotaExceeded: () => new Response(JSON.stringify({ error: "quota" }), { status: 429 }),
  QUOTA: { shareSuggest: 60 },
}));
const anthropic = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({ default: vi.fn(() => ({ messages: { create: anthropic } })) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => null }));
vi.mock("@/lib/api/spend", () => ({ overBudget: async () => false, addSpend: async () => 0 }));

import { GET } from "./route";

const FULL = "https://www.google.com/maps/place/BABAE/@43.7676,11.2453,17z/data=!3d43.7688!4d11.2474";
const BABAE = { place_id: "g-babae", name: "BABAE", formatted_address: "Via Santo Spirito, 21r, 50125 Firenze FI, Italy" };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  process.env.GOOGLE_PLACES_API_KEY = "gk";
  fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith("https://maps.app.goo.gl/")) {
      return { status: 302, headers: new Headers({ location: FULL }), body: { cancel: async () => {} } };
    }
    if (url.startsWith("https://maps.googleapis.com/maps/api/place/findplacefromtext/json")) {
      return { ok: true, json: async () => ({ candidates: [BABAE] }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const call = (q: Record<string, string>) =>
  GET(new NextRequest(`http://localhost/api/share/suggest?${new URLSearchParams(q)}`));
const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));

describe("/api/share/suggest — Google Maps", () => {
  it("finds the place from the name and address in the share, without following the link", async () => {
    const res = await call({ url: "https://maps.app.goo.gl/AbC", text: "BABAE\nVia Santo Spirito, 21r, Firenze" });
    expect(await res.json()).toEqual({
      suggestion: { placeId: "g-babae", name: "BABAE", address: BABAE.formatted_address },
    });
    const find = new URL(urls().find((u) => u.includes("findplacefromtext"))!);
    expect(find.searchParams.get("input")).toBe("BABAE, Via Santo Spirito, 21r, Firenze");
    expect(urls().some((u) => u.startsWith("https://maps.app.goo.gl/"))).toBe(false);
    expect(anthropic).not.toHaveBeenCalled();
    expect(underQuota).toHaveBeenCalledWith({}, "shareSuggest", 60);
  });

  it("a bare short link: follows it, reads the name, and biases Find Place to its pin", async () => {
    const res = await call({ url: "https://maps.app.goo.gl/AbC" });
    expect((await res.json()).suggestion.name).toBe("BABAE");
    const hop = fetchMock.mock.calls.find((c) => String(c[0]).startsWith("https://maps.app.goo.gl/"));
    expect(hop?.[1]?.redirect).toBe("manual");
    const find = new URL(urls().find((u) => u.includes("findplacefromtext"))!);
    expect(find.searchParams.get("input")).toBe("BABAE");
    expect(find.searchParams.get("locationbias")).toBe("point:43.7688,11.2474");
    expect(anthropic).not.toHaveBeenCalled();
  });

  it("no suggestion when Google answers the short link with its consent page", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("https://maps.app.goo.gl/")) {
        return { status: 302, headers: new Headers({ location: "https://consent.google.com/m?continue=x" }), body: null };
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const res = await call({ url: "https://maps.app.goo.gl/AbC" });
    expect(await res.json()).toEqual({ suggestion: null });
  });

  it("counts against the same daily allowance", async () => {
    underQuota.mockResolvedValueOnce(false);
    const res = await call({ url: "https://maps.app.goo.gl/AbC", text: "BABAE" });
    expect(res.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still ignores links that are neither TikTok nor Maps", async () => {
    const res = await call({ url: "https://www.instagram.com/reel/abc/" });
    expect(await res.json()).toEqual({ suggestion: null });
    expect(underQuota).not.toHaveBeenCalled();
  });
});
