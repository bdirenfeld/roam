"use client";

import type { Card } from "@/types/database";
import FieldRow, { SectionLabel } from "./FieldRow";
import CostPerPersonRow from "./CostPerPersonRow";
import ArrayField from "./ArrayField";

interface Props {
  card: Card;
  onSaveDetails?: (field: string, value: unknown) => void;
  showEmpty?: boolean;
}

export default function EventDetail({ card, onSaveDetails, showEmpty = false }: Props) {
  const d = card.details as {
    cost_per_person?: number;
    venue?: string;
    gates_open?: string;
    what_to_bring?: string[];
    notes?: string;
  };
  const save = (field: string) =>
    onSaveDetails ? (v: string) => onSaveDetails(field, v || null) : undefined;
  const hide = !showEmpty;

  const whatToBring: string[] = Array.isArray(d.what_to_bring) ? (d.what_to_bring as string[]) : [];
  const hasEventData = d.venue || d.gates_open;

  return (
    <div className="space-y-6">
      {/* EVENT INFO */}
      {(showEmpty || hasEventData) && (
        <div>
          <SectionLabel>Event Info</SectionLabel>
          <div className="space-y-4">
            <FieldRow icon="🏟️" label="Venue" value={d.venue}
              placeholder="Add venue…" onSave={save("venue")} hideWhenEmpty={hide} />
            <FieldRow icon="🚪" label="Gates open" value={d.gates_open}
              placeholder="Add time gates open…" onSave={save("gates_open")} hideWhenEmpty={hide} />
          </div>
        </div>
      )}

      {/* WHAT TO BRING */}
      <ArrayField label="What to bring" items={whatToBring} placeholder="Nothing listed yet…"
        newItemPlaceholder="Add an item…"
        onSave={onSaveDetails ? (items) => onSaveDetails("what_to_bring", items) : undefined}
        bulletClass="bg-activity" hideWhenEmpty={hide} />

      {/* NOTES */}
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
