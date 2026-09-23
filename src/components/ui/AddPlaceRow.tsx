"use client";

// ── The one "Add a place" ─────────────────────────────────────────────────
// A quiet row: a ringed plus and the words, at the bottom of whatever list
// it adds to, with no rule of its own — the list above already ends in one.
// It replaced three controls doing one job — plain text under
// the Agenda, a dashed box on Plan, a dark pill on a new journey (Brennan,
// Sep 2026: one look). The dark pill is for a screen's one primary action.

export default function AddPlaceRow({
  onClick,
  /** The empty state: centred, no rule above. */
  centered = false,
  className = "",
}: {
  onClick: () => void;
  centered?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-5 py-[13px] text-[14px] text-[#1A1A2E] active:opacity-70 transition-opacity ${centered ? "justify-center" : ""} ${className}`}
    >
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-[14px] leading-none flex-shrink-0"
        style={{ border: "1.5px solid rgba(26,26,46,0.35)", color: "rgba(26,26,46,0.5)" }}
      >
        +
      </span>
      Add a place
    </button>
  );
}
