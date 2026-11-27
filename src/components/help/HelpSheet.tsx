"use client";

// ── Help: one box, Brennan's replies, walkthroughs and videos (24 Nov 2026) ─
// Opens from the journey menu's Help tile, the avatar menu, Profile, and the
// crash page. One conversation per JOURNEY, and one outside any journey (his
// ruling after trying it: a note about Paris showed in every journey's Help).
// No categories, no statuses. A reply waiting in another thread is a row at
// the top that opens that thread here.
// Same white sheet as VideosSheet. Someone signed out (the demo) gets the two
// rows and no box.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSheetDrag } from "@/hooks/useSheetDrag";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useHowToVideos } from "@/hooks/useHowToVideos";
import { useToast } from "@/components/ui/Toast";
import { useJourneyGuidance } from "@/components/onboarding/JourneyGuidanceContext";
import VideosSheet from "@/components/videos/VideosSheet";
import { listed, deviceOf } from "@/lib/videos/howTo";
import { MAX_BODY, messageCode, safeScreen, tripFromScreen } from "@/lib/help/message";
import { setHelpUnread } from "@/lib/help/unread";
import { shrinkPicture } from "@/lib/help/picture";
import { initMessenger, openMessenger, useMessengerStatus } from "@/lib/help/messenger";
import HelpDot from "./HelpDot";

const INK = "#1A1A2E";
const RULE = "rgba(26,26,46,0.10)";
const DRAFT = "roam:help-draft";
/** The page they were on, when Help opened somewhere else (the crash page). */
export const HELP_FROM = "roam:help-from";

interface Msg { id: string; mine: boolean; body: string; picture: boolean }
interface Elsewhere { trip: string | null; title: string | null; unread: number }
const draftKey = (trip: string | null) => (trip ? `${DRAFT}:${trip}` : DRAFT);
function kept(key: string): string { try { return sessionStorage.getItem(key) ?? ""; } catch { return ""; } }
function keep(key: string, v: string) { try { if (v) sessionStorage.setItem(key, v); else sessionStorage.removeItem(key); } catch { /* private mode */ } }

export default function HelpSheet({ onClose, guest = false }: { onClose: () => void; guest?: boolean }) {
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed" | "signed-out">("loading");
  const [text, setText] = useState("");
  const [picture, setPicture] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [videos, setVideos] = useState(false);
  // The thread this screen belongs to, and the one being read (a reply row can open another).
  const own = useMemo(() => (typeof window === "undefined" ? null : tripFromScreen(safeScreen(kept(HELP_FROM) || window.location.pathname))), []);
  const [at, setAt] = useState<{ trip: string | null; title: string | null }>({ trip: own, title: null });
  const [elsewhere, setElsewhere] = useState<Elsewhere[]>([]);
  const sendingId = useRef<string | null>(null);
  const thread = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const guidance = useJourneyGuidance();
  const { available } = useHowToVideos();
  const drag = useSheetDrag(onClose, undefined, { mobileOnly: true });
  useEscapeKey(onClose, !videos);
  // "ready": writing happens in the messenger, and this sheet is its two doors plus the rows.
  // "unknown": still finding out, so neither chat shows yet. "off": Roam's own chat below.
  const messenger = useMessengerStatus();
  // Usually already answered by HelpHost; asking again is free and covers a sheet opened without it.
  useEffect(() => { void initMessenger(); }, []);
  const hasVideos = listed(available, typeof navigator === "undefined" ? "computer" : deviceOf(navigator.userAgent)).length > 0;

  const load = useCallback(async () => {
    if (messenger !== "off") { setState("ready"); return; }
    setState("loading");
    const res = await fetch(at.trip ? `/api/help?trip=${at.trip}` : "/api/help").catch(() => null);
    // Middleware sends a signed-out request to the sign-in page (a 307), so it arrives as a redirect.
    if (res?.status === 401 || res?.redirected) { setState("signed-out"); return; }
    const j = res?.ok ? ((await res.json().catch(() => null)) as { messages?: Msg[]; elsewhere?: Elsewhere[] } | null) : null;
    if (!j?.messages) { setState("failed"); return; }
    setMessages(j.messages);
    setElsewhere(j.elsewhere ?? []);
    setState("ready");
    // Only this thread's replies are read; one waiting in another keeps the dot.
    setHelpUnread((j.elsewhere ?? []).reduce((n, e) => n + e.unread, 0));
    const replies = j.messages.filter((m) => !m.mine).map((m) => m.id);
    if (replies.length) void fetch("/api/help/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: replies }) }).catch(() => {});
  }, [at.trip, messenger]);
  useEffect(() => { setText(kept(draftKey(at.trip))); void load(); }, [load, at.trip]);
  const go = (trip: string | null, title: string | null) => { sendingId.current = null; setPicture(null); setMessages(null); setAt({ trip, title }); };
  useEffect(() => { if (thread.current) thread.current.scrollTop = thread.current.scrollHeight; }, [messages]);

  const write = (v: string) => { setText(v); keep(draftKey(at.trip), v); };

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    // One id until it lands, so a retry after a lost reply can't send it twice.
    const id = (sendingId.current = sendingId.current ?? crypto.randomUUID());
    const form = new FormData();
    form.set("id", id);
    form.set("body", body);
    form.set("trip", at.trip ?? "");
    form.set("screen", kept(HELP_FROM) || window.location.pathname);
    form.set("viewport", `${window.innerWidth}x${window.innerHeight}`);
    form.set("language", navigator.language);
    if (picture) {
      const small = await shrinkPicture(picture);
      if (!small) {
        setBusy(false); setPicture(null);
        toast({ message: "Couldn't read that picture. Try another." });
        return;
      }
      form.set("picture", small, "picture.jpg");
    }
    const res = await fetch("/api/help", { method: "POST", body: form }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { sent?: boolean; error?: string } | null | undefined;
    setBusy(false);
    if (!res?.ok || !j?.sent) {
      toast({ message: j?.error ?? "Couldn't send that. Your words are kept." });
      return;
    }
    setMessages((m) => [...(m ?? []).filter((x) => x.id !== id), { id, mine: true, body, picture: !!picture }]);
    setState("ready");
    sendingId.current = null;
    write(""); keep(HELP_FROM, ""); setPicture(null);
    // Marks the recording, so the code in the inbox finds it in Clarity.
    (window as Window & { clarity?: (...a: unknown[]) => void }).clarity?.("set", "feedback", messageCode(id));
    toast({ message: "Thank you. I'll get back to you." });
  };

  const walk = () => {
    if (!guidance) return;
    onClose();
    if (guidance.choose) guidance.choose();
    else if (guidance.resumable || !guidance.restart) guidance.resume();
    else guidance.restart();
  };

  if (typeof document === "undefined") return null;
  if (videos) return <VideosSheet onBack={() => setVideos(false)} onClose={onClose} />;
  const has = !!messages?.length;
  const row = "w-full min-h-[48px] flex items-center justify-between text-left text-[15px] font-medium";
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end md:items-center md:justify-center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/30 pointer-events-none" />
      <div
        ref={drag.sheetRef}
        onTouchStart={drag.onTouchStart}
        onTouchMove={drag.onTouchMove}
        onTouchEnd={drag.onTouchEnd}
        onTouchCancel={drag.onTouchCancel}
        role="dialog"
        aria-modal="true"
        aria-label="Help"
        data-clarity-mask="true"
        className="relative w-full max-w-mobile mx-auto md:max-w-[420px] max-h-[92dvh] md:max-h-[86vh] bg-white rounded-t-2xl md:rounded-2xl shadow-sheet flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))", color: INK }}
      >
        <div className="flex justify-center pt-2.5 md:hidden"><div className="w-9 h-[3px] rounded-full" style={{ background: "rgba(26,26,46,0.20)" }} /></div>
        <div className="flex items-center justify-between px-5 pt-3 pb-2 flex-shrink-0">
          <h2 className="font-display" style={{ fontSize: 23, fontWeight: 500, letterSpacing: "-0.01em" }}>Help</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-3 rounded-full flex items-center justify-center hover:bg-[rgba(26,26,46,0.06)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-1">
          {messenger === "unknown" && <p role="status" className="min-h-[48px] flex items-center text-[15px]">Opening your messages…</p>}
          {messenger === "ready" && (
            <>
              <button type="button" onClick={() => { onClose(); void openMessenger("new"); }} className="w-full min-h-[48px] mb-1 rounded-xl text-[15px] font-semibold text-white" style={{ background: INK }}>
                Ask a question
              </button>
              <button type="button" onClick={() => { onClose(); void openMessenger("messages"); }} className={row}>
                <span className="relative">Your messages<HelpDot className="-top-0.5 -right-3" /></span>
                <span aria-hidden>›</span>
              </button>
            </>
          )}
          {state !== "signed-out" && messenger === "off" && (
            <>
              {at.trip !== own && (
                <div className="flex items-center gap-3 pb-2">
                  <button type="button" onClick={() => go(own, null)} className="min-h-[44px] -ml-1 pr-2 text-[15px] font-medium">&lsaquo; Back</button>
                  <span className="text-[15px] font-semibold truncate">{at.title ?? "Your other messages"}</span>
                </div>
              )}
              {elsewhere.map((e) => (
                <button key={e.trip ?? "general"} type="button" onClick={() => go(e.trip, e.title)} className={row} style={{ borderBottom: `1px solid ${RULE}`, marginBottom: 12 }}>
                  <span className="flex items-center gap-2 min-w-0">
                    <span aria-hidden className="w-[9px] h-[9px] rounded-full flex-shrink-0" style={{ background: "#B0541F" }} />
                    <span className="truncate">Brennan replied{e.title ? ` about ${e.title}` : ""}</span>
                  </span>
                  <span aria-hidden>›</span>
                </button>
              ))}
              {has && (
                <div ref={thread} role="log" aria-label="Your messages" className="flex flex-col gap-2 max-h-[38dvh] overflow-y-auto pb-3">
                  {messages!.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[84%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug whitespace-pre-wrap [overflow-wrap:anywhere] ${m.mine ? "self-end" : "self-start"}`}
                      style={m.mine ? { background: INK, color: "#fff" } : { background: "#F3F4F6" }}
                    >
                      {!m.mine && <span className="block text-[12px] font-semibold" style={{ color: "rgba(26,26,46,0.62)" }}>Brennan</span>}
                      {m.body}
                      {m.picture && <span className="block text-[12px] mt-1 opacity-80">Picture attached</span>}
                    </div>
                  ))}
                </div>
              )}
              {state === "failed" && (
                <button type="button" onClick={() => void load()} className="min-h-[44px] text-[14px] underline underline-offset-4">Couldn&rsquo;t load your messages. Try again.</button>
              )}
              {/* 16px: anything smaller makes an iPhone zoom the page on focus. */}
              <textarea
                value={text}
                onChange={(e) => write(e.target.value)}
                maxLength={MAX_BODY}
                rows={has ? 2 : 3}
                aria-label={has ? "Write a reply" : "What's wrong, missing, or good?"}
                placeholder={has ? "Write a reply" : "What’s wrong, missing, or good?"}
                className="w-full rounded-xl border px-3.5 py-3 text-[16px] leading-snug resize-none focus:outline-none focus:border-[#1A1A2E]"
                style={{ borderColor: "rgba(26,26,46,0.20)" }}
              />
              <div className="flex items-center justify-between mt-2 mb-3">
                <button type="button" onClick={() => (picture ? setPicture(null) : file.current?.click())} className="min-h-[44px] text-[14px] font-medium">
                  {picture ? "✓ Picture added · Remove" : "+ Picture"}
                </button>
                <input ref={file} type="file" accept="image/*" hidden data-testid="help-picture" onChange={(e) => { setPicture(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                <button type="button" onClick={() => void send()} disabled={busy || !text.trim()} className="min-h-[44px] px-6 rounded-xl text-[15px] font-semibold text-white disabled:opacity-40" style={{ background: INK }}>
                  {busy ? "Sending…" : "Send"}
                </button>
              </div>
            </>
          )}
          {guidance && !guest && (
            <button type="button" onClick={walk} className={row} style={{ borderTop: `1px solid ${RULE}` }}>Walkthroughs<span aria-hidden>›</span></button>
          )}
          {hasVideos && (
            <button type="button" onClick={() => setVideos(true)} className={row} style={{ borderTop: `1px solid ${RULE}` }}>How-to videos<span aria-hidden>›</span></button>
          )}
          {/* No "How Roam works" here (26 Nov 2026): "It's outdated, you need to remove that." Walkthroughs and videos are the guide. */}
        </div>
      </div>
    </div>,
    document.body,
  );
}
