"use client";

// Travel, under the week's empty-hour box (25 Nov 2026, mock approved). The
// phone has had "Add a place → Travel" since 14 Nov (CreateCardSheet's Travel
// row → AddTravelSheet); the week never opened it, so on a computer a drive was
// a note you typed, opened, and re-typed as "Transit". This is the phone's row,
// word for word, and it opens the same sheet for the day and hour clicked.
// It shows only while the box is empty: once a name is typed the place
// suggestions take this spot (HourSuggestList).

export default function WeekTravelRow({ onPick }: { onPick: () => void }) {
  return (
    <div
      // Keep the box's focus: a blur would run the box's own "make a note" first.
      onMouseDown={(e) => e.preventDefault()}
      className="absolute left-0 top-full mt-1 w-[280px] max-w-[80vw] bg-white rounded-[10px] overflow-hidden z-[20] text-left"
      style={{ border: "1px solid rgba(26,26,46,0.10)", boxShadow: "0 10px 30px rgba(26,26,46,0.16)" }}
    >
      <button
        type="button"
        data-testid="week-travel-row"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onPick}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[rgba(26,26,46,0.04)]"
      >
        <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#F0EFEB", boxShadow: "inset 0 0 0 1px rgba(26,26,46,0.10)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#1A1A2E" }} aria-hidden="true">directions_car</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium text-[#1A1A2E]">Travel</span>
          <span className="block text-[11.5px] mt-0.5" style={{ color: "rgba(26,26,46,0.62)" }}>Drive, train, bus or ferry between two places</span>
        </span>
      </button>
    </div>
  );
}
