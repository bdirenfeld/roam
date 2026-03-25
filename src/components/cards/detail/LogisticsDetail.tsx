import type { Card } from "@/types/database";

interface Props { card: Card }

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em] mb-2">{children}</p>;
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-base flex-shrink-0 w-5 text-center">{icon}</span>
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold text-gray-800 mt-0.5">{value}</p>
      </div>
    </div>
  );
}

export default function LogisticsDetail({ card }: Props) {
  const d = card.details as {
    airline?: string;
    arrival_airport?: string;
    arrival_time?: string;
    departure_airport?: string;
    departure_time?: string;
    transport_to_accommodation?: string;
    estimated_accommodation_arrival?: string;
    leave_accommodation_time?: string;
    arrive_airport_time?: string;
    notes?: string;
  };
  const isArrival = card.sub_type === "flight_arrival";
  const isDeparture = card.sub_type === "flight_departure";

  return (
    <div className="space-y-6">
      {/* Flight info */}
      {d.airline && (
        <div>
          <SectionLabel>Flight</SectionLabel>
          <div className="space-y-3">
            <Row icon="✈️" label="Airline" value={d.airline as string} />
            {isArrival && d.arrival_airport && (
              <Row icon="🛬" label="Arriving at" value={d.arrival_airport as string} />
            )}
            {isArrival && d.arrival_time && (
              <Row icon="🕐" label="Landing" value={d.arrival_time as string} />
            )}
            {isDeparture && d.departure_airport && (
              <Row icon="🛫" label="Departing from" value={d.departure_airport as string} />
            )}
            {isDeparture && d.departure_time && (
              <Row icon="🕐" label="Take off" value={d.departure_time as string} />
            )}
            {isDeparture && d.arrival_airport && (
              <Row icon="🛬" label="Arriving at" value={d.arrival_airport as string} />
            )}
          </div>
        </div>
      )}

      {/* On arrival */}
      {isArrival && d.transport_to_accommodation && (
        <div>
          <SectionLabel>Getting to your hotel</SectionLabel>
          <div className="space-y-3">
            <Row icon="🚕" label="How" value={d.transport_to_accommodation as string} />
            {d.estimated_accommodation_arrival && (
              <Row icon="🏨" label="Arrive by" value={d.estimated_accommodation_arrival as string} />
            )}
          </div>
        </div>
      )}

      {/* Day of departure checklist */}
      {isDeparture && (d.leave_accommodation_time || d.arrive_airport_time) && (
        <div>
          <SectionLabel>Day of departure</SectionLabel>
          <div className="space-y-0 mt-1">
            {d.leave_accommodation_time && (
              <TimelineRow time={d.leave_accommodation_time as string} label="Leave hotel" last={!d.arrive_airport_time} />
            )}
            {d.arrive_airport_time && (
              <TimelineRow time={d.arrive_airport_time as string} label="Arrive at airport" last={!d.departure_time} />
            )}
            {d.departure_time && (
              <TimelineRow time={d.departure_time as string} label={`${(d.airline as string) ?? "Flight"} departs`} last />
            )}
          </div>
        </div>
      )}
      {/* Notes */}
      {d.notes && (
        <div>
          <SectionLabel>Notes</SectionLabel>
          <p className="text-sm text-gray-700 mt-1.5 leading-relaxed">{d.notes as string}</p>
        </div>
      )}
    </div>
  );
}

function TimelineRow({ time, label, last }: { time: string; label: string; last?: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center w-10 flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-logistics mt-1.5 flex-shrink-0" />
        {!last && <div className="w-px flex-1 bg-gray-100 mt-1" style={{ minHeight: 24 }} />}
      </div>
      <div className="pb-4 flex-1">
        <span className="text-[11px] font-bold text-logistics">{time}</span>
        <p className="text-sm font-semibold text-gray-800 mt-0.5">{label}</p>
      </div>
    </div>
  );
}
