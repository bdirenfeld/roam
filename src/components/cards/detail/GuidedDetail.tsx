"use client";

import type { Card } from "@/types/database";
import FieldRow, { SectionLabel } from "./FieldRow";
import ArrayField from "./ArrayField";

interface Props {
  card: Card;
  onSaveDetails?: (field: string, value: unknown) => void;
  showEmpty?: boolean;
}

export default function GuidedDetail({ card, onSaveDetails, showEmpty = false }: Props) {
  const d = card.details as {
    supplier?: string;
    meeting_point?: string;
    meeting_time?: string;
    cost_per_person?: number;
    paid?: boolean;
    confirmation?: string;
    includes?: string[];
    notes?: string;
  };
  const save = (field: string) =>
    onSaveDetails ? (v: string) => onSaveDetails(field, v || null) : undefined;
  const hide = !showEmpty;

  const includes: string[] = Array.isArray(d.includes) ? (d.includes as string[]) : [];

  const hasBookingData = d.supplier || d.meeting_point || d.meeting_time ||
    d.cost_per_person != null || d.paid || d.confirmation;

  return (
    <div className="space-y-6">
      {/* BOOKING */}
      {(showEmpty || hasBookingData) && (
        <div>
          <SectionLabel>Booking</SectionLabel>
          <div className="space-y-4">
            <FieldRow icon="🏢" label="Supplier" value={d.supplier}
              placeholder="Add supplier…" onSave={save("supplier")} hideWhenEmpty={hide} />
            <FieldRow icon="📍" label="Meet at" value={d.meeting_point}
              placeholder="Add meeting point…" onSave={save("meeting_point")} hideWhenEmpty={hide} />
            <FieldRow icon="⏰" label="Meet by" value={d.meeting_time}
              placeholder="Add meeting time…" onSave={save("meeting_time")} hideWhenEmpty={hide} />
            <FieldRow icon="💳" label="Cost per person"
              value={d.cost_per_person != null ? String(d.cost_per_person) : undefined}
              placeholder="Add cost…"
              onSave={onSaveDetails ? (v) => onSaveDetails("cost_per_person", v ? parseFloat(v) : null) : undefined}
              hideWhenEmpty={hide} />
            {(showEmpty || d.paid) && (
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 text-center text-base mt-0.5 leading-none">💰</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Paid</p>
                  {onSaveDetails ? (
                    <button
                      onClick={() => onSaveDetails("paid", !(d.paid as boolean))}
                      className={`text-sm font-medium rounded-full px-2.5 py-0.5 transition-colors ${
                        d.paid ? "bg-teal-50 text-activity" : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {d.paid ? "Yes" : "No"}
                    </button>
                  ) : (
                    <p className="text-sm font-medium text-gray-800">{d.paid ? "Yes" : "No"}</p>
                  )}
                </div>
              </div>
            )}
            <FieldRow icon="📋" label="Confirmation" value={d.confirmation}
              placeholder="Add confirmation code…" onSave={save("confirmation")} hideWhenEmpty={hide} />
          </div>
        </div>
      )}

      {/* WHAT'S INCLUDED */}
      <ArrayField label="What's Included" items={includes} placeholder="Nothing listed yet…"
        newItemPlaceholder="Add an inclusion…"
        onSave={onSaveDetails ? (items) => onSaveDetails("includes", items) : undefined}
        bulletClass="bg-activity" hideWhenEmpty={hide} />

      {/* NOTES */}
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
