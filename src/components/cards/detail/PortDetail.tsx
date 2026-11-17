"use client";

import type { Card } from "@/types/database";
import { formatTimeValue } from "@/lib/formatTime";
import { ashoreLabel, isOvernight } from "@/lib/cards/port";
import { StayRow } from "./HotelDetail";
import FieldRow, { SectionLabel } from "./FieldRow";

/**
 * A port of call's sheet (17 Nov 2026, Don's cruise; mock approved): two times
 * and nothing else. Docks, then All aboard with the hours ashore beside it.
 * Anything more (a water shuttle) goes in the note. The sheet has no time chip
 * for a port, so either row opens the time sheet.
 */
export default function PortDetail({ card, onEditTime, onSaveDetails, showEmpty = false }: { card: Card; onEditTime?: () => void; onSaveDetails?: (field: string, value: unknown) => void; showEmpty?: boolean }) {
  const notes = (card.details as { notes?: string } | null)?.notes;
  const docks = card.start_time ? formatTimeValue(card.start_time) : null;
  const night = (card.details as { overnight?: unknown } | null)?.overnight === true;
  const aboard = card.end_time ? [formatTimeValue(card.end_time), isOvernight(card) ? "next day" : null, ashoreLabel(card)].filter(Boolean).join(" · ") : null;
  const Value = ({ text, testId }: { text: string | null; testId: string }) =>
    onEditTime ? (
      <button type="button" onClick={onEditTime} aria-label="Change the port times" className="relative flex-1 min-w-0 flex items-center justify-between text-left">
        <span data-testid={testId} style={{ color: text ? "#1A1A2E" : "rgba(26,26,46,0.45)" }}>{text ?? "Add a time"}</span>
        <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: 18, color: "rgba(26,26,46,0.35)" }}>chevron_right</span>
      </button>
    ) : (
      <span data-testid={testId}>{text ?? "—"}</span>
    );
  return (
    <div className="space-y-6">
      <div data-testid="port-times" className="space-y-3.5">
        <StayRow icon="schedule" label="Docks"><Value text={docks} testId="port-docks" /></StayRow>
        <StayRow icon="anchor" label="All aboard"><Value text={aboard} testId="port-aboard" /></StayRow>
        {/* A night in port (17 Nov 2026): all aboard is the next day. */}
        {(onSaveDetails || night) && (
          <StayRow icon="bedtime" label="Overnight">
            {onSaveDetails ? (
              <button type="button" role="switch" aria-checked={night} aria-label="Stays the night in port"
                onClick={() => onSaveDetails("overnight", night ? null : true)}
                className="relative flex-1 min-w-0 flex items-center justify-between text-left">
                <span data-testid="port-overnight">{night ? "Yes, leaves the next day" : "No"}</span>
                <span aria-hidden="true" className="w-9 h-5 rounded-full relative transition-colors" style={{ background: night ? "#1A1A2E" : "rgba(26,26,46,0.18)" }}>
                  <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: night ? 18 : 2 }} />
                </span>
              </button>
            ) : <span data-testid="port-overnight">Yes, leaves the next day</span>}
          </StayRow>
        )}
      </div>
      {/* The note ("Water shuttle required."), as every detail component shows it. */}
      {(showEmpty || notes) && (
        <div>
          {showEmpty && <SectionLabel>Notes</SectionLabel>}
          <FieldRow value={notes} placeholder="Add a note…" multiline hideWhenEmpty={!showEmpty}
            onSave={onSaveDetails ? (v: string) => onSaveDetails("notes", v || null) : undefined} />
        </div>
      )}
    </div>
  );
}
