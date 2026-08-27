"use client";

// ── Who this journey is shared with ───────────────────────────────────────
// Trello puts the faces at the top of the board; Roam buried the same fact
// five taps deep in Settings, which is why sharing felt invisible. A row of
// small circles says who can see this journey without asking, and the "+"
// opens the share sheet — one click instead of five.
//
// Owner-only: the guest list is read through a server action that asserts
// ownership, so a guest viewing a shared journey simply renders nothing.

import { useEffect, useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { loadShareState } from "@/lib/share-actions";
import type { ShareState } from "@/lib/share-actions";
import { useTripSettings } from "@/components/overlays/AppOverlays";

const INK = "#1A1A2E";
const RULE = "rgba(26,26,46,0.10)";
const CAPTION = "rgba(26,26,46,0.55)";

/** First initial of a name, else of an email, else a dot. */
function initialOf(name: string | null, email: string | null): string {
  const source = (name ?? email ?? "").trim();
  return source ? source[0]!.toUpperCase() : "·";
}

export default function SharedWithFaces({ tripId }: { tripId: string }) {
  const settings = useTripSettings();
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
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
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
        onClick={() => settings.open(tripId, { section: "share" })}
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
    </div>
  );
}
