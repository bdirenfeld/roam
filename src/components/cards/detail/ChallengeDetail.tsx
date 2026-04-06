"use client";

import type { Card } from "@/types/database";
import FieldRow, { SectionLabel } from "./FieldRow";
import ArrayField from "./ArrayField";

interface Props {
  card: Card;
  onSaveDetails?: (field: string, value: unknown) => void;
  showEmpty?: boolean;
}

export default function ChallengeDetail({ card, onSaveDetails, showEmpty = false }: Props) {
  const d = card.details as {
    supplier?: string;
    what_to_bring?: string[];
    prep?: string;
    post?: string;
    notes?: string;
  };
  const save = (field: string) =>
    onSaveDetails ? (v: string) => onSaveDetails(field, v || null) : undefined;
  const hide = !showEmpty;

  const whatToBring: string[] = Array.isArray(d.what_to_bring) ? (d.what_to_bring as string[]) : [];

  return (
    <div className="space-y-6">
      {/* ORGANIZER */}
      {(showEmpty || d.supplier) && (
        <div>
          <SectionLabel>Organizer</SectionLabel>
          <FieldRow icon="🏢" label="Organizer" value={d.supplier}
            placeholder="Add organizer…" onSave={save("supplier")} hideWhenEmpty={hide} />
        </div>
      )}

      {/* WHAT TO BRING */}
      <ArrayField label="What to Bring" items={whatToBring} placeholder="Nothing listed yet…"
        newItemPlaceholder="Add an item…"
        onSave={onSaveDetails ? (items) => onSaveDetails("what_to_bring", items) : undefined}
        bulletClass="bg-activity" hideWhenEmpty={hide} />

      {/* PREP */}
      {(showEmpty || d.prep) && (
        <div>
          <SectionLabel>Before you go</SectionLabel>
          <FieldRow value={d.prep} placeholder="Add prep notes…"
            onSave={save("prep")} multiline hideWhenEmpty={hide} />
        </div>
      )}

      {/* AFTER */}
      {(showEmpty || d.post) && (
        <div>
          <SectionLabel>After</SectionLabel>
          <FieldRow value={d.post} placeholder="Add post notes…"
            onSave={save("post")} multiline hideWhenEmpty={hide} />
        </div>
      )}

      {/* NOTES */}
      {(showEmpty || d.notes) && (
        <div>
          <SectionLabel>Notes</SectionLabel>
          <FieldRow value={d.notes} placeholder="Add notes…"
            onSave={save("notes")} multiline hideWhenEmpty={hide} />
        </div>
      )}
    </div>
  );
}
