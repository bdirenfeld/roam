import type { Card } from "@/types/database";

import FieldRow from "./FieldRow";
import CostPerPersonRow from "./CostPerPersonRow";
import { toStringList } from "@/lib/cardDetails";

// Notes are editable here too (3 Oct 2026): this fallback layout printed them
// read-only, so a Shopping card's Plan my trip note couldn't be changed on the
// phone, and it showed raw **asterisks** with no line breaks.
interface Props { card: Card; onSaveDetails?: (field: string, value: unknown) => void; showEmpty?: boolean }

export default function ActivityDetail({ card, onSaveDetails, showEmpty = false }: Props) {
  const d = card.details as {
    supplier?: string;
    meeting_point?: string;
    meeting_time?: string;
    cost_per_person?: number;
    currency?: string;
    card_used?: string;
    refundable?: boolean;
    cancellation_deadline?: string;
    treatment_type?: string;
    duration_minutes?: number;
    goal?: string;
    prep?: string;
    flow?: unknown;
    post?: string;
    ai_enriched?: { energy_level?: string; tips?: unknown };
    notes?: string;
  };
  // flow is a list of step strings, but 21 imported cards stored one string and
  // this sheet crashed on .map (19 Nov 2026). toStringList accepts either.
  const flow = toStringList(d.flow);
  const ai = d.ai_enriched;
  const tips = toStringList(ai?.tips);

  return (
    <div className="space-y-6">
      {/* Booking info */}
      {/* Cost is editable here too (7 Oct 2026, taps audit): this fallback layout
          (no kind picked, Shopping, Camp) only printed it, and Add details offered
          no cost field, so the Estimate never counted it. Same "Cost per person"
          row as Tour / Explore / Event / Race / Wellness. */}
      {(showEmpty || d.supplier || d.meeting_point || d.cost_per_person != null) && (
        <Section label="Booking">
          {d.supplier && <Row icon="🏢" label="With" value={d.supplier as string} />}
          <CostPerPersonRow card={card} onSaveDetails={onSaveDetails} hideWhenEmpty={!showEmpty} />
          {d.card_used && <Row icon="🏦" label="Paid with" value={d.card_used as string} />}
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
      {(d.treatment_type || d.duration_minutes || d.goal) && (
        <Section label="Treatment">
          {d.treatment_type && <Row icon="💆" label="Type" value={d.treatment_type as string} />}
          {d.duration_minutes && <Row icon="⏱️" label="Duration" value={`${d.duration_minutes as number} minutes`} />}
          {d.goal && <Row icon="🎯" label="Goal" value={d.goal as string} />}
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
      {flow.length > 0 && (
        <div>
          <SectionLabel>The plan</SectionLabel>
          <div className="mt-2 space-y-0">
            {flow.map((step, i) => (
              <div key={i} className="flex gap-3">
                {/* Timeline spine */}
                <div className="flex flex-col items-center w-4 flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-activity mt-1.5 z-10 flex-shrink-0" />
                  {i < flow.length - 1 && (
                    <div className="w-px flex-1 bg-gray-100 mt-1 mb-0" style={{ minHeight: 16 }} />
                  )}
                </div>
                <p className="pb-3 flex-1 min-w-0 text-sm text-gray-700 leading-relaxed whitespace-pre-line">{step}</p>
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

      {/* Notes */}
      {(showEmpty || d.notes) && (
        <div>
          {/* No "Notes" label while reading (6 Oct 2026): the note is plainly the note. Kept in the Add details form beside the other labelled fields. */}
          {showEmpty && <SectionLabel>Notes</SectionLabel>}
          <FieldRow value={d.notes as string | undefined} placeholder="Add a note…"
            onSave={onSaveDetails ? (v: string) => onSaveDetails("notes", v || null) : undefined} multiline hideWhenEmpty={!showEmpty} />
        </div>
      )}

      {/* Energy + Tips */}
      {(ai?.energy_level || tips.length > 0) && (
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
          {tips.length > 0 && (
            <ul className="space-y-2">
              {tips.map((tip, i) => (
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
    <p className="text-[14.5px] font-semibold text-[#1A1A2E]">{children}</p>
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
        <p className="text-[12.5px] font-medium text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-800 mt-0.5 leading-snug">{value}</p>
      </div>
    </div>
  );
}
