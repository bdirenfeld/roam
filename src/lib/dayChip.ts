/**
 * A day as a traveller picks it: "Mon 16", and "Mon 16 Aug" once the journey
 * crosses a month (27 Sep 2026). A two-month summer listed "Day 47 · 16 Mon"
 * with nothing to say it was August.
 */
export function spansMonths(dates: string[]): boolean {
  return new Set(dates.map((d) => d.slice(0, 7))).size > 1;
}

export function dayChip(date: string, withMonth: boolean): string {
  const d = new Date(date + "T00:00:00");
  const wd = d.toLocaleDateString("en-GB", { weekday: "short" });
  const mo = d.toLocaleDateString("en-GB", { month: "short" });
  return withMonth ? `${wd} ${d.getDate()} ${mo}` : `${wd} ${d.getDate()}`;
}
