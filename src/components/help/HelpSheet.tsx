"use client";

// ── Help: one box, Brennan's replies, walkthroughs and videos (24 Nov 2026) ─
// Opens from the journey menu's Help tile, the avatar menu, Profile, and the
// crash page. One conversation per person: no categories, no statuses.
// Same white sheet as VideosSheet. Someone signed out (the demo) gets the two
// rows and no box.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSheetDrag } from "@/hooks/useSheetDrag";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useHowToVideos } from "@/hooks/useHowToVideos";
import { useToast } from "@/components/ui/Toast";
import { useJourneyGuidance } from "@/components/onboarding/JourneyGuidanceContext";
import VideosSheet from "@/components/videos/VideosSheet";
import { listed, deviceOf } from "@/lib/videos/howTo";
import { MAX_BODY, messageCode } from "@/lib/help/message";
import { setHelpUnread } from "@/lib/help/unread";
import { shrinkPicture } from "@/lib/help/picture";

const INK = "#1A1A2E";
const RULE = "rgba(26,26,46,0.10)";
const DRAFT = "roam:help-draft";
/** The page they were on, when Help opened somewhere else (the crash page). */
export const HELP_FROM = "roam:help-from";

interface Msg { id: string; mine: boolean; body: string; picture: boolean }
function kept(key: string): string { try { return sessionStorage.getItem(key) ?? ""; } catch { return ""; } }
function keep(key: string, v: string) { try { if (v) sessionStorage.setItem(key, v); else sessionStorage.removeItem(key); } catch { /* private mode */ } }

export default function HelpSheet({ onClose, guest = false }: { onClose: () => void; guest?: boolean }) {
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed" | "signed-out">("loading");
  const [text, setText] = useState("");
  const [picture, setPicture] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [videos, setVideos] = useState(false);
  const sendingId = useRef<string | null>(null);
  const thread = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const guidance = useJourneyGuidance();
  const { available } = useHowToVideos();
  const drag = useSheetDrag(onClose, undefined, { mobileOnly: true });
  useEscapeKey(onClose, !videos);
  const hasVideos = listed(available, typeof navigator === "undefined" ? "computer" : deviceOf(navigator.userAgent)).length > 0;

  const load = useCallback(async () => {
    setState("loading");
    const res = await fetch("/api/help").catch(() => null);
    if (res?.status === 401) { setState("signed-out"); return; }
    const j = res?.ok ? ((await res.json().catch(() => null)) as { messages?: Msg[] } | null) : null;
    if (!j?.messages) { setState("failed"); return; }
    setMessages(j.messages);
    setState("ready");
    if (j.messages.some((m) => !m.mine)) {
      setHelpUnread(0);
      void fetch("/api/help/read", { method: "POST" }).catch(() => {});
    }
  }, []);
  useEffect(() => { setText(kept(DRAFT)); void load(); }, [load]);
  useEffect(() => { if (thread.current) thread.current.scrollTop = thread.current.scrollHeight; }, [messages]);

  const write = (v: string) => { setText(v); keep(DRAFT, v); };

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    // One id until it lands, so a retry after a lost reply can't send it twice.
    const id = (sendingId.current = sendingId.current ?? crypto.randomUUID());
    const form = new FormData();
    form.set("id", id);
    form.set("body", body);
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
  if (videos) return <VideosSheet onClose={() => setVideos(false)} />;
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
          {state !== "signed-out" && (
            <>
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
        </div>
      </div>
    </div>,
    document.body,
  );
}
