"use client";

import type { Card } from "@/types/database";
import { formatTimeValue } from "@/lib/formatTime";
import { ashoreLabel, nightsInPort, addIsoDays } from "@/lib/cards/port";
import { dayLabel } from "../StayDatesSheet";
import { StayRow } from "./HotelDetail";
import FieldRow, { SectionLabel } from "./FieldRow";

/**
 * A port of call's sheet (17 Nov 2026, Don's cruise; mock approved): Docks,
 * then All aboard with the hours ashore beside it. Each shows its date
 * (18 Nov 2026): a ship can stay in port for nights, and both rows open the
 * hotel calendar, where the leaving day is picked; that replaced the Overnight
 * switch. Anything more (a water shuttle) goes in the note.
 */
export default function PortDetail({ card, docksDate, onEditTime, onSaveDetails, showEmpty = false }: { card: Card; docksDate?: string | null; onEditTime?: () => void; onSaveDetails?: (field: string, value: unknown) => void; showEmpty?: boolean }) {
  const notes = (card.details as { notes?: string } | null)?.notes;
  const on = (iso: string | null | undefined, text: string) => (iso ? `${dayLabel(iso)} · ${text}` : text);
  const docks = card.start_time ? on(docksDate, formatTimeValue(card.start_time)) : null;
  const leaves = docksDate ? addIsoDays(docksDate, nightsInPort(card)) : null;
  const aboard = card.end_time ? [on(leaves, formatTimeValue(card.end_time)), ashoreLabel(card)].filter(Boolean).join(" · ") : null;
  const Value = ({ text, testId }: { text: string | null; testId: string }) =>
    onEditTime ? (
      <button type="button" onClick={onEditTime} aria-label="Change the port dates and times" className="relative flex-1 min-w-0 flex items-center justify-between text-left">
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
