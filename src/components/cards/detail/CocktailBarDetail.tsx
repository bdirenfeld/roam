"use client";

import type { Card } from "@/types/database";
import FieldRow, { SectionLabel } from "./FieldRow";
import ArrayField from "./ArrayField";
import { getPriceRange } from "@/lib/priceRange";

interface Props {
  card: Card;
  onSaveDetails?: (field: string, value: unknown) => void;
}

export default function CocktailBarDetail({ card, onSaveDetails }: Props) {
  const d = card.details;
  const save = (field: string) =>
    onSaveDetails ? (v: string) => onSaveDetails(field, v || null) : undefined;

  const priceRange = getPriceRange(
    d.price_level as number | undefined,
    d.currency_code as string | undefined,
  );

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
          {priceRange && (
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 text-center text-base mt-0.5 leading-none">💳</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Cost</p>
                <p className="text-sm font-medium text-gray-800">{priceRange} per person</p>
              </div>
            </div>
          )}
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
