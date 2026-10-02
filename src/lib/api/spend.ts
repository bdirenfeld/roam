/**
 * Claude spending, counted and capped (1 Oct 2026). One morning of Find cost
 * Brennan $20: every category searched for two trips, three times over, each
 * search Claude reading web pages. Brennan: "this isn't sustainable".
 *
 * Every call to Claude in the app (1 Oct 2026: every route, not only Find and
 * notes — bookings, entry checks, prices, share and the assistant ran uncapped)
 * adds what it cost (from the usage Anthropic
 * returns) to a running total for the day, kept in find_cache under
 * "spend|YYYY-MM-DD". Over DAILY_CAP_CENTS, those features pause until
 * tomorrow (UTC); Google's half of Find keeps working.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** The whole app's Claude budget for a day, in cents. */
export const DAILY_CAP_CENTS = 300;

// Cents per million tokens, by the model that answered (Anthropic's list
// prices, Sep 2026); web search per search.
const PRICES: { match: RegExp; inM: number; outM: number; readM: number }[] = [
  { match: /haiku/, inM: 100, outM: 500, readM: 10 },
  { match: /opus/, inM: 500, outM: 2500, readM: 50 },
  { match: /sonnet/, inM: 300, outM: 1500, readM: 30 },
];
const SEARCH_CENTS = 1;
const priceOf = (model?: string | null) => PRICES.find((p) => p.match.test(model ?? "")) ?? PRICES[2];

export interface Usage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}

/** What one call cost, in cents. */
export function costCents(u: Usage | null | undefined, model?: string | null): number {
  if (!u) return 0;
  const p = priceOf(model);
  const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  return (input * p.inM + (u.output_tokens ?? 0) * p.outM + (u.cache_read_input_tokens ?? 0) * p.readM) / 1_000_000
    + (u.server_tool_use?.web_search_requests ?? 0) * SEARCH_CENTS;
}

export function spendKey(now: Date = new Date()): string {
  return `spend|${now.toISOString().slice(0, 10)}`;
}

/** Cents spent today across the app (0 when it cannot be read: fail open, but logged). */
export async function spentToday(admin: SupabaseClient | null): Promise<number> {
  if (!admin) return 0;
  const { data, error } = await admin.from("find_cache").select("results").eq("key", spendKey()).maybeSingle();
  if (error) { console.error("[spend] read", error.message); return 0; }
  return Number((data?.results as { cents?: number } | null)?.cents ?? 0);
}

export async function overBudget(admin: SupabaseClient | null): Promise<boolean> {
  return (await spentToday(admin)) >= DAILY_CAP_CENTS;
}

/** Add a call's cost to today's total, and log it. */
export async function addSpend(admin: SupabaseClient | null, what: string, usage: Usage | null | undefined, model?: string | null): Promise<number> {
  const cents = costCents(usage, model);
  console.log(`[spend] ${what} ${model ?? ""}: ${cents.toFixed(1)}¢ (in ${usage?.input_tokens ?? 0}, out ${usage?.output_tokens ?? 0}, searches ${usage?.server_tool_use?.web_search_requests ?? 0})`);
  if (!admin || cents <= 0) return cents;
  const before = await spentToday(admin);
  const { error } = await admin.from("find_cache").upsert({ key: spendKey(), results: { cents: Math.round((before + cents) * 10) / 10 }, created_at: new Date().toISOString() });
  if (error) console.error("[spend] write", error.message);
  return cents;
}
