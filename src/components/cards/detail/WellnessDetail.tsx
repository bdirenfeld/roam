"use client";

import type { Card } from "@/types/database";
import FieldRow, { SectionLabel } from "./FieldRow";

interface Props {
  card: Card;
  onSaveDetails?: (field: string, value: unknown) => void;
  showEmpty?: boolean;
}

export default function WellnessDetail({ card, onSaveDetails, showEmpty = false }: Props) {
  const d = card.details as { booked?: boolean; notes?: string };
  const save = (field: string) =>
    onSaveDetails ? (v: string) => onSaveDetails(field, v || null) : undefined;
  const hide = !showEmpty;

  return (
    <div className="space-y-6">
      {/* Booked toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Booked</p>
          <p className="text-sm text-gray-600 mt-0.5">{d.booked ? "Yes" : "No"}</p>
        </div>
        {onSaveDetails && (
          <button
            onClick={() => onSaveDetails("booked", !d.booked)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${d.booked ? "bg-activity" : "bg-gray-200"}`}
            aria-label={d.booked ? "Mark as not booked" : "Mark as booked"}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${d.booked ? "translate-x-6" : "translate-x-1"}`}
            />
          </button>
        )}
      </div>

      {/* Notes */}
      {(showEmpty || d.notes) && (
        <div>
          <SectionLabel>Notes</SectionLabel>
          <FieldRow value={d.notes} placeholder="Add notes…"
            onSave={save("notes")} multiline hideWhenEmpty={hide} />
        </div>
      )}
    </div>
  );
}
