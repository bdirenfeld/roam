"use client";

import { useState, type ReactNode } from "react";
import { CaretDown } from "@phosphor-icons/react";

/**
 * A folded section on the Journeys page.
 *
 * This used to be the page's divider — a centred label with a hairline either
 * side — which read correctly when the section below was always open, because
 * the rules were separating content. Collapsed there is nothing to separate,
 * and the rules made a button look like a divider. Plain left-aligned label
 * and a caret instead. No count: whether there are four or forty past
 * journeys isn't a thing you need to know before deciding to look.
 */
export default function CollapsibleSection({
  label,
  children,
  defaultOpen = false,
  className = "mt-7 mb-3 md:mt-10",
}: {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 ${className}`}
        aria-expanded={open}
      >
        <span
          className="font-display italic text-sm md:text-[15px]"
          style={{ color: "rgba(26,26,46,0.55)" }}
        >
          {label}
        </span>
        <CaretDown
          size={11}
          weight="bold"
          color="#B8B4AC"
          style={{
            transform: open ? "none" : "rotate(-90deg)",
            transition: "transform 140ms",
          }}
        />
      </button>
      {open && children}
    </>
  );
}
