"use client";

import type { CardType } from "@/types/database";
import { PIN_COLORS } from "@/lib/mapPins";

export type StatusFilter = "all" | "confirmed" | "ideas";

interface Props {
  counts: Record<CardType, number>;
  activeTypes: Set<CardType>;
  statusFilter: StatusFilter;
  onToggleType: (type: CardType) => void;
  onStatusChange: (s: StatusFilter) => void;
}

const TYPES: { type: CardType; label: string }[] = [
  { type: "logistics", label: "Logistics" },
  { type: "activity",  label: "Activity"  },
  { type: "food",      label: "Food"      },
];

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all",       label: "All"       },
  { value: "confirmed", label: "Confirmed" },
  { value: "ideas",     label: "Ideas"     },
];

export default function MapFilterBar({
  counts, activeTypes, statusFilter, onToggleType, onStatusChange,
}: Props) {
  const hasAny = TYPES.some(({ type }) => (counts[type] ?? 0) > 0);
  if (!hasAny) return null;

  return (
    <div className="absolute bottom-6 left-4 z-20 bg-white rounded-2xl shadow-sheet border border-gray-100 overflow-hidden w-52">
      {/* Status tabs */}
      <div className="flex border-b border-gray-100">
        {STATUS_TABS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onStatusChange(value)}
            className={`
              flex-1 py-2 text-[11px] font-semibold transition-colors
              ${statusFilter === value
                ? "text-gray-900 border-b-2 border-gray-800 -mb-px"
                : "text-gray-400 hover:text-gray-600"}
            `}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Type rows */}
      {TYPES.map(({ type, label }) => {
        const count = counts[type] ?? 0;
        if (count === 0) return null;
        const isActive = activeTypes.has(type);
        const color    = PIN_COLORS[type];

        return (
          <button
            key={type}
            onClick={() => onToggleType(type)}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5
              hover:bg-gray-50 transition-colors
              ${!isActive ? "opacity-40" : ""}
            `}
          >
            {/* Colour swatch */}
            <div
              className="w-3.5 h-3.5 rounded-full flex-shrink-0"
              style={{ background: isActive ? color : "#D1D5DB" }}
            />

            <span className="text-[13px] font-medium text-gray-800 flex-1 text-left">
              {label}
            </span>

            <span className="text-[11px] font-bold tabular-nums" style={{ color }}>
              {count}
            </span>

            {/* Check / circle toggle indicator */}
            <div
              className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors"
              style={
                isActive
                  ? { background: color, borderColor: color }
                  : { background: "transparent", borderColor: "#D1D5DB" }
              }
            >
              {isActive && (
                <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                  <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
