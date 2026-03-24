"use client";

import type { Card } from "@/types/database";
import FieldRow, { SectionLabel } from "./FieldRow";
import ArrayField from "./ArrayField";

interface Props {
  card: Card;
  onSaveDetails?: (field: string, value: unknown) => void;
}

export default function GuidedDetail({ card, onSaveDetails }: Props) {
  const d = card.details;
  const save = (field: string) =>
    onSaveDetails ? (v: string) => onSaveDetails(field, v || null) : undefined;

  // includes: string[]
  const rawIncludes = d.includes;
  const includes: string[] = Array.isArray(rawIncludes)
    ? (rawIncludes as string[])
    : [];

  return (
    <div className="space-y-6">
      {/* BOOKING */}
      <div>
        <SectionLabel>Booking</SectionLabel>
        <div className="space-y-4">
          <FieldRow
            icon="🏢"
            label="Supplier"
            value={d.supplier as string | undefined}
            placeholder="Add supplier…"
            onSave={save("supplier")}
          />
          <FieldRow
            icon="📍"
            label="Meet at"
            value={d.meeting_point as string | undefined}
            placeholder="Add meeting point…"
            onSave={save("meeting_point")}
          />
          <FieldRow
            icon="🔗"
            label="Website"
            value={d.website as string | undefined}
            placeholder="Add website…"
            onSave={save("website")}
          />
          <FieldRow
            icon="📋"
            label="Confirmation"
            value={d.confirmation as string | undefined}
            placeholder="Add confirmation code…"
            onSave={save("confirmation")}
          />
        </div>
      </div>

      {/* WHAT'S INCLUDED */}
      <ArrayField
        label="What's Included"
        items={includes}
        placeholder="Nothing listed yet…"
        newItemPlaceholder="Add an inclusion…"
        onSave={
          onSaveDetails ? (items) => onSaveDetails("includes", items) : undefined
        }
        bulletClass="bg-activity"
      />

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
