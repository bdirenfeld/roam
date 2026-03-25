"use client";

import type { Card } from "@/types/database";

export type PlacementFilter = "all" | "placed" | "unplaced";

// ── Sub-type groups shown in the sidebar ─────────────────────
interface SubTypeRow {
  label: string;
  /** All sub_type values this toggle controls */
  subTypes: string[];
}

interface Group {
  label: string;
  color: string;
  rows: SubTypeRow[];
}

const GROUPS: Group[] = [
  {
    label: "Activity",
    color: "#0D9488",
    rows: [
      { label: "Guided",        subTypes: ["guided", "hosted"] },
      { label: "Self-directed", subTypes: ["self_directed"] },
      { label: "Wellness",      subTypes: ["wellness"] },
      { label: "Challenge",     subTypes: ["challenge"] },
      { label: "Event",         subTypes: ["event"] },
    ],
  },
  {
    label: "Food",
    color: "#F59E0B",
    rows: [
      { label: "Restaurant",   subTypes: ["restaurant", "fine_dining", "street_food"] },
      { label: "Coffee",       subTypes: ["coffee", "coffee_dessert"] },
      { label: "Cocktail Bar", subTypes: ["cocktail_bar", "drinks"] },
    ],
  },
  {
    label: "Logistics",
    color: "#64748B",
    rows: [
      { label: "Hotel",  subTypes: ["hotel"] },
      { label: "Flight", subTypes: ["flight_arrival", "flight_departure"] },
    ],
  },
];

interface Props {
  cards: Card[];
  activeSubTypes: Set<string>;
  setActiveSubTypes: (next: Set<string>) => void;
  placementFilter: PlacementFilter;
  setPlacementFilter: (f: PlacementFilter) => void;
}

// ── Toggle switch ─────────────────────────────────────────────
function Toggle({ on, color, onToggle }: { on: boolean; color: string; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="relative flex-shrink-0 w-9 h-5 rounded-full transition-colors duration-200"
      style={{ background: on ? color : "#D1D5DB" }}
      aria-checked={on}
      role="switch"
    >
      <span
        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200"
        style={{ transform: on ? "translateX(18px)" : "translateX(2px)" }}
      />
    </button>
  );
}

export default function MapSidebar({
  cards,
  activeSubTypes,
  setActiveSubTypes,
  placementFilter,
  setPlacementFilter,
}: Props) {
  function isRowOn(row: SubTypeRow): boolean {
    return row.subTypes.some((st) => activeSubTypes.has(st));
  }

  function toggleRow(row: SubTypeRow) {
    const next = new Set(activeSubTypes);
    if (isRowOn(row)) {
      row.subTypes.forEach((st) => next.delete(st));
    } else {
      row.subTypes.forEach((st) => next.add(st));
    }
    setActiveSubTypes(next);
  }

  function countForRow(row: SubTypeRow): number {
    return cards.filter((c) => c.sub_type && row.subTypes.includes(c.sub_type)).length;
  }

  const PLACEMENT_OPTIONS: { value: PlacementFilter; label: string }[] = [
    { value: "all",      label: "All" },
    { value: "placed",   label: "Placed" },
    { value: "unplaced", label: "Unplaced" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Status</p>
        <div className="flex rounded-xl overflow-hidden border border-gray-100">
          {PLACEMENT_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setPlacementFilter(value)}
              className={`flex-1 py-2 text-[12px] font-semibold transition-colors ${
                placementFilter === value
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Layer groups ── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
        {GROUPS.map((group) => (
          <div key={group.label}>
            {/* Group header */}
            <div className="flex items-center gap-2 mb-3">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: group.color }}
              />
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                {group.label}
              </p>
            </div>

            {/* Toggle rows */}
            <div className="space-y-1">
              {group.rows.map((row) => {
                const on    = isRowOn(row);
                const count = countForRow(row);
                return (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => toggleRow(row)}
                  >
                    <Toggle on={on} color={group.color} onToggle={() => toggleRow(row)} />
                    <span
                      className="flex-1 text-[13px] font-medium"
                      style={{ color: on ? "#111827" : "#9CA3AF" }}
                    >
                      {row.label}
                    </span>
                    {count > 0 && (
                      <span
                        className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center"
                        style={{
                          background: on ? `${group.color}18` : "#F3F4F6",
                          color: on ? group.color : "#9CA3AF",
                        }}
                      >
                        {count}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
