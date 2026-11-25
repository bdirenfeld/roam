import { describe, it, expect, vi, beforeEach } from "vitest";

/** The routes against a small stand-in database: who may read and write what. */
const ADMIN = "ece938aa-db7b-4436-bb59-442cc0dc5e10";
const SAM = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
type Row = Record<string, unknown>;
const st = vi.hoisted(() => ({ user: null as string | null, tables: {} as Record<string, Record<string, unknown>[]>, fail: "" }));
const alertBrennan = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
vi.mock("@/lib/help/alert", () => ({ alertBrennan }));

function table(name: string) {
  let op = "select", put: Row = {}, head = false, one = false;
  const tests: ((r: Row) => boolean)[] = [];
  const q: Record<string, unknown> = {};
  const rows = () => (st.tables[name] = st.tables[name] ?? []);
  Object.assign(q, {
    select: (_c: string, o?: { head?: boolean }) => { head = !!o?.head; return q; },
    insert: (r: Row) => { op = "insert"; put = r; return q; },
    update: (r: Row) => { op = "update"; put = r; return q; },
    eq: (k: string, v: unknown) => { tests.push((r) => r[k] === v); return q; },
    is: (k: string, v: unknown) => { tests.push((r) => (r[k] ?? null) === v); return q; },
    in: (k: string, vs: unknown[]) => { tests.push((r) => vs.includes(r[k])); return q; },
    gte: (k: string, v: string) => { tests.push((r) => Date.parse(String(r[k])) >= Date.parse(v)); return q; },
    order: () => q, limit: () => q,
    maybeSingle: () => { one = true; return q; },
    then: (done: (v: unknown) => unknown) => {
      if (st.fail === name + ":" + op) return Promise.resolve({ data: null, error: { message: "down" } }).then(done);
      if (op === "insert") {
        if (rows().some((r) => r.id === put.id)) return Promise.resolve({ error: { code: "23505", message: "dup" } }).then(done);
        rows().push({ from_admin: false, alerted: false, read_at: null, created_at: new Date().toISOString(), ...put });
        return Promise.resolve({ error: null }).then(done);
      }
      const hit = rows().filter((r) => tests.every((t) => t(r)));
      if (op === "update") { hit.forEach((r) => Object.assign(r, put)); return Promise.resolve({ error: null }).then(done); }
      return Promise.resolve({ data: one ? hit[0] ?? null : hit, count: head ? hit.length : undefined, error: null }).then(done);
    },
  });
  return q;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: table, storage: { from: () => ({ upload: () => Promise.resolve({ error: null }) }) } }) }));
vi.mock("@/lib/api/guard", () => ({ requireUser: () => Promise.resolve(st.user ? { user: { id: st.user }, supabase: { from: table } } : { response: new Response("{}", { status: 401 }) }) }));

import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import { POST as READ } from "./read/route";
import { POST as REPLY } from "./reply/route";

const ask = (fields: Record<string, string | Blob> = {}) => {
  const f = new FormData();
  Object.entries({ id: ID, body: "The drive is wrong", screen: "/journey/SECRET?x=1", ...fields }).forEach(([k, v]) => f.set(k, v as string));
  return POST(new NextRequest("https://roam.test/api/help", { method: "POST", body: f }));
};
const reply = (j: Row) => REPLY(new NextRequest("https://roam.test/api/help/reply", { method: "POST", body: JSON.stringify(j) }));
const read = (ids?: string[]) => READ(new NextRequest("https://roam.test/api/help/read", { method: "POST", body: ids ? JSON.stringify({ ids }) : undefined }));
const get = async (q = "") => (await GET(new NextRequest("https://roam.test/api/help" + q))).json();
const TRIP = "44444444-4444-4444-8444-444444444444";
const GONE = "55555555-5555-4555-8555-555555555555";
const msgs = () => st.tables.help_messages ?? [];
const uid = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`;

beforeEach(() => { st.user = SAM; st.tables = {}; st.fail = ""; alertBrennan.mockClear(); });

describe("sending", () => {
  it("needs a sign-in and some words", async () => {
    st.user = null;
    expect((await ask()).status).toBe(401);
    st.user = SAM;
    expect((await ask({ body: "   " })).status).toBe(400);
    expect((await ask({ id: "nope" })).status).toBe(400);
    expect(msgs()).toHaveLength(0);
  });
  it("saves it under the sender, never with the share token, and alerts Brennan once", async () => {
    expect((await ask()).status).toBe(200);
    expect(msgs()[0].user_id).toBe(SAM);
    expect((msgs()[0].context as Row).screen).toBe("/journey/[link]");
    expect(msgs()[0].from_admin).toBe(false);
    expect(alertBrennan).toHaveBeenCalledTimes(1);
    expect(msgs()[0].alerted).toBe(true);
    // the same one again: yes, and nothing new
    expect((await ask()).status).toBe(200);
    expect(msgs()).toHaveLength(1);
  });
  it("stops the fourth in an hour, and refuses when it cannot count", async () => {
    for (let i = 0; i < 3; i++) expect((await ask({ id: uid(i) })).status).toBe(200);
    expect((await ask({ id: uid(9) })).status).toBe(429);
    st.fail = "help_messages:select"; st.tables = {};
    expect((await ask({ id: uid(8) })).status).toBe(503);
    expect(msgs()).toHaveLength(0);
  });
  it("never overwrites or reads back someone else's message by its id", async () => {
    st.tables.help_messages = [{ id: ID, user_id: ADMIN, body: "theirs", created_at: new Date().toISOString(), from_admin: false }];
    expect((await ask()).status).toBe(503);
    expect(msgs()[0].body).toBe("theirs");
  });
  it("turns away a picture that isn't one", async () => {
    expect((await ask({ picture: new Blob(["<svg onload=x>............"], { type: "image/png" }) })).status).toBe(400);
    expect(msgs()).toHaveLength(0);
  });
  it("a failed alert still keeps the message", async () => {
    alertBrennan.mockResolvedValueOnce(false);
    expect((await ask()).status).toBe(200);
    expect(msgs()[0].alerted).toBe(false);
  });
});

describe("reading", () => {
  beforeEach(() => {
    const at = new Date().toISOString();
    st.tables.help_messages = [
      { id: "a", user_id: SAM, body: "mine", from_admin: false, read_at: null, created_at: at },
      { id: "b", user_id: SAM, body: "answer", from_admin: true, read_at: null, created_at: at },
      { id: "c", user_id: ADMIN, body: "someone else", from_admin: true, read_at: null, created_at: at },
    ];
  });
  it("only ever your own", async () => {
    const j = await (await GET(new NextRequest("https://roam.test/api/help"))).json();
    expect(j.messages.map((m: Row) => m.body).sort()).toEqual(["answer", "mine"]);
  });
  it("counts and clears only your unread replies", async () => {
    const n = async () => (await (await GET(new NextRequest("https://roam.test/api/help?unread=1"))).json()).unread;
    expect(await n()).toBe(1);
    await read();
    expect(await n()).toBe(0);
    expect(msgs()[2].read_at).toBeNull();
  });
});

describe("a thread per journey", () => {
  const A = uid(1), B = uid(2), C = uid(3), D = uid(4);
  beforeEach(() => {
    const at = (n: number) => new Date(Date.now() - 100000 + n).toISOString();
    // The stand-in's trips table is what this person's own session can open.
    st.tables.trips = [{ id: TRIP, user_id: SAM, title: "Paris" }];
    st.tables.help_messages = [
      { id: A, user_id: SAM, body: "about Paris", from_admin: false, read_at: null, created_at: at(1), trip_id: TRIP },
      { id: B, user_id: SAM, body: "Paris answer", from_admin: true, read_at: null, created_at: at(2), trip_id: TRIP },
      { id: C, user_id: SAM, body: "general", from_admin: false, read_at: null, created_at: at(3), trip_id: null },
      { id: D, user_id: SAM, body: "left that journey", from_admin: false, read_at: null, created_at: at(4), trip_id: GONE },
    ];
  });
  it("a journey's Help shows that journey's messages and nothing else", async () => {
    const j = await get("?trip=" + TRIP);
    expect(j.messages.map((m: Row) => m.body).sort()).toEqual(["Paris answer", "about Paris"]);
    expect(j.elsewhere).toEqual([]);
  });
  it("outside a journey: the general ones, plus any from a journey they can no longer open", async () => {
    const j = await get();
    expect(j.messages.map((m: Row) => m.body).sort()).toEqual(["general", "left that journey"]);
    // the Paris reply is waiting, and says where
    expect(j.elsewhere).toEqual([{ trip: TRIP, unread: 1, title: "Paris" }]);
  });
  it("asking for a journey you can't open gives the general thread, never theirs", async () => {
    st.tables.help_messages.push({ id: uid(5), user_id: ADMIN, body: "not yours", from_admin: false, read_at: null, created_at: new Date().toISOString(), trip_id: GONE });
    const j = await get("?trip=" + GONE);
    expect(j.thread).toBeNull();
    expect(j.messages.map((m: Row) => m.body).sort()).toEqual(["general", "left that journey"]);
  });
  it("reading one thread leaves a reply in another unread", async () => {
    st.tables.help_messages.push({ id: uid(6), user_id: SAM, body: "general answer", from_admin: true, read_at: null, created_at: new Date().toISOString(), trip_id: null });
    await read([uid(6)]);
    expect((await get("?unread=1")).unread).toBe(1);
    expect(msgs().find((m) => m.id === B)!.read_at).toBeNull();
    await read([B]);
    expect((await get("?unread=1")).unread).toBe(0);
  });
  it("a new message lands in the thread on screen; a journey that isn't theirs lands in general", async () => {
    await ask({ id: uid(7), trip: TRIP, screen: "/trips" });
    expect(msgs().find((m) => m.id === uid(7))!.trip_id).toBe(TRIP);
    await ask({ id: uid(8), trip: GONE });
    expect(msgs().find((m) => m.id === uid(8))!.trip_id).toBeNull();
    await ask({ id: uid(9), trip: "" , screen: `/trips/${TRIP}/plan` });
    expect(msgs().find((m) => m.id === uid(9))!.trip_id).toBeNull();
  });
  it("an older page that sends no thread still files by the screen it was on", async () => {
    await ask({ id: uid(7), screen: `/trips/${TRIP}/plan` });
    expect(msgs().find((m) => m.id === uid(7))!.trip_id).toBe(TRIP);
  });
  it("Brennan answers into one thread, and only where they wrote", async () => {
    st.user = ADMIN;
    expect((await reply({ id: uid(7), userId: SAM, tripId: uid(99), body: "hi" })).status).toBe(404);
    expect((await reply({ id: uid(7), userId: SAM, tripId: "nope", body: "hi" })).status).toBe(400);
    expect((await reply({ id: uid(7), userId: SAM, tripId: TRIP, body: "hi" })).status).toBe(200);
    expect(msgs().find((m) => m.id === uid(7))!.trip_id).toBe(TRIP);
    expect((await reply({ id: uid(8), userId: SAM, tripId: null, body: "hi" })).status).toBe(200);
    expect(msgs().find((m) => m.id === uid(8))!.trip_id).toBeNull();
  });
  it("counts the threads waiting on Brennan, for Brennan only", async () => {
    expect((await GET(new NextRequest("https://roam.test/api/help?waiting=1"))).status).toBe(404);
    st.user = ADMIN;
    // Paris is answered; general and the left journey are each waiting
    expect((await get("?waiting=1")).waiting).toBe(2);
  });
});

describe("answering", () => {
  it("is Brennan's alone", async () => {
    st.tables.help_messages = [{ id: "a", user_id: SAM, from_admin: false }];
    expect((await reply({ id: uid(1), userId: SAM, body: "hi" })).status).toBe(404);
    expect(msgs()).toHaveLength(1);
  });
  it("reaches someone who wrote, once; nobody else", async () => {
    st.user = ADMIN;
    expect((await reply({ id: uid(1), userId: SAM, body: "hi" })).status).toBe(404);
    st.tables.help_messages = [{ id: "a", user_id: SAM, from_admin: false }];
    expect((await reply({ id: uid(1), userId: SAM, body: "hi" })).status).toBe(200);
    expect((await reply({ id: uid(1), userId: SAM, body: "hi" })).status).toBe(200);
    expect(msgs().filter((m) => m.from_admin)).toHaveLength(1);
  });
});
