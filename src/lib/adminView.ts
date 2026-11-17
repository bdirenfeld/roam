/**
 * The admin view (17 Nov 2026, beta): Brennan opens a tester's journey read
 * only, to help when they hit a problem. /admin/view/<id> sets a cookie; both
 * Supabase clients copy it into the x-roam-admin-trip header; the database
 * (migration 017) opens that one journey to the admin account only, for
 * reading. Nothing here grants a write.
 */
import { HOUSEHOLD_OWNER_ID } from "@/lib/household";

export const ADMIN_COOKIE = "roam_admin_trip";
export const ADMIN_HEADER = "x-roam-admin-trip";
/** Must match the id in supabase/migrations/017_admin_view.sql (adminView.test.ts checks). */
export const ADMIN_USER_IDS: readonly string[] = [HOUSEHOLD_OWNER_ID];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const isAdmin = (userId: string | null | undefined): boolean => !!userId && ADMIN_USER_IDS.includes(userId);

/** A journey id, or null for anything that is not one. */
export const cleanTripId = (v: string | null | undefined): string | null => (v && UUID.test(v) ? v : null);

/** The journey being viewed, from a `document.cookie`-style string. */
export function adminTripFromCookies(cookie: string): string | null {
  const m = cookie.split(/;\s*/).find((p) => p.startsWith(ADMIN_COOKIE + "="));
  return cleanTripId(m ? decodeURIComponent(m.slice(ADMIN_COOKIE.length + 1)) : null);
}

/** The extra header for a Supabase client: only while a journey is being viewed. */
export const adminHeaders = (tripId: string | null): Record<string, string> => (tripId ? { [ADMIN_HEADER]: tripId } : {});
