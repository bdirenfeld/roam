"use client";

// What is it? The week's empty hour, clicked (26 Nov 2026, clickable mock
// approved). Brennan's order of thought: first which hour, then "what is the
// thing that I want to do", then the card for that type. So the click no
// longer drops a text box with one hidden rule (Enter makes a note) and a
// Travel row under it; it asks, in the app's own three types plus Travel, and
// keeps the old box as a quiet Note. Activity / Food / Logistics open the card
// he already has, blank; Travel opens Add travel. Nothing new to learn after this menu.

export type HourMenuPick = "activity" | "food" | "logistics" | "travel" | "note";

const ITEMS: { key: HourMenuPick; label: string; glyph: string }[] = [
  { key: "activity", label: "Activity", glyph: "directions_walk" },
  { key: "food", label: "Food", glyph: "restaurant" },
  { key: "logistics", label: "Logistics", glyph: "luggage" },
  { key: "travel", label: "Travel", glyph: "directions_car" },
];

export default function WeekHourMenu({ when, up, right, onPick, onClose }: {
  /** "Wed · 11:00 AM", said at the top so the hour is never in doubt. */
  when: string;
  /** Late in the day: open above the slot, not off the bottom of the board. */
  up: boolean;
  /** The last column: hang from the slot's right edge. */
  right: boolean;
  onPick: (k: HourMenuPick) => void;
  onClose: () => void;
}) {
  const row = "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] font-medium text-[#1A1A2E] hover:bg-[rgba(26,26,46,0.06)] focus-visible:bg-[rgba(26,26,46,0.06)] outline-none";
  return (
    <>
      <div className="fixed inset-0 z-[19]" data-testid="hour-menu-away" onClick={(e) => { e.stopPropagation(); onClose(); }} />
      <div
        role="menu"
        aria-label={`Add at ${when}`}
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}
        className={`absolute z-[20] w-[200px] max-w-[80vw] rounded-xl bg-white p-1.5 text-left ${up ? "bottom-full mb-1" : "top-full mt-1"} ${right ? "right-0" : "left-0"}`}
        style={{ border: "1px solid rgba(26,26,46,0.10)", boxShadow: "0 10px 30px rgba(26,26,46,0.16)" }}
      >
        <p className="px-2.5 pt-1.5 pb-1 text-[11px]" style={{ color: "rgba(26,26,46,0.5)" }}>{when} · Add</p>
        {ITEMS.map((it, i) => (
          <button key={it.key} type="button" role="menuitem" autoFocus={i === 0} className={row} onClick={() => onPick(it.key)}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden="true">{it.glyph}</span>{it.label}
          </button>
        ))}
        <div className="my-1" style={{ borderTop: "1px solid rgba(26,26,46,0.08)" }} />
        <button type="button" role="menuitem" className={row.replace("font-medium text-[#1A1A2E]", "font-normal text-[rgba(26,26,46,0.62)]")} onClick={() => onPick("note")}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden="true">edit_note</span>Note
        </button>
      </div>
    </>
  );
}
