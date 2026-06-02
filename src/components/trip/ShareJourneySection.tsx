"use client";

// Owner share UI for Trip Settings. Two states matching the approved mockup
// (design-reference/roam-trip-settings-with-share.html): resting (Sienna
// "Create link") and active (read-only link + Copy, Ink "Revoke link", and a
// quiet guest list with per-person remove). All mutations go through the
// service-role server actions in share-actions.ts. Deliberately distinct from
// the Travellers section: small muted avatar, DM Sans name, email line.

import { useState } from "react";
import { Link as LinkIcon, Copy, X } from "@phosphor-icons/react";
import { createShareLink, revokeShareLink, removeGuest } from "@/lib/share-actions";

export interface ShareGuest {
  userId: string;
  name: string | null;
  email: string | null;
}

interface Props {
  tripId: string;
  initialShareToken: string | null;
  initialGuests: ShareGuest[];
}

const SIENNA = "#C4622D";
const INK = "#1A1A2E";
const PARCHMENT = "#FAF7F2";

function buildUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base.replace(/\/$/, "")}/journey/${token}`;
}

function avatarInitial(g: ShareGuest): string {
  const s = (g.name ?? g.email ?? "?").trim();
  return (s[0] ?? "?").toUpperCase();
}

export default function ShareJourneySection({
  tripId,
  initialShareToken,
  initialGuests,
}: Props) {
  const [token, setToken] = useState<string | null>(initialShareToken);
  const [guests, setGuests] = useState<ShareGuest[]>(initialGuests);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const fullUrl = token ? buildUrl(token) : "";
  const displayUrl = fullUrl.replace(/^https?:\/\//, "");

  const handleCreate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setToken(await createShareLink(tripId));
    } catch {
      /* leave resting state; the action surfaced nothing to write */
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await revokeShareLink(tripId);
      setToken(null);
      setCopied(false);
    } catch {
      /* keep showing the active state on failure */
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  };

  const handleRemove = async (userId: string) => {
    const prev = guests;
    setGuests((g) => g.filter((x) => x.userId !== userId));
    try {
      await removeGuest(tripId, userId);
    } catch {
      setGuests(prev); // restore on failure
    }
  };

  return (
    <section className="px-5">
      <div className="pt-6 pb-3.5">
        <h2 className="font-display italic font-medium text-[22px] text-[#1A1A2E] leading-tight">
          Share this journey
        </h2>
      </div>

      {token === null ? (
        /* ── Resting ── */
        <div>
          <p
            className="text-[14px] leading-[1.6] max-w-[62ch]"
            style={{ color: "rgba(26,26,46,0.6)" }}
          >
            Invite a guest to view your days and your map, and ask the companion
            for advice — they can&rsquo;t change a thing.
          </p>
          <button
            onClick={handleCreate}
            disabled={busy}
            className="mt-4 inline-flex items-center gap-2 rounded-[9px] px-[17px] py-[11px] text-[14px] font-medium disabled:opacity-50 transition-[filter] hover:brightness-[1.06]"
            style={{ background: SIENNA, color: PARCHMENT }}
          >
            <LinkIcon size={17} weight="light" />
            {busy ? "Creating…" : "Create link"}
          </button>
        </div>
      ) : (
        /* ── Active ── */
        <div>
          <p className="text-[14px] leading-[1.6]" style={{ color: "rgba(26,26,46,0.6)" }}>
            Anyone with this link can view this journey.
          </p>

          <div
            className="mt-4 flex items-center gap-2.5 rounded-[9px] py-[9px] pl-[13px] pr-[9px] max-w-[520px]"
            style={{ border: "0.5px solid rgba(26,26,46,0.15)", background: "rgba(26,26,46,0.02)" }}
          >
            <LinkIcon
              size={16}
              weight="light"
              style={{ color: "rgba(26,26,46,0.45)", flexShrink: 0 }}
            />
            <span className="flex-1 min-w-0 text-[14px] truncate" style={{ color: INK }}>
              {displayUrl}
            </span>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 flex-shrink-0 rounded-[7px] px-3 py-[7px] text-[13px] font-medium text-[#1A1A2E] hover:bg-[rgba(26,26,46,0.05)] transition-colors"
              style={{ border: "0.5px solid rgba(26,26,46,0.25)" }}
            >
              <Copy size={15} weight="light" />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          {/* Understated Ink — never red, never Sienna (a reversible action) */}
          <button
            onClick={handleRevoke}
            disabled={busy}
            className="block pt-2.5 text-[13px] text-[rgba(26,26,46,0.6)] hover:text-[#1A1A2E] disabled:opacity-50 transition-colors"
          >
            Revoke link
          </button>

          <div
            className="text-[11px] uppercase tracking-[0.09em] mt-[22px] mb-0.5"
            style={{ color: "rgba(26,26,46,0.45)" }}
          >
            Guests
          </div>

          {guests.length === 0 ? (
            <p className="text-[13px] py-3" style={{ color: "rgba(26,26,46,0.4)" }}>
              No one has joined yet.
            </p>
          ) : (
            <div>
              {guests.map((g) => (
                <div
                  key={g.userId}
                  className="flex items-center gap-3.5 py-3"
                  style={{ borderBottom: "0.5px solid rgba(26,26,46,0.1)" }}
                >
                  <div
                    className="w-[38px] h-[38px] rounded-full flex items-center justify-center text-[14px] font-medium flex-shrink-0"
                    style={{ background: "rgba(26,26,46,0.07)", color: "rgba(26,26,46,0.7)" }}
                  >
                    {avatarInitial(g)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium truncate" style={{ color: INK }}>
                      {g.name ?? g.email ?? "Guest"}
                    </div>
                    {g.email && (
                      <div className="text-[13px] truncate" style={{ color: "rgba(26,26,46,0.5)" }}>
                        {g.email}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemove(g.userId)}
                    aria-label={`Remove ${g.name ?? g.email ?? "guest"}`}
                    className="p-1 flex text-[rgba(26,26,46,0.4)] hover:text-[#1A1A2E] transition-colors"
                  >
                    <X size={18} weight="light" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
