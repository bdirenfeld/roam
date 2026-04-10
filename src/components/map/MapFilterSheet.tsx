"use client";

import type { CardType } from "@/types/database";

interface Props {
  activeTypes: Set<CardType>;
  activeStatuses: Set<string>;
  onTypesChange: (next: Set<CardType>) => void;
  onStatusesChange: (next: Set<string>) => void;
  onClose: () => void;
}

const CATEGORY_ROWS: { label: string; typeKey: CardType }[] = [
  { label: "Activity", typeKey: "activity"  },
  { label: "Food",     typeKey: "food"      },
  { label: "Stay",     typeKey: "logistics" },
];

// 28×16 px pill toggle
function PillToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} aria-pressed={on} className="flex-shrink-0">
      <div
        className="relative rounded-full transition-colors duration-200"
        style={{ width: 28, height: 16, background: on ? "#1A1A2E" : "#D1D5DB" }}
      >
        <div
          className="absolute top-0.5 rounded-full bg-white shadow-sm transition-transform duration-200"
          style={{ width: 12, height: 12, transform: on ? "translateX(14px)" : "translateX(2px)" }}
        />
      </div>
    </button>
  );
}

export default function MapFilterSheet({
  activeTypes,
  activeStatuses,
  onTypesChange,
  onStatusesChange,
  onClose,
}: Props) {
  function toggleStatus(status: string) {
    const next = new Set(activeStatuses);
    if (next.has(status)) next.delete(status); else next.add(status);
    onStatusesChange(next);
  }

  function toggleType(typeKey: CardType) {
    const next = new Set(activeTypes);
    if (next.has(typeKey)) next.delete(typeKey); else next.add(typeKey);
    onTypesChange(next);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="relative w-full max-w-mobile mx-auto rounded-t-2xl shadow-sheet max-h-[80dvh] flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ background: "rgba(255,255,255,0.97)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-8 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <span className="text-sm font-semibold text-gray-900">Filter</span>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-8">
          {/* Status section */}
          <p className="text-[9px] tracking-[0.14em] uppercase font-medium text-gray-400 mb-3">Status</p>
          <div className="flex items-center gap-2 mb-5">
            {(
              [
                { status: "interested",   label: "Interested", hollow: true  },
                { status: "in_itinerary", label: "Scheduled",  hollow: false },
              ] as Array<{ status: string; label: string; hollow: boolean }>
            ).map(({ status, label, hollow }) => {
              const isActive = activeStatuses.has(status);
              return (
                <button
                  key={status}
                  onClick={() => toggleStatus(status)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all border"
                  style={
                    isActive
                      ? { background: "#6B728015", color: "#374151", borderColor: "#6B7280" }
                      : { background: "transparent", color: "#9CA3AF", borderColor: "#D1D5DB" }
                  }
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%", display: "inline-block", flexShrink: 0,
                    ...(isActive
                      ? (hollow ? { border: "1.5px solid #6B7280" } : { background: "#6B7280" })
                      : { background: "#D1D5DB" }
                    ),
                  }} />
                  {label}
                </button>
              );
            })}
          </div>

          <hr className="border-t border-gray-100 mb-5" />

          {/* Category section */}
          <p className="text-[9px] tracking-[0.14em] uppercase font-medium text-gray-400 mb-3">Categories</p>
          <div className="space-y-4">
            {CATEGORY_ROWS.map(({ label, typeKey }) => (
              <div key={typeKey} className="flex items-center justify-between">
                <span className="text-[9px] tracking-[0.14em] uppercase font-medium text-gray-500">
                  {label}
                </span>
                <PillToggle
                  on={activeTypes.has(typeKey)}
                  onToggle={() => toggleType(typeKey)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
