"use client";

import type { Card } from "@/types/database";
import FieldRow, { SectionLabel } from "./FieldRow";
import { getPriceRange } from "@/lib/priceRange";

interface Props {
  card: Card;
  onSaveDetails?: (field: string, value: unknown) => void;
  showEmpty?: boolean;
}

export default function CoffeeDetail({ card, onSaveDetails, showEmpty = false }: Props) {
  const d = card.details;
  const save = (field: string) =>
    onSaveDetails ? (v: string) => onSaveDetails(field, v || null) : undefined;
  const hide = !showEmpty;

  const priceRange = getPriceRange(
    d.price_level as number | undefined,
    d.currency_code as string | undefined,
  );

  const hasDetailsData = priceRange || d.energy;

  return (
    <div className="space-y-6">
      {/* DETAILS */}
      {(showEmpty || hasDetailsData) && (
        <div>
          <SectionLabel>Details</SectionLabel>
          <div className="space-y-4">
            {priceRange && (
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 text-center text-base mt-0.5 leading-none">💳</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Cost</p>
                  <p className="text-sm font-medium text-gray-800">{priceRange} per person</p>
                </div>
              </div>
            )}
            <FieldRow icon="⚡" label="Vibe / energy" value={d.energy as string | undefined}
              placeholder="e.g. quiet, busy, standing bar" onSave={save("energy")} hideWhenEmpty={hide} />
          </div>
        </div>
      )}

      {/* NOTES */}
      {(showEmpty || d.notes) && (
        <div>
          <SectionLabel>Notes</SectionLabel>
          <FieldRow value={d.notes as string | undefined} placeholder="Add notes…"
            onSave={save("notes")} multiline hideWhenEmpty={hide} />
        </div>
      )}
    </div>
  );
}
