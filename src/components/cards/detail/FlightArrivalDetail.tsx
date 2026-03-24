"use client";

import type { Card } from "@/types/database";
import FieldRow, { SectionLabel } from "./FieldRow";

interface Props {
  card: Card;
  onSaveDetails?: (field: string, value: unknown) => void;
}

export default function FlightArrivalDetail({ card, onSaveDetails }: Props) {
  const d = card.details;
  const save = (field: string) =>
    onSaveDetails ? (v: string) => onSaveDetails(field, v || null) : undefined;

  return (
    <div className="space-y-6">
      {/* FLIGHT */}
      <div>
        <SectionLabel>Flight</SectionLabel>
        <div className="space-y-4">
          <FieldRow
            icon="✈️"
            label="Airline"
            value={d.airline as string | undefined}
            placeholder="Add airline…"
            onSave={save("airline")}
          />
          <FieldRow
            icon="🛬"
            label="Arriving at"
            value={d.arrival_airport as string | undefined}
            placeholder="Add airport…"
            onSave={save("arrival_airport")}
          />
          <FieldRow
            icon="🔢"
            label="Flight number"
            value={d.flight_number as string | undefined}
            placeholder="e.g. AZ 123"
            onSave={save("flight_number")}
          />
          <FieldRow
            icon="🚪"
            label="Terminal"
            value={d.terminal as string | undefined}
            placeholder="Add terminal…"
            onSave={save("terminal")}
          />
          <FieldRow
            icon="📋"
            label="Confirmation"
            value={d.confirmation as string | undefined}
            placeholder="Add confirmation code…"
            onSave={save("confirmation")}
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
