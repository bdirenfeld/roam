"use client";

import type { Card } from "@/types/database";
import { formatTimeValue } from "@/lib/formatTime";
import { ashoreLabel } from "@/lib/cards/port";
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
  const aboard = card.end_time ? [formatTimeValue(card.end_time), ashoreLabel(card)].filter(Boolean).join(" · ") : null;
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
