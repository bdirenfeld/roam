import { describe, it, expect, vi } from "vitest";
import { claimInvites, landingAfterSignIn } from "./claim";

function admin(invites: { trip_id: string; created_at: string }[]) {
  const upserts: unknown[] = []; const updates: unknown[] = [];
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    q.select = () => q; q.eq = () => q; q.is = () => q;
    q.order = async () => ({ data: table === "trip_invites" ? invites : [] });
    q.upsert = async (row: unknown) => { upserts.push(row); return { error: null }; };
    q.update = (row: unknown) => { updates.push(row); return q; };
    return q;
  };
  return { client: { from: vi.fn(chain) } as never, upserts, updates };
}

describe("claiming invites at sign-in (7 Oct 2026, Isha)", () => {
  it("an emailed invite becomes a membership whatever way they signed in, and they land on that trip", async () => {
    const a = admin([{ trip_id: "voss", created_at: "2026-10-07" }]);
    const trip = await claimInvites(a.client, "isha", "ISeth01@gmail.com ");
    expect(trip).toBe("voss");
    expect(a.upserts).toEqual([{ trip_id: "voss", user_id: "isha", role: "guest" }]);
    expect(a.updates).toHaveLength(1);
    expect(landingAfterSignIn("/trips", trip)).toBe("/trips/voss");
  });
  it("no invite: nothing written, Journeys as before; a real destination always wins", async () => {
    const a = admin([]);
    expect(await claimInvites(a.client, "u", "x@y.com")).toBeNull();
    expect(a.upserts).toHaveLength(0);
    expect(landingAfterSignIn(undefined, null)).toBe("/trips");
    expect(landingAfterSignIn("/journey/abc", "voss")).toBe("/journey/abc");
    expect(landingAfterSignIn("//evil.com", null)).toBe("/trips");
  });
});
