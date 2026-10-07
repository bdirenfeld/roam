"use client";

import type { Card } from "@/types/database";
import FieldRow, { SectionLabel } from "./FieldRow";
import CostPerPersonRow from "./CostPerPersonRow";

interface Props {
  card: Card;
  onSaveDetails?: (field: string, value: unknown) => void;
  showEmpty?: boolean;
}

export default function ChallengeDetail({ card, onSaveDetails, showEmpty = false }: Props) {
  const d = card.details as {
    cost_per_person?: number; notes?: string };
  const save = (field: string) =>
    onSaveDetails ? (v: string) => onSaveDetails(field, v || null) : undefined;
  const hide = !showEmpty;

  return (
    <div className="space-y-6">
      {(showEmpty || d.notes) && (
        <div>
          {/* No "Notes" label while reading (6 Oct 2026): the note is plainly the note. Kept in the Add details form beside the other labelled fields. */}
          {showEmpty && <SectionLabel>Notes</SectionLabel>}
          <FieldRow value={d.notes} placeholder="Add a note…"
            onSave={save("notes")} multiline hideWhenEmpty={hide} />
        </div>
      )}
      {/* Cost per person — what the Estimate's Excursions line adds up.
          Typed in the currency you were quoted in. */}
      {(showEmpty || d.cost_per_person != null) && (
        <div>
          <SectionLabel>Cost</SectionLabel>
          <CostPerPersonRow card={card} onSaveDetails={onSaveDetails} hideWhenEmpty={hide} />
        </div>
      )}
    </div>
  );
}
