"use client";

// Brennan's side of Help. Waiting people first; pick one, read, answer.
import { useState } from "react";

export interface InboxRow { id: string; mine: boolean; body: string; at: string; read: boolean; picture: string | null; context: Record<string, unknown> }
export interface InboxItem { userId: string; who: string; email: string | null; waiting: boolean; urgent: boolean; rows: InboxRow[] }

const INK = "#1A1A2E";
const when = (iso: string) => new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const device = (ua: unknown) => (typeof ua !== "string" ? null : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /iPad/.test(ua) ? "iPad" : "Computer");

function facts(c: Record<string, unknown>): string[] {
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  return [s(c.screen)?.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "…") ?? null, device(c.device), s(c.role), c.paid ? "paid" : "free", s(c.version), c.error_id ? "an error was logged" : null, s(c.code)].filter((v): v is string => !!v);
}

export default function FeedbackInbox({ items: initial }: { items: InboxItem[] }) {
  const [items, setItems] = useState(initial);
  const [sel, setSel] = useState<string | null>(initial[0]?.userId ?? null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [ids, setIds] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const it = items.find((i) => i.userId === sel);
  if (!it) return <p className="p-7 text-[15px]">No messages yet.</p>;
  const text = drafts[it.userId] ?? "";
  const tripId = [...it.rows].reverse().map((r) => r.context.trip_id).find((t) => typeof t === "string") as string | undefined;

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setFailed(null);
    // The same id until it lands: a retry can't answer twice.
    const id = ids[it.userId] ?? crypto.randomUUID();
    setIds((m) => ({ ...m, [it.userId]: id }));
    const res = await fetch("/api/help/reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, userId: it.userId, body }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setFailed("Couldn't send that. Your words are kept."); return; }
    setItems((l) => l.map((x) => (x.userId === it.userId ? { ...x, waiting: false, urgent: false, rows: [...x.rows, { id, mine: true, body, at: new Date().toISOString(), read: false, picture: null, context: {} }] } : x)));
    setDrafts((d) => ({ ...d, [it.userId]: "" }));
    setIds((m) => { const n = { ...m }; delete n[it.userId]; return n; });
  };

  return (
    <div className="max-w-[1180px] mx-auto md:grid md:grid-cols-[300px_minmax(0,1fr)]" style={{ color: INK }}>
      <nav aria-label="Conversations" className="border-b md:border-b-0 md:border-r border-gray-200 max-h-[34vh] md:max-h-none overflow-y-auto">
        {items.map((i) => (
          <button key={i.userId} type="button" onClick={() => { setSel(i.userId); setFailed(null); }} aria-current={i.userId === sel} className="w-full text-left px-5 py-3 border-b border-gray-100" style={{ background: i.userId === sel ? "#F3F4F6" : undefined }}>
            <span className="text-[15px] font-semibold">{i.who}</span>
            {i.waiting && <span className="ml-2 text-[12px] font-semibold" style={{ color: i.urgent ? "#B0541F" : INK }}>{i.urgent ? "Urgent" : "Waiting"}</span>}
            <span className="block text-[13px] truncate text-gray-600">{i.rows[i.rows.length - 1].body}</span>
          </button>
        ))}
      </nav>
      <section aria-label={it.who} className="p-5 md:p-7 min-w-0">
        <h1 className="text-[20px] font-medium">{it.who}</h1>
        <p className="text-[13px] text-gray-600 [overflow-wrap:anywhere]">
          {it.email}
          {tripId && <> · <a className="underline underline-offset-4" href={`/admin/view/${tripId}`}>Open their journey</a></>}
        </p>
        <div className="flex flex-col gap-3 my-5">
          {it.rows.map((r) => (
            <div key={r.id} className={`max-w-[82%] ${r.mine ? "self-end" : "self-start"}`}>
              <div className="rounded-2xl px-4 py-2.5 text-[15px] whitespace-pre-wrap [overflow-wrap:anywhere]" style={r.mine ? { background: INK, color: "#fff" } : { background: "#F3F4F6" }}>{r.body}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {r.picture && <a href={r.picture} target="_blank" rel="noopener noreferrer"><img src={r.picture} alt="What they sent" className="mt-2 max-h-[260px] rounded-xl border border-gray-200" /></a>}
              <p suppressHydrationWarning className="mt-1 text-[12px] text-gray-600 [overflow-wrap:anywhere]">{[when(r.at), ...(r.mine ? [r.read ? "read" : "not read yet"] : facts(r.context))].join(" · ")}</p>
            </div>
          ))}
        </div>
        <textarea value={text} onChange={(e) => setDrafts((d) => ({ ...d, [it.userId]: e.target.value }))} rows={4} maxLength={2000} aria-label={`Reply to ${it.who}`} placeholder="Reply as Brennan" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-[16px]" />
        {failed && <p className="text-[14px] mt-1" style={{ color: "#B0541F" }}>{failed}</p>}
        <div className="flex justify-end mt-2">
          <button type="button" onClick={() => void send()} disabled={busy || !text.trim()} className="min-h-[44px] px-6 rounded-xl text-[15px] font-semibold text-white disabled:opacity-40" style={{ background: INK }}>{busy ? "Sending…" : "Send"}</button>
        </div>
      </section>
    </div>
  );
}
