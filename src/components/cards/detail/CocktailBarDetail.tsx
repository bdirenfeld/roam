"use client";

import type { Card } from "@/types/database";
import FieldRow, { SectionLabel } from "./FieldRow";
import ArrayField from "./ArrayField";

interface Props {
  card: Card;
  onSaveDetails?: (field: string, value: unknown) => void;
}

export default function CocktailBarDetail({ card, onSaveDetails }: Props) {
  const d = card.details;
  const save = (field: string) =>
    onSaveDetails ? (v: string) => onSaveDetails(field, v || null) : undefined;

  const rawFlow = d.flow;
  const flow: string[] = Array.isArray(rawFlow)
    ? (rawFlow as unknown[]).map((item) =>
        typeof item === "string" ? item : String(item)
      )
    : [];

  return (
    <div className="space-y-6">
      {/* THE SPOT */}
      <div>
        <SectionLabel>The Spot</SectionLabel>
        <div className="space-y-4">
          <FieldRow
            icon="📍"
            label="Address"
            value={card.address}
            placeholder="Add address…"
            onSave={
              onSaveDetails
                ? (v) => onSaveDetails("__top__address", v || null)
                : undefined
            }
          />
          <FieldRow
            icon="🔗"
            label="Website"
            value={d.website as string | undefined}
            placeholder="Add website…"
            onSave={save("website")}
          />
        </div>
      </div>

      {/* PLAN — flow items */}
      <ArrayField
        label="Plan"
        items={flow}
        placeholder="No plan added yet…"
        newItemPlaceholder="Add a step…"
        onSave={
          onSaveDetails ? (items) => onSaveDetails("flow", items) : undefined
        }
        bulletClass="bg-food"
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
