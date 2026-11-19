/**
 * Editing one card must never rewrite another (19 Nov 2026). A card's name and
 * kind live on its place, and a place can carry several cards: Villa Zambaldi
 * held the check-in, the check-out and a dinner. Retyping the dinner turned the
 * villa into a restaurant and the stay vanished. So, for a place another card
 * uses: a rename stays on the card (details.title + named), and a new kind
 * gives the card its own copy of the place.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Whether any other card uses this place. */
export async function placeShared(supabase: SupabaseClient, placeId: string, cardId: string): Promise<boolean> {
  const { data } = await supabase.from("cards").select("id").eq("place_id", placeId).neq("id", cardId).limit(1);
  return Array.isArray(data) && data.length > 0;
}

/**
 * The fields a copy of a place keeps: where it is and what it looks like. Not
 * its Google id (one per user per listing), so the copy is the card's own.
 */
export function placeCopy(src: Record<string, unknown>, change: Record<string, unknown>): Record<string, unknown> {
  const keep = ["user_id", "title", "type", "sub_type", "lat", "lng", "address", "cover_image_url", "phone", "website", "hours", "rating", "price_level", "details"];
  const out: Record<string, unknown> = {};
  for (const k of keep) if (src[k] !== undefined) out[k] = src[k];
  return { ...out, ...change };
}

/** A copy of the place with `change` applied, for one card; null when it can't be made. */
export async function forkPlace(supabase: SupabaseClient, placeId: string, change: Record<string, unknown>): Promise<Record<string, unknown> & { id: string } | null> {
  const { data: src } = await supabase.from("places").select("*").eq("id", placeId).maybeSingle();
  if (!src) return null;
  const { data: made } = await supabase.from("places").insert(placeCopy(src as Record<string, unknown>, change)).select("*").maybeSingle();
  return (made as (Record<string, unknown> & { id: string }) | null) ?? null;
}

/**
 * A place that holds a booking's cards (check-in and check-out, pick-up and
 * return, docks and all aboard): retyping it from one card would break the
 * others, so that card gets its own copy. Any other place is retyped everywhere.
 */
export function isBookingPlace(subType: string | null | undefined): boolean {
  return subType === "hotel" || subType === "car_rental" || subType === "port";
}
