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

  const rawOrderPlan = d.order_plan;
  const orderPlanValue = Array.isArray(rawOrderPlan)
    ? (rawOrderPlan as string[]).join(", ")
    : (rawOrderPlan as string | undefined);

  return (
    <div className="space-y-6">
      {/* Price range — read-only */}
      {priceRange && (
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-5 text-center text-base mt-0.5 leading-none">💳</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Price range</p>
            <p className="text-sm font-medium text-gray-800">{priceRange} per person</p>
          </div>
        </div>
      )}

      {/* What to order */}
      {(showEmpty || orderPlanValue) && (
        <div>
          <SectionLabel>What to order</SectionLabel>
          <FieldRow value={orderPlanValue} placeholder="What to order…"
            onSave={save("order_plan")} multiline hideWhenEmpty={hide} />
        </div>
      )}

      {/* Notes */}
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
