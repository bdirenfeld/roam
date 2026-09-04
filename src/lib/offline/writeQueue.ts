// ── Offline write queue ───────────────────────────────────────────────────
//
// Reads already survive a dead connection (public/sw.js caches pages and RSC
// payloads). Writes did not: every mutation went straight to Supabase from the
// browser, so on a plane a ticked checkbox looked saved, then vanished on the
// next reload. This module is the missing half — a durable, ordered log of
// mutations that could not reach the server, replayed when the signal comes
// back.
//
// WHY localStorage AND NOT IndexedDB
// ----------------------------------
// The brief allowed either, with an argument. localStorage wins here on two
// counts, one of them decisive:
//
//  1. VOLUME. An entry is a Supabase row patch: a table name, an `{ id }`
//     match, and a handful of columns — `{ confirmed: true }` is ~120 bytes;
//     the fattest realistic payload is a whole `details.checklist` array,
//     call it 2 KB for a 40-item packing list. Entries also COALESCE (see
//     `enqueue`): repeated edits to the same row collapse into one entry, so
//     the queue is bounded by *rows touched offline*, not by taps. A day's
//     agenda is ~15 cards. Even a fortnight offline, editing every card on
//     every day of a long trip, is low hundreds of KB against a 5 MB budget.
//     IndexedDB's headroom buys nothing this workload can spend.
//
//  2. SYNCHRONOUS READ IS THE FEATURE, NOT THE FLAW. Requirement: a change
//     made offline must still be there after a reload. Reads come from the
//     service-worker page cache, which holds the SERVER's version of the row,
//     so the queue has to be laid back over that cached data on read. With
//     localStorage the overlay is available inside a `useState` initialiser —
//     the first paint is already correct. IndexedDB is async, so the same
//     screen would paint the stale server value and then flip, which is the
//     exact "it reverted!" flicker this work exists to remove. Writes are a
//     couple of KB at human tap frequency, so the main-thread cost of a
//     synchronous `setItem` is noise.
//
// A cap (MAX_ENTRIES) keeps a pathological case from filling the quota.
//
// SCOPE. This module is storage + ordering + overlay only. It never imports
// Supabase; the caller supplies an executor (see ./queuedWrite). That keeps it
// unit-testable in plain Node.

export type QueueOperation = "update" | "insert" | "delete";

export interface QueuedWrite {
  /** Queue entry id — not the row id. */
  id: string;
  table: string;
  operation: QueueOperation;
  /** Row match criteria, normally `{ id: <row id> }`. */
  match: Record<string, string>;
  payload: Record<string, unknown>;
  /** First enqueue. Survives coalescing, so FIFO order is stable. */
  createdAt: number;
  /** Last time a coalesced edit merged into this entry. */
  updatedAt: number;
}

export interface QueueFailure {
  id: string;
  table: string;
  operation: QueueOperation;
  match: Record<string, string>;
  payload: Record<string, unknown>;
  /** What the server said. */
  message: string;
  at: number;
}

export interface QueueState {
  pending: QueuedWrite[];
  failures: QueueFailure[];
  /** A drain is in progress. */
  syncing: boolean;
}

const PENDING_KEY = "roam.offline.pending.v1";
const FAILURE_KEY = "roam.offline.failures.v1";
const MAX_ENTRIES = 500;
const MAX_FAILURES = 20;

// ── Storage ────────────────────────────────────────────────────────────────
// Resolved lazily on every call rather than captured at module load, so this
// file is safe to import during SSR (no window) and so a test can install a
// fake `globalThis.localStorage` after importing.

function store(): Storage | null {
  try {
    const s = (globalThis as { localStorage?: Storage }).localStorage;
    return s ?? null;
  } catch {
    // Safari private mode throws on access rather than returning undefined.
    return null;
  }
}

function readList<T>(key: string): T[] {
  const s = store();
  if (!s) return [];
  try {
    const raw = s.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, value: T[]): void {
  const s = store();
  if (!s) return;
  try {
    s.setItem(key, JSON.stringify(value));
  } catch (err) {
    // Quota or private mode. Nothing useful to do but say so — the caller's
    // optimistic UI is already showing the change, and the indicator will not
    // claim it is queued, because it isn't.
    console.error("[Roam] Offline queue write failed:", err);
  }
}

// ── Listeners ──────────────────────────────────────────────────────────────

type Listener = (state: QueueState) => void;
const listeners = new Set<Listener>();

/** Entry ids currently being sent. Deliberately in memory only: an entry left
 *  marked in-flight by a crash or reload must be free to send again. */
const inFlight = new Set<string>();

let syncing = false;

export function getPending(): QueuedWrite[] {
  return readList<QueuedWrite>(PENDING_KEY);
}

export function getFailures(): QueueFailure[] {
  return readList<QueueFailure>(FAILURE_KEY);
}

export function getState(): QueueState {
  return { pending: getPending(), failures: getFailures(), syncing };
}

function notify(): void {
  const state = getState();
  listeners.forEach((l) => {
    try {
      l(state);
    } catch (err) {
      console.error("[Roam] Offline queue listener failed:", err);
    }
  });
}

/** Subscribe to queue changes. Also picks up writes made in another tab. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") {
    window.addEventListener("storage", onStorageEvent);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorageEvent);
    }
  };
}

function onStorageEvent(e: StorageEvent) {
  if (e.key === PENDING_KEY || e.key === FAILURE_KEY) notify();
}

// ── Keys and coalescing ────────────────────────────────────────────────────

/** Stable identity for "the row this entry touches". */
export function rowKey(table: string, match: Record<string, string>): string {
  const parts = Object.keys(match)
    .sort()
    .map((k) => `${k}=${match[k]}`);
  return `${table}|${parts.join("&")}`;
}

function newId(): string {
  // crypto.randomUUID is not in every target (older iOS Safari); the fallback
  // only has to be unique within one device's queue.
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Append a mutation to the queue.
 *
 * Consecutive `update`s to the same row COALESCE into the entry already
 * queued for it: these payloads are absolute column values, not deltas, so
 * merging them is exactly equivalent to replaying them in order — and it
 * keeps the queue one entry per row rather than one per tap. An entry that is
 * currently being sent is never merged into (the send would drop the merge on
 * success), so a mid-flight edit appends a fresh entry behind it.
 */
export function enqueue(
  table: string,
  operation: QueueOperation,
  match: Record<string, string>,
  payload: Record<string, unknown>,
): QueuedWrite {
  const pending = getPending();
  const key = rowKey(table, match);
  const now = Date.now();

  if (operation === "update") {
    for (let i = pending.length - 1; i >= 0; i--) {
      const e = pending[i];
      if (rowKey(e.table, e.match) !== key) continue;
      // Only the LAST entry for this row is a merge candidate — anything
      // earlier has a later write sitting on top of it.
      if (e.operation === "update" && !inFlight.has(e.id)) {
        const merged: QueuedWrite = {
          ...e,
          payload: { ...e.payload, ...payload },
          updatedAt: now,
        };
        pending[i] = merged;
        writeList(PENDING_KEY, pending);
        notify();
        return merged;
      }
      break;
    }
  }

  const entry: QueuedWrite = {
    id: newId(),
    table,
    operation,
    match,
    payload,
    createdAt: now,
    updatedAt: now,
  };
  const next = [...pending, entry];
  // Oldest-first eviction. Reaching this means something is badly wrong
  // (hundreds of distinct rows edited with no connectivity for days); losing
  // the oldest beats losing the ability to queue at all.
  const trimmed = next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
  writeList(PENDING_KEY, trimmed);
  notify();
  return entry;
}

/** Is anything already queued for this row? If so the caller must queue too,
 *  or a direct write would be clobbered when the older entry replays. */
export function hasPending(table: string, match: Record<string, string>): boolean {
  const key = rowKey(table, match);
  return getPending().some((e) => rowKey(e.table, e.match) === key);
}

/** Is there a queued INSERT for this row — a row the server has never seen? */
export function hasPendingInsert(table: string, match: Record<string, string>): boolean {
  const key = rowKey(table, match);
  return getPending().some((e) => e.operation === "insert" && rowKey(e.table, e.match) === key);
}

/**
 * Drop every queued entry for a row. A delete queued behind a queued insert
 * cancels it — nothing needs to reach the server. Entries mid-flight are left
 * alone. Returns how many were dropped.
 */
export function removePending(table: string, match: Record<string, string>): number {
  const key = rowKey(table, match);
  const pending = getPending();
  const kept = pending.filter((e) => rowKey(e.table, e.match) !== key || inFlight.has(e.id));
  if (kept.length === pending.length) return 0;
  writeList(PENDING_KEY, kept);
  notify();
  return pending.length - kept.length;
}

// ── Overlay ────────────────────────────────────────────────────────────────
// The other half of the crux. Cached reads return the SERVER's row; these
// helpers lay the queued column values back over it, so a reload while offline
// shows what the user actually did. Applying an overlay twice is a no-op — the
// payloads are absolute values, not increments — which is what makes it safe
// to apply at several read points without bookkeeping.

/** Merged pending column values for one row, or null if nothing is queued. */
export function overlayFor(
  table: string,
  match: Record<string, string>,
): Record<string, unknown> | null {
  const key = rowKey(table, match);
  let merged: Record<string, unknown> | null = null;
  for (const e of getPending()) {
    if (e.operation !== "update") continue;
    if (rowKey(e.table, e.match) !== key) continue;
    merged = { ...(merged ?? {}), ...e.payload };
  }
  return merged;
}

/** Row with any queued edits laid over it. Returns the same object when the
 *  queue has nothing for it, so React identity checks stay cheap. */
export function applyOverlay<T extends { id: string }>(table: string, row: T): T {
  const overlay = overlayFor(table, { id: row.id });
  return overlay ? ({ ...row, ...overlay } as T) : row;
}

/** applyOverlay across a list. Returns the same array when nothing is queued. */
export function applyOverlayAll<T extends { id: string }>(table: string, rows: T[]): T[] {
  if (getPending().length === 0) return rows;
  let changed = false;
  const next = rows.map((r) => {
    const merged = applyOverlay(table, r);
    if (merged !== r) changed = true;
    return merged;
  });
  return changed ? next : rows;
}

// ── Failures ───────────────────────────────────────────────────────────────

function recordFailure(entry: QueuedWrite, message: string): void {
  const failures = getFailures();
  const next = [
    ...failures,
    {
      id: entry.id,
      table: entry.table,
      operation: entry.operation,
      match: entry.match,
      payload: entry.payload,
      message,
      at: Date.now(),
    },
  ];
  writeList(FAILURE_KEY, next.slice(-MAX_FAILURES));
}

/** The user has read the failure notice. */
export function dismissFailures(): void {
  writeList(FAILURE_KEY, []);
  notify();
}

function removeEntry(id: string): void {
  const pending = getPending();
  const next = pending.filter((e) => e.id !== id);
  if (next.length !== pending.length) writeList(PENDING_KEY, next);
}

// ── Drain ──────────────────────────────────────────────────────────────────

export type ExecuteResult =
  | { ok: true }
  /** A real server refusal (4xx that is not a transport failure). The entry is
   *  dropped and surfaced — retrying forever would never succeed. */
  | { ok: false; permanent: true; message: string }
  /** Still no usable connection. Everything stays queued, in order. */
  | { ok: false; permanent: false; message: string };

export type Executor = (entry: QueuedWrite) => Promise<ExecuteResult>;

/**
 * Transport failure (queue and retry) or server refusal (drop and surface)?
 *
 * This is the policy that decides whether a write is worth keeping, so it
 * lives here with the queue rather than at the call site. supabase-js reports
 * a dead network as an error OBJECT rather than a throw, so both shapes have
 * to be sniffed. A PostgREST refusal always carries an HTTP status or a
 * SQLSTATE-ish code; a fetch that never reached a server carries neither.
 */
export function isTransportFailure(err: unknown): boolean {
  if (!err) return false;
  const e = err as { message?: string; name?: string; status?: number; code?: string };
  if (typeof e.status === "number" && e.status >= 400 && e.status < 600) return false;
  const text = `${e.name ?? ""} ${e.message ?? ""}`.toLowerCase();
  if (
    text.includes("failed to fetch") ||
    text.includes("networkerror") ||
    text.includes("network request failed") ||
    text.includes("load failed") ||
    text.includes("fetch failed") ||
    text.includes("aborted") ||
    text.includes("aborterror") ||
    text.includes("timeout") ||
    text.includes("timed out")
  ) {
    return true;
  }
  // supabase-js sets code to "" on a transport failure; a real refusal always
  // has one ("23505", "42501", "PGRST116", …).
  if (e.code === "") return true;
  return e.code === undefined && e.status === undefined && !e.message;
}

/**
 * Replay the queue FIFO. Stops at the first transport failure so ordering is
 * never broken by skipping ahead. Re-reads the queue each pass, so an edit
 * made while a drain is running is picked up rather than lost.
 *
 * Re-entrant calls are ignored — `online` and `visibilitychange` both fire on
 * a phone coming out of a pocket in wifi range, and a double drain is how you
 * get double-applied writes.
 */
export async function drain(execute: Executor): Promise<void> {
  if (syncing) return;
  const first = getPending();
  if (first.length === 0) return;

  syncing = true;
  notify();
  try {
    // Bounded by the queue length seen at entry plus a margin, so a
    // pathological enqueue-during-drain loop cannot spin forever.
    let guard = first.length + MAX_ENTRIES;
    while (guard-- > 0) {
      const pending = getPending();
      const entry = pending.find((e) => !inFlight.has(e.id));
      if (!entry) break;

      inFlight.add(entry.id);
      let result: ExecuteResult;
      try {
        result = await execute(entry);
      } catch (err) {
        result = {
          ok: false,
          permanent: false,
          message: err instanceof Error ? err.message : String(err),
        };
      } finally {
        inFlight.delete(entry.id);
      }

      if (result.ok) {
        removeEntry(entry.id);
        notify();
        continue;
      }
      if (result.permanent) {
        removeEntry(entry.id);
        recordFailure(entry, result.message);
        notify();
        continue;
      }
      // Transport failure — still offline. Leave the queue exactly as it is.
      break;
    }
  } finally {
    syncing = false;
    notify();
  }
}

/** Test seam. Not used by the app. */
export function __resetQueue(): void {
  inFlight.clear();
  syncing = false;
  writeList(PENDING_KEY, []);
  writeList(FAILURE_KEY, []);
}
