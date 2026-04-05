"use client";

import type { Card } from "@/types/database";
import FieldRow, { SectionLabel } from "./FieldRow";

interface Props {
  card: Card;
  onSaveDetails?: (field: string, value: unknown) => void;
}

export default function RestaurantDetail({ card, onSaveDetails }: Props) {
  const d = card.details;
  const save = (field: string) =>
    onSaveDetails ? (v: string) => onSaveDetails(field, v || null) : undefined;

  // order_plan may be a string or string[]
  const rawOrderPlan = d.order_plan;
  const orderPlanItems: string[] = Array.isArray(rawOrderPlan)
    ? (rawOrderPlan as string[])
    : rawOrderPlan
    ? [rawOrderPlan as string]
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

        </div>
      </div>

      {/* DETAILS */}
      <div>
        <SectionLabel>Details</SectionLabel>
        <div className="space-y-4">
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
            icon="💳"
            label="Estimated cost"
            value={d.estimated_cost as string | undefined}
            placeholder="e.g. €35–50 pp"
            onSave={save("estimated_cost")}
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
