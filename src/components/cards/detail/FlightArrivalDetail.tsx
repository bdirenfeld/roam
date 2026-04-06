"use client";

import type { Card } from "@/types/database";
import FieldRow, { SectionLabel } from "./FieldRow";

interface Props {
  card: Card;
  onSaveDetails?: (field: string, value: unknown) => void;
  showEmpty?: boolean;
}

export default function FlightArrivalDetail({ card, onSaveDetails, showEmpty = false }: Props) {
  const d = card.details;
  const save = (field: string) =>
    onSaveDetails ? (v: string) => onSaveDetails(field, v || null) : undefined;
  const hide = !showEmpty;

  const hasFlightData = d.airline || d.flight_number || d.aircraft || d.origin_airport ||
    d.arriving_at || d.departure_time || d.arrival_time || d.duration || d.terminal ||
    d.seat || d.confirmation;

  return (
    <div className="space-y-6">
      {/* FLIGHT */}
      {(showEmpty || hasFlightData) && (
        <div>
          <SectionLabel>Flight</SectionLabel>
          <div className="space-y-4">
            <FieldRow icon="✈️" label="Airline" value={d.airline as string | undefined}
              placeholder="Add airline…" onSave={save("airline")} hideWhenEmpty={hide} />
            <FieldRow icon="🔢" label="Flight Number" value={d.flight_number as string | undefined}
              placeholder="e.g. AZ 123" onSave={save("flight_number")} hideWhenEmpty={hide} />
            <FieldRow icon="🛩️" label="Aircraft" value={d.aircraft as string | undefined}
              placeholder="Add aircraft…" onSave={save("aircraft")} hideWhenEmpty={hide} />
            <FieldRow icon="🛫" label="Departing From" value={d.origin_airport as string | undefined}
              placeholder="Add airport…" onSave={save("origin_airport")} hideWhenEmpty={hide} />
            <FieldRow icon="🛬" label="Arriving At" value={d.arriving_at as string | undefined}
              placeholder="Add airport…" onSave={save("arriving_at")} hideWhenEmpty={hide} />
            <FieldRow icon="🕐" label="Departure Time" value={d.departure_time as string | undefined}
              placeholder="Add departure time…" onSave={save("departure_time")} hideWhenEmpty={hide} />
            <FieldRow icon="🕐" label="Arrival Time" value={d.arrival_time as string | undefined}
              placeholder="Add arrival time…" onSave={save("arrival_time")} hideWhenEmpty={hide} />
            <FieldRow icon="⏱️" label="Duration" value={d.duration as string | undefined}
              placeholder="Add duration…" onSave={save("duration")} hideWhenEmpty={hide} />
            <FieldRow icon="🚪" label="Terminal" value={d.terminal as string | undefined}
              placeholder="Add terminal…" onSave={save("terminal")} hideWhenEmpty={hide} />
            <FieldRow icon="💺" label="Seat" value={d.seat as string | undefined}
              placeholder="Add seat…" onSave={save("seat")} hideWhenEmpty={hide} />
            <FieldRow icon="📋" label="Confirmation" value={d.confirmation as string | undefined}
              placeholder="Add confirmation code…" onSave={save("confirmation")} hideWhenEmpty={hide} />
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
