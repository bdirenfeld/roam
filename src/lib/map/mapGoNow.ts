/**
 * Should the day map start right away? (5 Oct 2026) Yes on desktop, where it
 * sits beside the list, and wherever there is no window to measure (tests,
 * server). On a phone it waits for the list to paint (DayMap).
 */
export function mapGoNow(win: Pick<Window, "matchMedia"> | undefined): boolean {
  if (!win || typeof win.matchMedia !== "function") return true;
  return win.matchMedia("(min-width: 768px)").matches;
}
