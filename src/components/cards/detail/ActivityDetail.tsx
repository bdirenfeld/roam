import type { Card } from "@/types/database";

interface Props { card: Card }

export default function ActivityDetail({ card }: Props) {
  const d = card.details;
  const flow = d.flow as Array<{ card?: Card }> | undefined;
  const ai = d.ai_enriched as { energy_level?: string; tips?: string[] } | undefined;

  return (
    <div className="space-y-6">
      {/* Booking info */}
      {(d.supplier || d.meeting_point || d.cost_per_person != null) && (
        <Section label="Booking">
          {d.supplier && <Row icon="🏢" label="With" value={d.supplier as string} />}
          {d.cost_per_person != null && (
            <Row
              icon="💳"
              label="Cost"
              value={`${d.currency ?? ""} ${d.cost_per_person as number}${d.card_used ? ` · ${d.card_used as string}` : ""}`}
            />
          )}
          {d.meeting_point && <Row icon="📍" label="Meet at" value={d.meeting_point as string} />}
          {d.meeting_time && <Row icon="⏰" label="Meet by" value={d.meeting_time as string} />}
          {d.refundable != null && (
            <Row
              icon={d.refundable ? "✅" : "⚠️"}
              label="Cancellation"
              value={
                d.refundable
                  ? `Refundable${d.cancellation_deadline ? ` (${d.cancellation_deadline as string})` : ""}`
                  : "Non-refundable"
              }
            />
          )}
        </Section>
      )}

      {/* Wellness specific */}
      {(d.treatment_type || d.duration_minutes) && (
        <Section label="Treatment">
          {d.treatment_type && <Row icon="💆" label="Type" value={d.treatment_type as string} />}
          {d.duration_minutes && <Row icon="⏱️" label="Duration" value={`${d.duration_minutes as number} minutes`} />}
        </Section>
      )}

      {/* Prep */}
      {d.prep && (
        <div>
          <SectionLabel>Before you go</SectionLabel>
          <p className="text-sm text-gray-700 leading-relaxed mt-1.5">{d.prep as string}</p>
        </div>
      )}

      {/* Flow — visual timeline */}
      {flow && flow.length > 0 && (
        <div>
          <SectionLabel>The plan</SectionLabel>
          <div className="mt-2 space-y-0">
            {flow.map((step, i) => (
              <div key={i} className="flex gap-3">
                {/* Timeline spine */}
                <div className="flex flex-col items-center w-10 flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-activity mt-1.5 z-10 flex-shrink-0" />
                  {i < flow.length - 1 && (
                    <div className="w-px flex-1 bg-gray-100 mt-1 mb-0" style={{ minHeight: 24 }} />
                  )}
                </div>
                {/* Content */}
                <div className="pb-4 flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] font-bold text-activity">{step.card?.start_time}</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-800 leading-snug mt-0.5">{step.card?.sub_type}</p>
                  {step.card?.details?.notes && (
                    <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{step.card?.details?.notes as string}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* After */}
      {d.post && (
        <div>
          <SectionLabel>After</SectionLabel>
          <p className="text-sm text-gray-700 mt-1.5">{d.post as string}</p>
        </div>
      )}

      {/* Energy + Tips */}
      {(ai?.energy_level || (ai?.tips && ai.tips.length > 0)) && (
        <div>
          <SectionLabel>Tips</SectionLabel>
          {ai?.energy_level && (
            <div className="flex items-center gap-2 mt-1.5 mb-3">
              <span className="text-xs text-gray-400">Energy required:</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${
                ai.energy_level === "low"    ? "bg-teal-50 text-activity" :
                ai.energy_level === "medium" ? "bg-amber-50 text-food" :
                                               "bg-red-50 text-red-500"
              }`}>
                {ai.energy_level}
              </span>
            </div>
          )}
          {ai?.tips && (
            <ul className="space-y-2">
              {ai.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-activity font-bold mt-0.5 flex-shrink-0">·</span>
                  {tip}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em]">{children}</p>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-2 space-y-3">{children}</div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-base flex-shrink-0 w-5 text-center">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm font-medium text-gray-800 mt-0.5 leading-snug">{value}</p>
      </div>
    </div>
  );
}
