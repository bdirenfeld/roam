/**
 * Every date of a journey, start to end inclusive, as "YYYY-MM-DD".
 * Counted in UTC: stepping local midnights by 24 hours lost the last day of a
 * trip across the spring clock change (Mar 14–17 2027 got three days; 6 Oct
 * 2026, Brennan's Irving trip).
 */
export function tripDates(start: string, end: string): string[] {
  const out: string[] = [];
  const endMs = Date.parse(end + "T00:00:00Z");
  for (let ms = Date.parse(start + "T00:00:00Z"); ms <= endMs; ms += 86400000) {
    out.push(new Date(ms).toISOString().slice(0, 10));
  }
  return out;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * "MAR 2026" from a "YYYY-MM-DD" date (7 Oct 2026, delight audit). A past
 * journey is remembered as a month, not "4–12"; a trip spanning two months
 * reads as its start month. Read off the string, so no timezone can shift it.
 */
export function monthYear(date: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})/.exec(date ?? "");
  if (!m) return "";
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : "";
}
