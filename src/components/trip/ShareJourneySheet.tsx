"use client";

import { useCallback, useEffect, useState } from "react";
import { createShareLink, revokeShareLink, loadShareState } from "@/lib/share-actions";
import type { ShareState } from "@/lib/share-actions";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.55)";
const SOFT = "rgba(26,26,46,0.42)";
const RULE = "rgba(26,26,46,0.12)";
const SIENNA = "#C4622D";
const PARCHMENT = "#FAF7F2";

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
  const [state, setState] = useState<ShareState | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

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
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[560px] rounded-t-2xl px-4 pt-3 pb-7"
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

        {state?.shareAvailable && !state.shareToken && (
          <>
            <p className="text-[12.5px] mt-1 mb-4" style={{ color: SOFT }}>
              Anyone with the link can read this journey. They can&rsquo;t change it, and they
              can&rsquo;t see what it costs.
            </p>
            <button
              onClick={create}
              disabled={busy}
              className="w-full rounded-lg py-3 text-[14px]"
              style={{ background: INK, color: PARCHMENT, opacity: busy ? 0.6 : 1 }}
            >
              {busy ? "Creating…" : "Create a link"}
            </button>
          </>
        )}

        {state?.shareAvailable && state.shareToken && url && (
          <>
            <p
              className="text-[12px] mt-2 mb-3 px-3 py-2.5 rounded-lg truncate"
              style={{ background: "#fff", border: `1px solid ${RULE}`, color: CAPTION }}
            >
              {url.replace(/^https?:\/\//, "")}
            </p>

            <button
              onClick={share}
              className="w-full rounded-lg py-3 text-[14px]"
              style={{ background: INK, color: PARCHMENT }}
            >
              {copied ? "Link copied" : "Share link"}
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
