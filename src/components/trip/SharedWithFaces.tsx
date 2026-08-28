"use client";

// ── Who this journey is shared with ───────────────────────────────────────
// Trello puts the faces at the top of the board; Roam buried the same fact
// five taps deep in Settings, which is why sharing felt invisible. A row of
// small circles says who can see this journey without asking, and the "+"
// opens the share sheet — one click instead of five.
//
// Owner-only: the guest list is read through a server action that asserts
// ownership, so a guest viewing a shared journey simply renders nothing.

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Copy, Check, PaperPlaneTilt } from "@phosphor-icons/react";
import { createShareLink, loadShareState } from "@/lib/share-actions";
import type { ShareState } from "@/lib/share-actions";

const INK = "#1A1A2E";
const RULE = "rgba(26,26,46,0.10)";
const CAPTION = "rgba(26,26,46,0.55)";

/** First initial of a name, else of an email, else a dot. */
function initialOf(name: string | null, email: string | null): string {
  const source = (name ?? email ?? "").trim();
  return source ? source[0]!.toUpperCase() : "·";
}

/**
 * The share box behind the "+".
 *
 * Opening Settings to share was the wrong answer — sharing is one action, not
 * a screen. Type an address, press send, and the invite is sent by the app.
 * When no mail provider is configured the route says so and this composes in
 * the traveller's own mail client instead — a stopgap, never the design.
 * The link is created on open, so there is no "create link" step standing in
 * front of the thing you came to do.
 */
function SharePopover({
  tripId,
  tripTitle,
  onClose,
}: {
  tripId: string;
  tripTitle: string | null;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const existing = await loadShareState(tripId);
        const token = existing.shareToken ?? (await createShareLink(tripId));
        if (!cancelled) setUrl(`${window.location.origin}/journey/${token}`);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    setTimeout(() => inputRef.current?.focus(), 60);
    return () => { cancelled = true; };
  }, [tripId]);

  // Escape and click-away, the same contract as every other popover here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  const copy = useCallback(async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [url]);

  // Press send and it sends. If no mail provider is configured the route says
  // so plainly and we compose locally instead — a fallback, not the design.
  const invite = useCallback(async () => {
    const to = email.trim();
    if (!to || sending) return;
    setSending(true);
    setSent(false);
    setSendError(null);
    try {
      const res = await fetch("/api/share/send-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip_id: tripId, email: to }),
      });
      const data = (await res.json()) as {
        sent?: boolean; reason?: string; url?: string; detail?: string;
      };
      if (data.sent) {
        setSent(true);
        setEmail("");
        setTimeout(onClose, 1400);
        return;
      }
      // A provider that's configured but REFUSED the send (bad key, unverified
      // from-domain) must not look like a provider that isn't configured.
      // Falling back to the mail client for both made the two indistinguishable
      // — the failure has to be legible or it can't be fixed.
      if (data.reason === "provider-error") {
        setSendError(data.detail ?? "The mail provider refused it. Check the Resend key and sender domain.");
        return;
      }
      const link = data.url ?? url;
      if (link) {
        const subject = encodeURIComponent(
          tripTitle ? `Join me on ${tripTitle}` : "Join me on this journey",
        );
        const body = encodeURIComponent(`Here's the plan — open this to see it:\n\n${link}\n`);
        window.location.href = `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;
        onClose();
      }
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  }, [email, sending, tripId, url, tripTitle, onClose]);

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label="Share this journey"
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        right: 0,
        width: 288,
        zIndex: 60,
        background: "#fff",
        border: `1px solid ${RULE}`,
        borderRadius: 14,
        boxShadow: "0 8px 28px rgba(26,26,46,0.10), 0 0 0 1px rgba(26,26,46,0.03)",
        padding: 14,
      }}
    >
      <p style={{ fontSize: 12.5, fontWeight: 600, color: INK, marginBottom: 8 }}>
        Share this journey
      </p>

      <div style={{ display: "flex", gap: 6 }}>
        <input
          ref={inputRef}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && email.trim()) invite(); }}
          placeholder="their@email.com"
          style={{
            flex: 1, minWidth: 0, fontSize: 13, color: INK,
            background: "#F7F3EA", border: `1px solid ${RULE}`,
            borderRadius: 9, padding: "8px 10px", outline: "none",
          }}
        />
        <button
          onClick={invite}
          disabled={!email.trim() || !url}
          title="Send the invite"
          aria-label="Send the invite"
          style={{
            flexShrink: 0, width: 34, borderRadius: 9,
            background: email.trim() && url ? INK : "#EFEAE3",
            color: email.trim() && url ? "#FAF7F2" : CAPTION,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <PaperPlaneTilt size={14} weight="light" />
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        <button
          onClick={copy}
          disabled={!url}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 12, fontWeight: 600, color: CAPTION,
          }}
        >
          {copied ? <Check size={12} weight="bold" /> : <Copy size={12} weight="light" />}
          {copied ? "Copied" : "Copy link"}
        </button>

        {typeof navigator !== "undefined" && "share" in navigator && url && (
          <button
            onClick={() => {
              void navigator.share({ title: tripTitle ?? "A journey", url });
              onClose();
            }}
            style={{ fontSize: 12, fontWeight: 600, color: CAPTION }}
          >
            Share…
          </button>
        )}
      </div>

      <p style={{ fontSize: 10.5, color: CAPTION, marginTop: 10, lineHeight: 1.5 }}>
        {sendError
          ? sendError
          : sent
          ? "Invite sent."
          : sending
          ? "Sending…"
          : error
          ? "Couldn't create a link — try again."
          : url
            ? "Anyone with the link can see this journey, not change it."
            : "Preparing the link…"}
      </p>
    </div>
  );
}

export default function SharedWithFaces({
  tripId,
  tripTitle = null,
}: {
  tripId: string;
  tripTitle?: string | null;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [state, setState] = useState<ShareState | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadShareState(tripId)
      .then((s) => { if (!cancelled) setState(s); })
      // A guest hits the ownership assertion and throws — that's the signal to
      // render nothing, not an error worth showing anyone.
      .catch(() => { if (!cancelled) setState(null); });
    return () => { cancelled = true; };
  }, [tripId]);

  if (!state?.shareAvailable) return null;

  const guests = state.guests;
  const shown = guests.slice(0, 3);
  const extra = guests.length - shown.length;

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      {shown.length > 0 && (
        <div style={{ display: "flex", alignItems: "center" }}>
          {shown.map((g, i) => (
            <span
              key={g.userId}
              title={g.name ?? g.email ?? "Guest"}
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                marginLeft: i === 0 ? 0 : -6,
                border: "1.5px solid #FAF7F2",
                background: g.avatarUrl ? `center/cover url(${g.avatarUrl})` : "#E7E0D5",
                color: INK,
                fontSize: 10,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {g.avatarUrl ? "" : initialOf(g.name, g.email)}
            </span>
          ))}
          {extra > 0 && (
            <span
              style={{
                width: 24, height: 24, borderRadius: "50%", marginLeft: -6,
                border: `1.5px solid #FAF7F2`, background: "#E7E0D5",
                color: CAPTION, fontSize: 10, fontWeight: 600,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              +{extra}
            </span>
          )}
        </div>
      )}

      <button
        onClick={() => setShareOpen((v) => !v)}
        aria-expanded={shareOpen}
        title={guests.length > 0 ? "Share with someone else" : "Share this journey"}
        aria-label={guests.length > 0 ? "Share with someone else" : "Share this journey"}
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          border: `1px dashed ${RULE}`,
          color: CAPTION,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
        }}
      >
        <Plus size={11} weight="bold" />
      </button>

      {shareOpen && (
        <SharePopover
          tripId={tripId}
          tripTitle={tripTitle}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}
