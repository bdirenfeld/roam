"use client";

import type { Card } from "@/types/database";
import FieldRow, { SectionLabel } from "./FieldRow";

interface Props {
  card: Card;
  onSaveDetails?: (field: string, value: unknown) => void;
}

function fmtTime(t: string | null): string | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  const p = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${p}`;
}

export default function HotelDetail({ card, onSaveDetails }: Props) {
  const d = card.details;
  const save = (field: string) =>
    onSaveDetails ? (v: string) => onSaveDetails(field, v || null) : undefined;

  const checkIn  = fmtTime(card.start_time);
  const checkOut = fmtTime(card.end_time);

  return (
    <div className="space-y-6">
      {/* STAY */}
      <div>
        <SectionLabel>Stay</SectionLabel>
        <div className="space-y-4">
          {checkIn && (
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 text-center text-base mt-0.5 leading-none">🔑</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Check-in</p>
                <p className="text-sm font-medium text-gray-800">{checkIn}</p>
              </div>
            </div>
          )}
          {checkOut && (
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 text-center text-base mt-0.5 leading-none">🧳</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Check-out</p>
                <p className="text-sm font-medium text-gray-800">{checkOut}</p>
              </div>
            </div>
          )}
          <FieldRow
            icon="📋"
            label="Confirmation"
            value={d.confirmation as string | undefined}
            placeholder="Add confirmation code…"
            onSave={save("confirmation")}
          />
        </div>
      </div>

      {/* NOTES */}
      <div>
        <SectionLabel>Notes</SectionLabel>
        <FieldRow
          value={d.notes as string | undefined}
          placeholder="Add notes…"
          onSave={save("notes")}
          multiline
        />
      </div>
    </div>
  );
}
