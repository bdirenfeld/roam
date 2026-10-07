/**
 * "Did you book it?" (7 Oct 2026, delight audit, mock approved).
 *
 * When a Bookings row opens Kayak in a new tab, Roam remembers the row. When
 * the person comes back to Roam's tab, each remembered row that is still ○
 * asks "Did you book it?" in place of its line: Booked / Not yet. Only rows
 * that opened an EXTERNAL tab are remembered — Stays opening Roam's own Where
 * to stay is an in-app move, not a tab, so it never asks.
 *
 * The memory is per journey, in sessionStorage so a reload of Roam's tab keeps
 * it. Storage can be missing or throw (private mode, blocked site data): every
 * read and write here is wrapped, and the feature then simply lives in
 * component state for the page's life.
 */

import { ROW_KEYS, type CheckRow, type RowKey } from "./checklist";

/** Only what is used of Storage, so a test can hand in a plain object. */
export type KeyStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const openedKey = (tripId: string) => `roam:bookings-opened:${tripId}`;

/** window.sessionStorage, or null when it is absent or its accessor throws. */
export function sessionStore(): KeyStore | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** The rows remembered for this journey; anything unreadable is nothing. */
export function readOpened(store: KeyStore | null, tripId: string): RowKey[] {
  if (!store) return [];
  try {
    const raw = store.getItem(openedKey(tripId));
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? ROW_KEYS.filter((k) => v.includes(k)) : [];
  } catch {
    return [];
  }
}

/** Saves the remembered rows; an empty list removes the entry. Never throws. */
export function writeOpened(store: KeyStore | null, tripId: string, keys: RowKey[]): void {
  if (!store) return;
  try {
    if (keys.length) store.setItem(openedKey(tripId), JSON.stringify(keys));
    else store.removeItem(openedKey(tripId));
  } catch {
    /* storage full or blocked: the component state still has it */
  }
}

/** Adds rows (no duplicates, in row order). */
export function withOpened(keys: RowKey[], more: RowKey[]): RowKey[] {
  return ROW_KEYS.filter((k) => keys.includes(k) || more.includes(k));
}

/** Takes one row off (it was answered). */
export function withoutOpened(keys: RowKey[], key: RowKey): RowKey[] {
  return keys.filter((k) => k !== key);
}

/**
 * Which rows ask right now: remembered, back on Roam's tab, and still to book.
 * A row booked or marked not needed meanwhile never asks.
 */
export function asking(rows: CheckRow[], asked: RowKey[]): Set<RowKey> {
  return new Set(rows.filter((r) => r.state === "open" && asked.includes(r.key)).map((r) => r.key));
}
