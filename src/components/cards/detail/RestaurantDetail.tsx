"use client";

import type { Card } from "@/types/database";
import FieldRow, { SectionLabel } from "./FieldRow";
import { getPriceRange } from "@/lib/priceRange";

interface Props {
  card: Card;
  onSaveDetails?: (field: string, value: unknown) => void;
}

export default function RestaurantDetail({ card, onSaveDetails }: Props) {
  const d = card.details;
  const save = (field: string) =>
    onSaveDetails ? (v: string) => onSaveDetails(field, v || null) : undefined;

  const priceRange = getPriceRange(
    d.price_level as number | undefined,
    d.currency_code as string | undefined,
  );

  // order_plan may be a string or string[]
  const rawOrderPlan = d.order_plan;
  const orderPlanItems: string[] = Array.isArray(rawOrderPlan)
    ? (rawOrderPlan as string[])
    : rawOrderPlan
    ? [rawOrderPlan as string]
    : [];

  return (
    <div className="space-y-6">
      {/* DETAILS */}
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
          <FieldRow
            icon="🍽️"
            label="Cuisine"
            value={d.cuisine as string | undefined}
            placeholder="Add cuisine…"
            onSave={save("cuisine")}
          />
          <FieldRow
            icon="📅"
            label="Reservation"
            value={d.reservation as string | undefined}
            placeholder="e.g. Walk-in only, Reserved at 8pm"
            onSave={save("reservation")}
          />
          <FieldRow
            icon="📝"
            label="Order plan"
            value={
              orderPlanItems.length > 0 ? orderPlanItems.join(", ") : undefined
            }
            placeholder="What to order…"
            onSave={save("order_plan")}
            multiline
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
