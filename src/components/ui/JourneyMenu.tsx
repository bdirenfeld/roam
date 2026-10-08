"use client";

import type { ReactNode } from "react";
import { useEscapeKey } from "@/hooks/useEscapeKey";

/**
 * The ⋯ menu on a journey (7 Oct 2026, copy to new dates): the upcoming card
 * and the past journeys' rows open the same one, so "Copy to new dates /
 * Archive / Delete…" reads and fits the same in both places. Every row is
 * 44px tall for the finger.
 */
export interface JourneyMenuItem {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** Delete is the only red row. */
  danger?: boolean;
}

export default function JourneyMenu({ items, onClose, className = "absolute top-10 right-2" }: { items: JourneyMenuItem[]; onClose: () => void; className?: string }) {
  useEscapeKey(onClose);
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div
        className={`${className} z-30 w-[196px] bg-white rounded-xl overflow-hidden`}
        role="menu"
        style={{ border: "1px solid rgba(26,26,46,0.08)", boxShadow: "0 8px 30px rgba(26,26,46,0.18)" }}
      >
        {items.map((it, i) => (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            onClick={() => { onClose(); it.onSelect(); }}
            className={`w-full min-h-[44px] flex items-center gap-2.5 px-3.5 text-[13px] text-left transition-colors ${
              it.danger ? "text-red-500 hover:bg-red-50" : "text-gray-800 hover:bg-gray-50"
            } ${i > 0 ? "border-t border-black/5" : ""}`}
          >
            {it.icon}
            {it.label}
          </button>
        ))}
      </div>
    </>
  );
}
