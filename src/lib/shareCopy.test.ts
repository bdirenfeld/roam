import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { revokeWarning, revokeToast, inviteLines, shortRange } from "./shareCopy";

describe("the invite email", () => {
  it("names the trip and its dates, and says no account is needed", () => {
    const c = inviteLines("Brennan Direnfeld", "Costa Rica", "2026-03-04", "2026-03-12");
    expect(c.subject).toBe("Brennan Direnfeld shared the plan for Costa Rica");
    expect(c.lead).toBe("Here’s the plan for Costa Rica, Mar 4–12.");
    expect(c.how).toMatch(/no account needed/);
    // It said "sign in to see the plan — the days, the map": no sign-in is needed.
    expect(Object.values(c).join(" ")).not.toMatch(/sign in|map/i);
  });
  it("spans months, and copes with no dates", () => {
    expect(shortRange("2027-04-30", "2027-05-03")).toBe("Apr 30 – May 3");
    expect(inviteLines("B", "Japan").lead).toBe("Here’s the plan for Japan.");
  });
});

describe("revoke copy says what really happens", () => {
  it("with nobody joined, the link just stops", () => {
    expect(revokeWarning(0)).toBe("The link stops working.");
    expect(revokeToast(0)).toBe("Link turned off.");
  });

  it("never claims people who joined lose access", () => {
    for (const n of [1, 3]) {
      expect(revokeWarning(n)).not.toMatch(/everyone|nobody|loses access/i);
      expect(revokeToast(n)).not.toMatch(/nobody can/i);
    }
    // New York is shared with 3 people — the real case.
    expect(revokeWarning(3)).toBe("New people can't use the link. The 3 people who joined keep access.");
    expect(revokeWarning(1)).toBe("New people can't use the link. The 1 person who joined keeps access.");
    expect(revokeToast(1)).toBe("Link turned off. The 1 person who joined still has it — remove them below.");
  });
});

// The invite log was empty for four days because its upsert named a conflict
// target (trip_id, email) that no unique index matches — the only one is on
// lower(email). Postgres refuses that with 42P10 and the route never read the
// error. Proven on the live DB 23 Sep 2026.
describe("the invite log can actually be written", () => {
  const route = readFileSync(
    path.resolve(__dirname, "../app/api/share/send-invite/route.ts"),
    "utf8",
  );
  it("does not upsert on a conflict target the table has no index for", () => {
    expect(route).not.toMatch(/onConflict:\s*"trip_id,email"/);
  });
  it("reads the write's error instead of discarding it", () => {
    const fn = route.slice(route.indexOf("async function recordInvite"));
    expect(fn).toMatch(/if \(error\) throw error/);
  });
});

describe("Settings keeps the guest list after a revoke", () => {
  const src = readFileSync(
    path.resolve(__dirname, "../components/trip/TripSettingsClient.tsx"),
    "utf8",
  );
  const revoke = src.slice(src.indexOf("const revokeLink"), src.indexOf("const dropGuest"));

  it("does not empty the guests when the link is revoked", () => {
    expect(revoke).not.toMatch(/setGuests\(\[\]\)/);
  });

  it("shows who joined even when there is no link", () => {
    expect(src).toMatch(/\(sharePath \|\| guests\.length > 0\)/);
  });
});
