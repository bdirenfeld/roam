import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ADMIN_USER_IDS, adminTripFromCookies, adminHeaders, isAdmin, cleanTripId } from "./adminView";

const ID = "78470857-e623-4077-aa2b-1489dd8fa8de";

describe("admin view", () => {
  it("reads the viewed journey from the cookie, and nothing that isn't a journey id", () => {
    expect(adminTripFromCookies(`a=1; roam_admin_trip=${ID}; b=2`)).toBe(ID);
    expect(adminTripFromCookies("a=1")).toBeNull();
    expect(adminTripFromCookies("roam_admin_trip=' or 1=1")).toBeNull();
    expect(cleanTripId("nope")).toBeNull();
  });
  it("sends the header only while viewing", () => {
    expect(adminHeaders(ID)).toEqual({ "x-roam-admin-trip": ID });
    expect(adminHeaders(null)).toEqual({});
  });
  it("only the listed account is admin, and the database names the same one", () => {
    expect(isAdmin(ADMIN_USER_IDS[0])).toBe(true);
    expect(isAdmin("someone-else")).toBe(false);
    expect(isAdmin(null)).toBe(false);
    const sql = readFileSync("supabase/migrations/017_admin_view.sql", "utf8");
    for (const id of ADMIN_USER_IDS) expect(sql).toContain(id);
    // 017 reads only; every write lives in 019, and 019 opens the plan, nothing else.
    expect(sql).not.toMatch(/for (insert|update|delete|all)/i);
    const edit = readFileSync("supabase/migrations/019_admin_edit.sql", "utf8").split("\n").filter((l) => !l.startsWith("--")).join("\n");
    const tables = Array.from(edit.matchAll(/on public\.(\w+) for (insert|update|delete)/g), (m) => m[1]);
    expect(Array.from(new Set(tables)).sort()).toEqual(["cards", "days", "places", "trip_entry", "trips"]);
    expect(edit).not.toMatch(/for all|trip_budgets|documents|card_attachments|trip_members|trip_invites/i);
    // Every admin_edit policy is scoped to the viewed journey.
    for (const line of edit.split("\n").filter((l) => l.startsWith("create policy admin_edit"))) expect(line).toMatch(/admin_view_(trip_id|place_ids)\(\)/);
  });
  it("both Supabase clients send the header", () => {
    for (const f of ["src/lib/supabase/client.ts", "src/lib/supabase/server.ts"]) expect(readFileSync(f, "utf8"), f).toMatch(/adminHeaders\(/);
  });
});
