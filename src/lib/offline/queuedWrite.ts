"use client";

// ── The wrapper the app calls instead of a raw Supabase write ──────────────
//
// SHAPE: a thin `queuedUpdate(table, match, payload)` helper, NOT a proxy
// around the browser client. Justification:
//
//  - A proxy would have to guess. Every write in this app would suddenly be
//    "queueable", including the ones that genuinely cannot work offline —
//    creating a place needs a live Google Places lookup, sharing a journey
//    needs an email to leave the device. Queueing those would promise
//    something the app cannot keep, which is worse than failing loudly.
//  - The four mutations that matter on the ground are all `update` on `cards`
//    matched by `id`. That is a four-line surface. A proxy is a lot of
//    machinery to cover four call sites, and it hides which ones they are.
//  - Reverting is easy: the helper returns the same `{ error }` shape the call
//    sites already branch on, plus a `queued` flag.
//
// Everything not routed through here keeps its old behaviour and still fails
// offline, deliberately.

import { createClient } from "@/lib/supabase/client";
import {
  drain,
  enqueue,
  hasPending,
  isTransportFailure,
  type Executor,
  type QueuedWrite,
} from "./writeQueue";

/** A hung request on plane wifi is indistinguishable from offline until it
 *  gives up, and supabase-js sets no default timeout. Eight seconds turns a
 *  hang into a queued write. */
const REQUEST_TIMEOUT_MS = 8000;

function timeoutSignal(): AbortSignal | undefined {
  const AS = (globalThis as { AbortSignal?: typeof AbortSignal }).AbortSignal as
    | (typeof AbortSignal & { timeout?: (ms: number) => AbortSignal })
    | undefined;
  if (AS && typeof AS.timeout === "function") return AS.timeout(REQUEST_TIMEOUT_MS);
  return undefined;
}

export interface QueuedWriteResult {
  /** The change is durably queued and will replay. Do NOT roll back the UI. */
  queued: boolean;
  /** A genuine refusal. Roll back exactly as before. */
  error: { message: string } | null;
}

async function runUpdate(
  table: string,
  match: Record<string, string>,
  payload: Record<string, unknown>,
): Promise<{ error: unknown }> {
  const supabase = createClient();
  const signal = timeoutSignal();
  const query = supabase.from(table).update(payload).match(match);
  const { error } = await (signal ? query.abortSignal(signal) : query);
  return { error };
}

/**
 * Update a row, falling back to the offline queue when the write cannot reach
 * the server.
 *
 * Three outcomes:
 *   { queued: false, error: null }  — written, nothing to do
 *   { queued: true,  error: null }  — saved locally, will sync; keep the UI
 *   { queued: false, error }        — refused; roll back and tell the user
 */
export async function queuedUpdate(
  table: string,
  match: Record<string, string>,
  payload: Record<string, unknown>,
): Promise<QueuedWriteResult> {
  // Anything already queued for this row must stay in front of this write, or
  // replaying the older entry would clobber the newer one.
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (offline || hasPending(table, match)) {
    enqueue(table, "update", match, payload);
    return { queued: true, error: null };
  }

  try {
    const { error } = await runUpdate(table, match, payload);
    if (!error) return { queued: false, error: null };
    if (isTransportFailure(error)) {
      enqueue(table, "update", match, payload);
      return { queued: true, error: null };
    }
    const message = (error as { message?: string }).message ?? "Write refused";
    return { queued: false, error: { message } };
  } catch (err) {
    if (isTransportFailure(err)) {
      enqueue(table, "update", match, payload);
      return { queued: true, error: null };
    }
    return {
      queued: false,
      error: { message: err instanceof Error ? err.message : String(err) },
    };
  }
}

// ── Replay ─────────────────────────────────────────────────────────────────

const executor: Executor = async (entry: QueuedWrite) => {
  const supabase = createClient();
  const signal = timeoutSignal();
  try {
    let error: unknown = null;
    if (entry.operation === "update") {
      const q = supabase.from(entry.table).update(entry.payload).match(entry.match);
      ({ error } = await (signal ? q.abortSignal(signal) : q));
    } else if (entry.operation === "insert") {
      const q = supabase.from(entry.table).insert(entry.payload);
      ({ error } = await (signal ? q.abortSignal(signal) : q));
    } else {
      const q = supabase.from(entry.table).delete().match(entry.match);
      ({ error } = await (signal ? q.abortSignal(signal) : q));
    }
    if (!error) return { ok: true };
    if (isTransportFailure(error)) {
      return { ok: false, permanent: false, message: String((error as { message?: string }).message ?? error) };
    }
    return {
      ok: false,
      permanent: true,
      message: (error as { message?: string }).message ?? "Rejected by the server",
    };
  } catch (err) {
    if (isTransportFailure(err)) {
      return { ok: false, permanent: false, message: err instanceof Error ? err.message : String(err) };
    }
    return { ok: false, permanent: true, message: err instanceof Error ? err.message : String(err) };
  }
};

/** Replay whatever is queued. Safe to call at any time — re-entrant calls are
 *  ignored inside `drain`. */
export function flushQueue(): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve();
  return drain(executor);
}

/**
 * Wire the two moments that actually correlate with "the signal is back": the
 * browser's `online` event, and the app coming back into focus. The focus
 * check matters most — an iOS PWA resumed from the background often has
 * working connectivity without ever firing `online`.
 */
export function startAutoSync(): () => void {
  if (typeof window === "undefined") return () => {};

  const onOnline = () => void flushQueue();
  const onVisible = () => {
    if (document.visibilityState === "visible") void flushQueue();
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  // One attempt at mount clears anything left over from the last session.
  void flushQueue();

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
