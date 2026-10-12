"use client";

// ── The phone preview's data layer: fixtures in, nothing out ──────────────
// Dev only (see ./devOnly.ts). The preview renders the REAL components, so
// whatever they ask of Supabase or the network has to be answered here, in
// the browser, before the first effect runs:
//
// - The Supabase browser client is a singleton (@supabase/ssr creates one per
//   page in a browser), so the stub takes that one instance and replaces
//   `from`, `rpc`, `auth`, `storage`, `channel` and `functions` with fakes that
//   resolve to the fixture tables. Writes resolve as successes and are logged.
//   No session, no token: `getSession` hands back a user id only.
// - `window.fetch` answers everything but Next's own dev traffic (chunks, RSC,
//   HMR): `/api/*` gets its fixture (or a 404 when it has none), the how-to video manifest gets
//   `{}`, anything else gets a 503. Nothing leaves the page.
//
// scripts/phone-check.mjs also starts Chrome with every host except
// localhost and Google Fonts resolving to nothing, so a request this misses
// fails instead of reaching a real service.

import { createClient } from "@/lib/supabase/client";

export type Tables = Record<string, unknown[]>;

export interface StubConfig {
  tables: Tables;
  /** The signed-in user's id, or null for nobody. Never a real account. */
  userId: string | null;
  /** Canned answers for same-origin API routes, by pathname. */
  api?: Record<string, unknown>;
  /** Cross-origin hosts this screen may reach for real (the Map: Mapbox tiles). Everything else stays off. */
  passHosts?: RegExp[];
  respond?: (url: URL, init?: RequestInit) => Promise<unknown>;
  onWrite?: (table: string, op: string, payload: unknown, filters: Array<{ column: string; value: unknown }>) => void;
}

export const stubLog: { reads: string[]; writes: Array<{ table: string; op: string; payload?: unknown }>; blocked: string[] } = {
  reads: [],
  writes: [],
  blocked: [],
};

const CHAIN = [
  "select", "eq", "neq", "in", "is", "not", "or", "filter", "match", "order", "limit", "range",
  "gt", "gte", "lt", "lte", "like", "ilike", "contains", "containedBy", "overlaps", "textSearch",
  "abortSignal", "returns", "throwOnError",
];
const WRITES = ["insert", "update", "upsert", "delete"];

function builder(table: string, tables: Tables, onWrite?: StubConfig['onWrite']) {
  let one = false;
  const filters: Array<{ column: string; value: unknown }> = [];
  let wrote: { op: string; payload?: unknown } | null = null;
  let applied = false;
  const b: Record<string, unknown> = {};
  for (const k of CHAIN) b[k] = () => b;
  b.eq = (column: string, value: unknown) => { filters.push({ column, value }); return b; };
  b.in = (column: string, value: unknown[]) => { filters.push({ column, value }); return b; };
  b.is = b.eq;
  for (const op of WRITES) {
    b[op] = (payload?: unknown) => {
      wrote = { op, payload };
      stubLog.writes.push({ table, op, payload });
      if (typeof window !== 'undefined' && table === 'cards' && op === 'update' && payload && typeof payload === 'object' && 'start_time' in payload) {
        window.parent.postMessage({ type: 'roam-training-time', time: (payload as { start_time: unknown }).start_time }, window.location.origin);
      }
      return b;
    };
  }
  b.maybeSingle = () => { one = true; return b; };
  b.single = () => { one = true; return b; };
  b.csv = () => b;
  b.then = (ok?: (v: unknown) => unknown, err?: (e: unknown) => unknown) => {
    // A write answers with what it wrote (for `.insert(x).select().single()`).
    const payload = (wrote as { payload?: unknown } | null)?.payload;
    if (wrote && !applied) { applied = true; onWrite?.(table, wrote.op, payload, filters); }
    if (!wrote) stubLog.reads.push(table);
    const rows: unknown[] = wrote ? (Array.isArray(payload) ? payload : payload ? [payload] : []) : (tables[table] ?? []).filter(row => filters.every(({ column, value }) => Array.isArray(value) ? value.includes((row as Record<string, unknown>)[column]) : (row as Record<string, unknown>)[column] === value));
    const value = one
      ? { data: rows[0] ?? null, error: null, status: 200 }
      : { data: rows, error: null, count: rows.length, status: 200 };
    return Promise.resolve(value).then(ok, err);
  };
  return b;
}

function channel() {
  const c: Record<string, unknown> = {};
  c.on = () => c;
  c.subscribe = () => c;
  c.unsubscribe = () => Promise.resolve("ok");
  c.send = () => Promise.resolve("ok");
  return c;
}

function define(target: object, key: string, value: unknown) {
  Object.defineProperty(target, key, { value, configurable: true, writable: true });
}

/** Same-origin requests that belong to Next itself and must go through. */
function isNextTraffic(u: URL, headers: Headers): boolean {
  if (u.origin !== window.location.origin) return false;
  if (u.pathname.startsWith("/_next/") || u.pathname.startsWith("/__nextjs")) return true;
  // App-router navigations and refreshes (router.refresh, prefetch).
  return headers.has("RSC") || headers.has("Next-Router-State-Tree") || u.searchParams.has("_rsc");
}

let installed = false;
let activeConfig: StubConfig;

export function installStub(config: StubConfig): void {
  if (typeof window === "undefined") return;
  activeConfig = config;
  const { tables, userId, api = {}, passHosts = [] } = config;

  const sb = createClient() as unknown as Record<string, unknown>;
  define(sb, "from", (table: string) => builder(table, tables, config.onWrite));
  define(sb, "rpc", (fn: string) => builder(`rpc:${fn}`, tables));
  define(sb, "channel", () => channel());
  define(sb, "removeChannel", () => Promise.resolve("ok"));
  define(sb, "removeAllChannels", () => Promise.resolve([]));
  define(sb, "storage", {
    from: () => ({
      createSignedUrl: () => Promise.resolve({ data: null, error: null }),
      createSignedUrls: () => Promise.resolve({ data: [], error: null }),
      getPublicUrl: () => ({ data: { publicUrl: "" } }),
      upload: () => Promise.resolve({ data: null, error: { message: "preview: no storage" } }),
      remove: () => Promise.resolve({ data: [], error: null }),
      list: () => Promise.resolve({ data: [], error: null }),
      download: () => Promise.resolve({ data: null, error: { message: "preview: no storage" } }),
    }),
  });
  define(sb, "functions", { invoke: () => Promise.resolve({ data: null, error: null }) });
  const user = userId ? { id: userId, email: null, user_metadata: {}, app_metadata: {} } : null;
  define(sb, "auth", {
    getSession: () => Promise.resolve({ data: { session: user ? { user } : null }, error: null }),
    getUser: () => Promise.resolve({ data: { user }, error: null }),
    getClaims: () => Promise.resolve({ data: user ? { claims: { sub: user.id } } : null, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signOut: () => Promise.resolve({ error: null }),
    refreshSession: () => Promise.resolve({ data: { session: null }, error: null }),
  });

  if (installed) return;
  installed = true;
  const real = window.fetch.bind(window);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(raw, window.location.href);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    // Native screens must not execute real server actions from the sample.
    if (headers.has('Next-Action')) return json({ error: 'This action is unavailable in the sample.' }, 403);
    if (isNextTraffic(u, headers)) return real(input, init);
    if (u.pathname.endsWith("/how-to-videos/videos.json")) return json({});
    if (u.protocol === "https:" && passHosts.some((h) => h.test(u.hostname)) && (!u.hostname.endsWith('.supabase.co') || u.pathname.startsWith('/storage/v1/object/public/place-photos/'))) return real(input, init);
    if (u.origin === window.location.origin && u.pathname.startsWith("/api/")) {
      if (activeConfig.respond) {
        const result = await activeConfig.respond(u, init);
        if (result !== undefined) return json(result);
      }
      // An API route the screen has no fixture for answers as a failed request
      // would, which every caller already handles; a made-up 200 {} does not
      // match any route's real shape.
      return u.pathname in api ? json(api[u.pathname]) : json({ error: "phone preview: no fixture for this route" }, 404);
    }
    stubLog.blocked.push(u.origin + u.pathname);
    return json({ error: "phone preview: network is off" }, 503);
  }) as typeof window.fetch;
  (window as unknown as { __phoneStub: typeof stubLog }).__phoneStub = stubLog;
}
