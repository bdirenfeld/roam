"use client";

import type { CardType } from "@/types/database";

interface Props {
  counts: Record<CardType, number>;
  active: Set<CardType>;
  onToggle: (type: CardType) => void;
}

const TYPES: { type: CardType; label: string; color: string; bg: string; activeBg: string }[] = [
  { type: "logistics", label: "Logistics", color: "text-logistics", bg: "bg-white",      activeBg: "bg-slate-100" },
  { type: "activity",  label: "Activity",  color: "text-activity",  bg: "bg-white",      activeBg: "bg-teal-50"   },
  { type: "food",      label: "Food",      color: "text-food",      bg: "bg-white",      activeBg: "bg-amber-50"  },
];

const DOT: Record<CardType, string> = {
  logistics: "bg-logistics",
  activity:  "bg-activity",
  food:      "bg-food",
};

export default function MapFilterBar({ counts, active, onToggle }: Props) {
  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 flex gap-2 bg-white/95 backdrop-blur-sm rounded-2xl px-2 py-2 shadow-sheet border border-gray-100">
      {TYPES.map(({ type, label, color, bg, activeBg }) => {
        const isActive = active.has(type);
        const count = counts[type] ?? 0;
        if (count === 0) return null;
        return (
          <button
            key={type}
            onClick={() => onToggle(type)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all duration-150 active:scale-95
              ${isActive ? activeBg : bg}
              ${isActive ? color : "text-gray-400"}
              border ${isActive ? "border-transparent" : "border-gray-100"}
            `}
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? DOT[type] : "bg-gray-300"}`} />
            <span className="text-xs font-semibold">{label}</span>
            <span className={`text-[10px] font-bold rounded-full px-1.5 py-px ${isActive ? "bg-white/70" : "bg-gray-100"}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
