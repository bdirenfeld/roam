"use client";

import type { Card } from "@/types/database";
import FieldRow, { SectionLabel } from "./FieldRow";

interface Props {
  card: Card;
  onSaveDetails?: (field: string, value: unknown) => void;
}

export default function CoffeeDetail({ card, onSaveDetails }: Props) {
  const d = card.details;
  const save = (field: string) =>
    onSaveDetails ? (v: string) => onSaveDetails(field, v || null) : undefined;

  return (
    <div className="space-y-6">
      {/* DETAILS */}
      <div>
        <SectionLabel>Details</SectionLabel>
        <div className="space-y-4">
          <FieldRow
            icon="💳"
            label="Cost"
            value={d.cost as string | undefined}
            placeholder="e.g. €4–6 pp"
            onSave={save("cost")}
          />
          <FieldRow
            icon="⚡"
            label="Vibe / energy"
            value={d.energy as string | undefined}
            placeholder="e.g. quiet, busy, standing bar"
            onSave={save("energy")}
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
