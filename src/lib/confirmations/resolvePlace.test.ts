import { describe, it, expect, vi, afterEach } from "vitest";
import type { ParsedConfirmation } from "./toCards";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "pv", title: "Villa Zambaldi", sub_type: "hotel" } }) }) }) }) }),
}));
import { resolvePlace } from "./resolvePlace";

const villa = { type: "hotel", title: "Villa Zambaldi", address: "Via Fonda 403, Lucca" } as ParsedConfirmation;
afterEach(() => vi.unstubAllGlobals());

describe("the real place behind a booking", () => {
  it("looks it up, saves it as a hotel, and hands back the place", async () => {
    const asked: { url: string; body?: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }) => {
      asked.push({ url, body: init?.body });
      return { json: async () => (url.includes("autocomplete") ? { predictions: [{ place_id: "gV" }] } : { imported: [{ place_id: "pv" }] }) };
    }));
    expect((await resolvePlace(villa))?.id).toBe("pv");
    expect(JSON.parse(asked[1].body!)).toEqual({ google_place_ids: ["gV"], defaults: { type: "logistics", sub_type: "hotel" } });
  });
  it("a miss on Google, or a failed request, leaves the card a note", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ predictions: [] }) })));
    expect(await resolvePlace(villa)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await resolvePlace(villa)).toBeNull();
    expect(await resolvePlace({ ...villa, title: "", address: null })).toBeNull();
  });
});
