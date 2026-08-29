"use client";

import { useEffect, useRef, useState } from "react";
import { Coins, NotePencil } from "@phosphor-icons/react";
import { EstimateLink, useJourneyNotes } from "@/components/overlays/AppOverlays";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.55)";
const SOFT = "rgba(26,26,46,0.42)";
const RULE = "rgba(26,26,46,0.12)";
const PARCHMENT = "#FAF7F2";

/**
 * The journey's occasional screens, behind one control.
 *
 * These were two bare glyphs sitting beside the tabs — a pencil and a stack of
 * coins, each a memory test. The phone has carried a named menu for these all
 * along ("Journey notes — codes, packing, who's driving"), and this is that
 * menu at desktop width: same items, same descriptions, one place to add the
 * next one instead of two.
 *
 * What stays out of here is decided by frequency: the tabs, Search and Plan a
 * journey are reached constantly and keep their own width. Notes and the
 * estimate are opened a handful of times per trip.
 */
export default function JourneyMenu({ tripId, guest }: { tripId: string; guest: boolean }) {
  const [open, setOpen] = useState(false);
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

  return (
    <div ref={ref} style={{ position: "relative", marginRight: 6 }}>
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
            <span>
              <span style={{ display: "block", fontSize: 14, color: INK, lineHeight: 1.3 }}>
                Journey notes
              </span>
              <span style={{ display: "block", fontSize: 11.5, color: SOFT, marginTop: 1 }}>
                Codes, packing, who&rsquo;s driving
              </span>
            </span>
          </button>

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
              <span>
                <span style={{ display: "block", fontSize: 14, color: INK, lineHeight: 1.3 }}>
                  Estimate
                </span>
                <span style={{ display: "block", fontSize: 11.5, color: SOFT, marginTop: 1 }}>
                  Flights, villa, excursions
                </span>
              </span>
            </EstimateLink>
          )}
        </div>
      )}
    </div>
  );
}
