"use client";

import { useCallback, useEffect, useState } from "react";
import { createShareLink, revokeShareLink, loadShareState } from "@/lib/share-actions";
import type { ShareState } from "@/lib/share-actions";
import { useSheetDrag } from "@/hooks/useSheetDrag";

/** A guest on a shared journey, as the Settings page loads it server-side. */
export interface ShareGuest {
  userId: string;
  name: string | null;
  email: string | null;
}

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.55)";
const SOFT = "rgba(26,26,46,0.42)";
const RULE = "rgba(26,26,46,0.12)";
const SIENNA = "#C4622D";
const PARCHMENT = "#FFFFFF";

function buildUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base.replace(/\/$/, "")}/journey/${token}`;
}

/**
 * Sharing a journey, from wherever you are.
 *
 * It lived only inside Trip settings, which on a phone meant day view → menu →
 * Settings → scroll: four steps to send someone a link, and you would only find
 * it if you already knew it was there. The desktop had the shared-with faces in
 * the masthead; a phone had nothing.
 *
 * The primary action is the phone's own share sheet, not a clipboard. You are
 * never sharing a journey *to a text field* — you are sending it to a person,
 * in WhatsApp or Messages, and the operating system already knows who those
 * people are. Copy stays for the desktop, where there is no share sheet.
 */
export default function ShareJourneySheet({
  tripId,
  tripTitle,
  onClose,
}: {
  tripId: string;
  tripTitle: string;
  onClose: () => void;
}) {
  const drag = useSheetDrag(onClose);
  const [state, setState] = useState<ShareState | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadShareState(tripId)
      .then((s) => { if (!cancelled) setState(s); })
      .catch(() => { if (!cancelled) setError("Couldn't read the sharing state."); });
    return () => { cancelled = true; };
  }, [tripId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const url = state?.shareToken ? buildUrl(state.shareToken) : null;

  const create = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const token = await createShareLink(tripId);
      setState((s) => (s ? { ...s, shareToken: token } : s));
    } catch {
      setError("Couldn't create a link. Try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, tripId]);

  // The share sheet is the point of this on a phone. `navigator.share` must be
  // called straight from the tap or the browser refuses it, so the link is
  // created first and shared on a second tap rather than chaining the two.
  const share = useCallback(async () => {
    if (!url) return;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: tripTitle, text: `${tripTitle} on Roam`, url });
        return;
      } catch {
        /* dismissed, or the OS refused — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Couldn't copy. Long-press the link to copy it by hand.");
    }
  }, [url, tripTitle]);

  /**
   * Send the invite through Resend.
   *
   * The route mints the share link itself when there isn't one, so this works
   * before any link exists — typing an address is the whole interaction.
   *
   * Three outcomes, kept distinct on purpose. Sent is sent. A provider that is
   * configured but refused (bad key, unverified sender domain) reports what it
   * said, because a silent fall back to the mail client makes a broken key look
   * identical to no key at all. Anything else hands off to the device's mail
   * app with the link already in the body.
   */
  const sendInvite = useCallback(async () => {
    const to = email.trim();
    if (!to || sending) return;
    setSending(true);
    setSentTo(null);
    setSendError(null);
    try {
      const res = await fetch("/api/share/send-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip_id: tripId, email: to }),
      });
      const data = (await res.json()) as {
        sent?: boolean;
        reason?: string;
        url?: string;
        detail?: string;
        error?: string;
      };

      if (data.sent) {
        setSentTo(to);
        setEmail("");
        // The link now exists whether or not it did a moment ago.
        loadShareState(tripId).then(setState).catch(() => {});
        return;
      }
      if (data.error) {
        setSendError(data.error);
        return;
      }
      if (data.reason === "provider-error") {
        setSendError(data.detail ?? "The mail provider refused it.");
        return;
      }
      const link = data.url ?? url;
      if (link) {
        const subject = encodeURIComponent(`Join me on ${tripTitle}`);
        const body = encodeURIComponent(`Here's the plan — open this to see it:\n\n${link}\n`);
        window.location.href = `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;
      } else {
        setSendError("Couldn't send that. Try the link instead.");
      }
    } catch {
      setSendError("Couldn't send that. Your connection may be down.");
    } finally {
      setSending(false);
    }
  }, [email, sending, tripId, tripTitle, url]);

  const revoke = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await revokeShareLink(tripId);
      setState((s) => (s ? { ...s, shareToken: null, guests: [] } : s));
      setConfirmRevoke(false);
    } catch {
      setError("Couldn't revoke the link. Try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, tripId]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        ref={drag.sheetRef}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={drag.onTouchStart}
        onTouchMove={drag.onTouchMove}
        onTouchEnd={drag.onTouchEnd}
        onTouchCancel={drag.onTouchCancel}
        className="relative w-full max-w-[560px] rounded-t-2xl px-4 pt-3 pb-7 overflow-y-auto"
        style={{ background: PARCHMENT, borderTop: `1px solid ${RULE}` }}
      >
        <div
          className="mx-auto mb-3.5"
          style={{ width: 34, height: 4, borderRadius: 2, background: "rgba(26,26,46,0.16)" }}
        />

        <p className="font-display italic text-[17px]" style={{ color: INK }}>
          Share {tripTitle}
        </p>

        {state === null && !error && (
          <p className="text-[13px] py-3" style={{ color: SOFT }}>
            Loading…
          </p>
        )}

        {state && !state.shareAvailable && (
          <p className="text-[13px] py-3" style={{ color: SOFT }}>
            Sharing isn&rsquo;t available on this environment.
          </p>
        )}

        {state?.shareAvailable && (
          <>
            <p className="text-[12.5px] mt-1 mb-3" style={{ color: SOFT }}>
              They can read the journey. They can&rsquo;t change it, and they can&rsquo;t see what
              it costs.
            </p>

            {/* Email is the primary way to share. The route mints the link
                itself when there isn't one, so an address is the whole
                interaction — no "create a link first" step. */}
            <div className="flex gap-2">
              <input
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendInvite()}
                placeholder="Their email address"
                className="flex-1 min-w-0 rounded-lg px-3 py-2.5 text-[14px] outline-none"
                style={{ background: "#fff", border: `1px solid ${RULE}`, color: INK }}
              />
              <button
                onClick={sendInvite}
                disabled={sending || !email.trim()}
                className="rounded-lg px-4 text-[14px] shrink-0"
                style={{
                  background: INK,
                  color: PARCHMENT,
                  opacity: sending || !email.trim() ? 0.5 : 1,
                }}
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>

            {sentTo && (
              <p className="text-[12.5px] mt-2" style={{ color: INK }}>
                Sent to {sentTo}.
              </p>
            )}
            {sendError && (
              <p className="text-[12.5px] mt-2" style={{ color: SIENNA }}>
                {sendError}
              </p>
            )}
          </>
        )}

        {state?.shareAvailable && !state.shareToken && (
          <>
            <div className="mt-4 mb-3" style={{ borderTop: `1px solid ${RULE}` }} />
            <button
              onClick={create}
              disabled={busy}
              className="w-full rounded-lg py-2.5 text-[14px]"
              style={{ border: `1px solid ${RULE}`, color: CAPTION, opacity: busy ? 0.6 : 1 }}
            >
              {busy ? "Creating…" : "Or create a link to send yourself"}
            </button>
          </>
        )}

        {state?.shareAvailable && state.shareToken && url && (
          <>
            <div className="mt-4 mb-3" style={{ borderTop: `1px solid ${RULE}` }} />

            <p
              className="text-[12px] mb-2 px-3 py-2.5 rounded-lg truncate"
              style={{ background: "#fff", border: `1px solid ${RULE}`, color: CAPTION }}
            >
              {url.replace(/^https?:\/\//, "")}
            </p>

            <button
              onClick={share}
              className="w-full rounded-lg py-2.5 text-[14px]"
              style={{ border: `1px solid ${RULE}`, color: CAPTION }}
            >
              {copied ? "Link copied" : "Send the link another way"}
            </button>

            {state.guests.length > 0 && (
              <div className="mt-4">
                <p
                  className="text-[10px] uppercase mb-1.5"
                  style={{ letterSpacing: "0.14em", color: SOFT }}
                >
                  Reading this journey
                </p>
                {state.guests.map((g) => (
                  <p key={g.userId} className="text-[13px] py-1" style={{ color: INK }}>
                    {g.name ?? g.email ?? "Someone"}
                  </p>
                ))}
              </div>
            )}

            <div className="mt-4">
              {confirmRevoke ? (
                <div className="flex items-center gap-3">
                  <button
                    onClick={revoke}
                    disabled={busy}
                    className="text-[13px]"
                    style={{ color: SIENNA }}
                  >
                    {busy ? "Revoking…" : "Yes, revoke it"}
                  </button>
                  <button
                    onClick={() => setConfirmRevoke(false)}
                    className="text-[13px]"
                    style={{ color: CAPTION }}
                  >
                    Keep it
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmRevoke(true)}
                  className="text-[13px]"
                  style={{ color: CAPTION }}
                >
                  Revoke link
                </button>
              )}
              {confirmRevoke && (
                <p className="text-[11.5px] mt-1" style={{ color: SOFT }}>
                  The link stops working for everyone you sent it to.
                </p>
              )}
            </div>
          </>
        )}

        {error && (
          <p className="text-[13px] mt-3" style={{ color: SIENNA }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
