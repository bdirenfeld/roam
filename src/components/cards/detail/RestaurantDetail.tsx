"use client";

import type { Card } from "@/types/database";
import FieldRow, { SectionLabel } from "./FieldRow";

interface Props {
  card: Card;
  onSaveDetails?: (field: string, value: unknown) => void;
  showEmpty?: boolean;
}

export default function RestaurantDetail({ card, onSaveDetails, showEmpty = false }: Props) {
  const d = card.details;
  const save = (field: string) =>
    onSaveDetails ? (v: string) => onSaveDetails(field, v || null) : undefined;
  const hide = !showEmpty;

  // Normalise order_plan — stored as string or string[]
  const rawOrderPlan = d.order_plan;
  const orderPlanValue = Array.isArray(rawOrderPlan)
    ? (rawOrderPlan as string[]).join(", ")
    : (rawOrderPlan as string | undefined);

  return (
    <div className="space-y-6">
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
