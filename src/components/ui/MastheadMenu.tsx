"use client";

import { useEffect, useRef, useState } from "react";
import { Coins, NotePencil, Compass, ShareNetwork } from "@phosphor-icons/react";
import { EstimateLink, NewJourneyLink, useJourneyNotes } from "@/components/overlays/AppOverlays";
import ShareJourneySheet from "@/components/trip/ShareJourneySheet";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.55)";
const SOFT = "rgba(26,26,46,0.42)";
const RULE = "rgba(26,26,46,0.12)";
const PARCHMENT = "#FAF7F2";

const itemStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  padding: "9px 10px",
  borderRadius: 9,
  width: "100%",
  textAlign: "left",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  textDecoration: "none",
};

const glyphStyle: React.CSSProperties = {
  width: 31,
  height: 31,
  borderRadius: 8,
  background: "#FFFFFF",
  border: `1px solid ${RULE}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: CAPTION,
  flex: "none",
};

function Label({ title, sub }: { title: string; sub: string }) {
  return (
    <span>
      <span style={{ display: "block", fontSize: 14, color: INK, lineHeight: 1.3 }}>{title}</span>
      <span style={{ display: "block", fontSize: 11.5, color: SOFT, marginTop: 1 }}>{sub}</span>
    </span>
  );
}

/**
 * The masthead's overflow — everything reached occasionally, named.
 *
 * These were bare glyphs strung along the bar: a pencil, a stack of coins, a
 * plus sign. Each was a memory test, and each had to be added here *and* to the
 * phone's own menu, which is how the Estimate entry point and Ideas both once
 * shipped invisible on a phone. This is the phone's menu at desktop width —
 * same items, same descriptions, one place to add the next one.
 *
 * It renders everywhere, not only on a journey: "Plan a journey" has to work
 * from the Journeys list and from Ideas too. The journey-scoped items appear
 * only when there is a journey to scope them to.
 */
export default function MastheadMenu({
  tripId,
  tripTitle,
  guest,
}: {
  tripId: string | null;
  tripTitle: string | null;
  guest: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const notes = useJourneyNotes();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", marginRight: 8 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="More"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 33,
          height: 33,
          borderRadius: 8,
          color: open ? INK : CAPTION,
          background: open ? "rgba(26,26,46,0.06)" : "transparent",
          border: "none",
          cursor: "pointer",
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: 288,
            background: PARCHMENT,
            border: `1px solid ${RULE}`,
            borderRadius: 13,
            boxShadow: "0 16px 34px rgba(26,26,46,0.17)",
            padding: 7,
            zIndex: 60,
          }}
        >
          {/* Global — the one creative action in the app, and the reason this
              menu renders off a journey as well as on one. */}
          <NewJourneyLink
            title="Plan a journey"
            ariaLabel="Plan a journey"
            onBeforeOpen={() => setOpen(false)}
            style={itemStyle}
          >
            <span style={glyphStyle}>
              <Compass size={16} weight="light" />
            </span>
            <Label title="Plan a journey" sub="Somewhere new, from scratch" />
          </NewJourneyLink>

          {tripId && (
            <>
              <div style={{ height: 1, background: "rgba(26,26,46,0.09)", margin: "5px 11px" }} />

              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  notes.open(tripId);
                }}
                style={itemStyle}
              >
                <span style={glyphStyle}>
                  <NotePencil size={16} weight="light" />
                </span>
                <Label title="Journey notes" sub="Codes, packing, who’s driving" />
              </button>

              {!guest && (
                <button
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    setShowShare(true);
                  }}
                  style={itemStyle}
                >
                  <span style={glyphStyle}>
                    <ShareNetwork size={16} weight="light" />
                  </span>
                  <Label title="Share journey" sub="Send a read-only link" />
                </button>
              )}

              {/* The estimate is the owner's own figure — never a guest's. */}
              {!guest && (
                <EstimateLink
                  tripId={tripId}
                  role="menuitem"
                  ariaLabel="Estimate"
                  onBeforeOpen={() => setOpen(false)}
                  style={itemStyle}
                >
                  <span style={glyphStyle}>
                    <Coins size={16} weight="light" />
                  </span>
                  <Label title="Estimate" sub="Flights, villa, excursions" />
                </EstimateLink>
              )}
            </>
          )}
        </div>
      )}

      {showShare && tripId && (
        <ShareJourneySheet
          tripId={tripId}
          tripTitle={tripTitle ?? "this journey"}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
