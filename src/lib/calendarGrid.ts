/**
 * The cells of one month in a Sunday-first grid, always six weeks (42 cells).
 * Blank cells are null. Six rows every month so the picker never changes
 * height: a 5-week month used to be a row shorter, and the arrows above the
 * grid moved out from under the pointer when you stepped into a 6-week one
 * (Don's feedback, Nov 2026).
 */
export const CALENDAR_CELLS = 42;

export function calendarGrid(year: number, month: number): Array<string | null> {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<string | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length < CALENDAR_CELLS) cells.push(null);
  return cells;
}
