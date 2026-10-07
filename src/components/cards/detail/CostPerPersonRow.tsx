"use client";

import { createContext, useContext } from "react";
import type { Card } from "@/types/database";
import { currencyForDestination, SYMBOL } from "@/lib/budget/currency";
import FieldRow from "./FieldRow";

/**
 * Where the journey goes and how many travel, set by the card sheet, so the
 * cost row can say what the Estimate will count (7 Oct 2026).
 */
export const CostContext = createContext<{ destination?: string | null; partySize?: number | null }>({});

/** The destination's money sign ("€"), or "" when the currency is unknown. */
export function costSymbol(destination: string | null | undefined): string {
  const code = currencyForDestination(destination);
  return code ? SYMBOL[code] ?? "" : "";
}

/** 58 → "58"; 36.75 → "36.75". */
function money(n: number): string {
  const cents = Math.round(n * 100) / 100;
  return Number.isInteger(cents) ? String(cents) : cents.toFixed(2);
}

/**
 * The shared "Cost per person" row (Tour / Explore / Event / Race / Wellness
 * and the catch-all activity layout). It printed a bare "29" (7 Oct 2026); the
 * Estimate reads details.cost_per_person in the destination's currency × the
 * number paying — details.cost_people, else the party (lib/budget/load.ts) —
 * so the row now says "€29  × 2 = €58". Editing is unchanged.
 */
export default function CostPerPersonRow({ card, onSaveDetails, hideWhenEmpty }: {
  card: Card;
  onSaveDetails?: (field: string, value: unknown) => void;
  hideWhenEmpty?: boolean;
}) {
  const { destination, partySize } = useContext(CostContext);
  const d = card.details as { cost_per_person?: number; cost_people?: number };
  const symbol = costSymbol(destination);
  const people = typeof d.cost_people === "number" && d.cost_people >= 0 ? d.cost_people : partySize ?? null;
  const cost = typeof d.cost_per_person === "number" && Number.isFinite(d.cost_per_person) ? d.cost_per_person : null;
  const aside = cost != null && people != null ? `× ${people} = ${symbol}${money(cost * people)}` : undefined;

  return (
    <FieldRow icon="💳" label="Cost per person"
      value={d.cost_per_person != null ? String(d.cost_per_person) : undefined}
      placeholder="Add cost…"
      prefix={symbol || undefined}
      aside={aside}
      onSave={onSaveDetails ? (v) => onSaveDetails("cost_per_person", v ? parseFloat(v) : null) : undefined}
      hideWhenEmpty={hideWhenEmpty} />
  );
}
