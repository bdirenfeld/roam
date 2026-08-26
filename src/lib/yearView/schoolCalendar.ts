// ── TDSB school calendar for the "Your year" strip ────────────────────────
// One flat array; to roll forward a year, delete the oldest block and append
// the new school year's block from the TDSB "Key Dates" PDF
// (tdsb.on.ca → About Us → School Year Calendar).
//
// Kinds:
//   break — multi-day school closure, drawn as a hatched band
//   pa    — Professional Activity day (elementary set; the kids are
//           elementary-age), drawn as an orange dot
//   stat  — statutory holiday, used for long-weekend detection
//
// Single-day entries have start === end. Dates are local ISO (YYYY-MM-DD).

export type SchoolDateKind = "break" | "pa" | "stat";

export interface SchoolCalendarEntry {
  label: string;
  start: string; // YYYY-MM-DD inclusive
  end: string;   // YYYY-MM-DD inclusive
  kind: SchoolDateKind;
}

export const SCHOOL_CALENDAR: SchoolCalendarEntry[] = [
  // ── Tail of summer 2026 (2025-26 year end → 2026-27 year start) ─────────
  // End date confirmed by the 2026-27 calendar: classes begin Tue Sep 8, 2026.
  { label: "Summer",       start: "2026-06-26", end: "2026-09-07", kind: "break" },

  // ── TDSB 2026-27 — confirmed from the official Key Dates PDF ────────────
  // Elementary PA days
  { label: "PA day",       start: "2026-09-02", end: "2026-09-02", kind: "pa" },
  { label: "PA day",       start: "2026-09-03", end: "2026-09-03", kind: "pa" },
  { label: "PA day",       start: "2026-11-20", end: "2026-11-20", kind: "pa" },
  { label: "PA day",       start: "2027-01-15", end: "2027-01-15", kind: "pa" },
  { label: "PA day",       start: "2027-02-12", end: "2027-02-12", kind: "pa" },
  { label: "PA day",       start: "2027-06-04", end: "2027-06-04", kind: "pa" },
  { label: "PA day",       start: "2027-06-30", end: "2027-06-30", kind: "pa" },
  // Statutory / school-year holidays
  { label: "Labour Day",    start: "2026-09-07", end: "2026-09-07", kind: "stat" },
  { label: "Thanksgiving",  start: "2026-10-12", end: "2026-10-12", kind: "stat" },
  { label: "Family Day",    start: "2027-02-15", end: "2027-02-15", kind: "stat" },
  { label: "Good Friday",   start: "2027-03-26", end: "2027-03-26", kind: "stat" },
  { label: "Easter Monday", start: "2027-03-29", end: "2027-03-29", kind: "stat" },
  { label: "Victoria Day",  start: "2027-05-24", end: "2027-05-24", kind: "stat" },
  // Breaks
  { label: "Winter",       start: "2026-12-21", end: "2027-01-01", kind: "break" },
  { label: "March",        start: "2027-03-15", end: "2027-03-19", kind: "break" },
  // UNCONFIRMED: summer 2027 start assumes the last elementary instructional
  // day is Tue Jun 29, 2027 (Jun 4 and Jun 30 are PA days; the PDF does not
  // state the last instructional day). End is a placeholder — the 2027-28
  // calendar is not yet published; adjust when TDSB posts it.
  { label: "Summer",       start: "2027-06-30", end: "2027-09-06", kind: "break" },
];
