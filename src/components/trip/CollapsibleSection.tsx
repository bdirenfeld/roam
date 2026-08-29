"use client";

import { useState, type ReactNode } from "react";
import { CaretDown } from "@phosphor-icons/react";

/**
 * The divider-with-a-label the Journeys page already used, made to fold.
 *
 * Past journeys and Archive both grow without limit — at fifty trips they are
 * a wall you scroll past to reach the two you care about. Collapsed by default
 * with the count on the rule: the section says how much is in it without
 * spending the screen.
 */
export default function CollapsibleSection({
  label,
  count,
  children,
  defaultOpen = false,
  className = "mt-6 mb-3 md:mt-10 md:mb-3.5",
}: {
  label: string;
  count: number;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-3 md:gap-4 ${className}`}
        aria-expanded={open}
      >
        <div className="flex-1" style={{ height: "0.5px", background: "#E8E3DA" }} />
        <span
          className="font-display italic flex items-center gap-1.5 text-sm md:text-[15px]"
          style={{ color: "rgba(26,26,46,0.55)" }}
        >
          {label}
          <span style={{ color: "#B8B4AC" }}>{count}</span>
          <CaretDown
            size={11}
            weight="bold"
            color="#B8B4AC"
            style={{
              transform: open ? "none" : "rotate(-90deg)",
              transition: "transform 140ms",
            }}
          />
        </span>
        <div className="flex-1" style={{ height: "0.5px", background: "#E8E3DA" }} />
      </button>
      {open && children}
    </>
  );
}
