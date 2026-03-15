/**
 * /trips/new — Trip creation flow (Step 7).
 * This placeholder keeps navigation working so the list screen
 * is fully functional before the creation flow is built.
 */
import Link from "next/link";
import AppHeader from "@/components/ui/AppHeader";

const QUESTIONS = [
  "Where are you going?",
  "When are you leaving?",
  "Who's coming with you?",
  "Where are you staying?",
  "What kind of trip is this?",
  "What's this trip for?",
];

export default function NewTripPage() {
  return (
    <div>
      <AppHeader />

      <div className="px-4 pt-6">
        {/* Back */}
        <Link
          href="/trips"
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 font-medium mb-6 hover:text-gray-600 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </Link>

        <h1 className="text-xl font-bold text-gray-900 mb-1">Plan a new trip</h1>
        <p className="text-sm text-gray-400 mb-8">
          Coming in Step 7 — conversational one-question-at-a-time flow.
        </p>

        {/* Preview of the questions */}
        <div className="space-y-3">
          {QUESTIONS.map((q, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-100 bg-gray-50 opacity-50"
            >
              <span className="w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[11px] font-bold text-gray-400 shrink-0">
                {i + 1}
              </span>
              <span className="text-sm text-gray-500">{q}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
