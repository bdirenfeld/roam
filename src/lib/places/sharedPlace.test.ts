import { describe, it, expect } from "vitest";
import { placeCopy } from "./sharedPlace";

describe("a card's own copy of a shared place (19 Nov 2026)", () => {
  it("keeps where it is and how it looks, takes the new kind, and drops the Google id and the row's own id", () => {
    const villa = { id: "v", user_id: "u", google_place_id: "ChIJ", title: "Villa Zambaldi", type: "logistics", sub_type: "hotel", lat: 43.83, lng: 10.45, address: "Via Fonda, 403, Lucca", created_at: "x" };
    expect(placeCopy(villa, { type: "food", sub_type: "restaurant" })).toEqual({
      user_id: "u", title: "Villa Zambaldi", type: "food", sub_type: "restaurant", lat: 43.83, lng: 10.45, address: "Via Fonda, 403, Lucca",
    });
  });
});

import { placeShared } from "./sharedPlace";
import type { SupabaseClient } from "@supabase/supabase-js";

/** A stand-in client: the cards query answers with `rows`, and records what it was asked. */
function fake(rows: unknown[]) {
  const asked: string[] = [];
  const chain: Record<string, unknown> = {};
  for (const k of ["from", "select", "eq", "neq", "limit"]) chain[k] = (...a: unknown[]) => { asked.push(`${k}:${a.join(",")}`); return chain; };
  chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows }).then(ok);
  return { client: chain as unknown as SupabaseClient, asked };
}

describe("placeShared (19 Nov 2026)", () => {
  it("the villa with a check-out card too is shared; a place only this card uses is not", async () => {
    const shared = fake([{ id: "checkout" }]);
    expect(await placeShared(shared.client, "villa", "dinner")).toBe(true);
    expect(shared.asked).toEqual(["from:cards", "select:id", "eq:place_id,villa", "neq:id,dinner", "limit:1"]);
    expect(await placeShared(fake([]).client, "villa", "dinner")).toBe(false);
  });
});
