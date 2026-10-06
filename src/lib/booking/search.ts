/**
 * "Search all" on the To book checklist (6 Oct 2026, Brennan's yes).
 *
 * Every row still to book becomes a step (a Not needed row is out — that
 * replaced the old "include in my search" boxes, 6 Oct 2026 redesign): the Kayak tabs first, then Roam's own
 * Where to stay (Stays leaves the sheet for the map, so it has to come last or
 * the remaining tabs would never open). One click opens them all on a computer
 * (verified 6 Oct: desktop Chrome opened three tabs from one click). An iPhone
 * may allow only the first window.open per tap and return null for the rest:
 * whatever did not open is kept as a "Next: Car ↗" button, one tap each.
 */

import type { CheckRow, RowKey } from "./checklist";

export interface Step {
  key: RowKey;
  title: string;
  /** Kayak, or null for Roam's Where to stay. */
  url: string | null;
}

/**
 * The rows still to book as steps, Kayak first, Where to stay last. Stays opens
 * Where to stay unless `stayInApp` is false (a cruise has no Where to stay, so
 * its Stays row keeps the Kayak link).
 */
export function searchSteps(rows: CheckRow[], stayInApp: boolean): Step[] {
  const open = rows.filter((r) => r.state === "open");
  const kayak: Step[] = [];
  let stay: Step | null = null;
  for (const r of open) {
    if (r.key === "stays" && stayInApp) stay = { key: r.key, title: r.title, url: null };
    else if (r.url) kayak.push({ key: r.key, title: r.title, url: r.url });
  }
  return stay ? [...kayak, stay] : kayak;
}

/**
 * Open the steps in order inside one click. `open` is window.open (returns
 * null when the browser blocked it). Stops at the first blocked tab and hands
 * back everything not done yet; reaching the Where to stay step means every
 * tab before it opened, so the caller may leave for the map.
 */
export function runSteps(steps: Step[], open: (url: string) => unknown): { opened: RowKey[]; stay: boolean; rest: Step[] } {
  const opened: RowKey[] = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s.url) return { opened, stay: true, rest: [] };
    if (!open(s.url)) return { opened, stay: false, rest: steps.slice(i) };
    opened.push(s.key);
  }
  return { opened, stay: false, rest: [] };
}

/**
 * Where to stay, by the same path the journey menu's Stay tile used (25 Sep
 * 2026): the phone's Map screen opens the sheet from ?stays=1; a computer has
 * no Map tab, so the panel opens over the Plan's map. The menu picked by its
 * variant, which is the md breakpoint (768px): JourneyHeader below it, the
 * DesktopMasthead above.
 */
export function whereToStayHref(tripId: string, desktop: boolean): string {
  return `/trips/${tripId}${desktop ? "/plan" : "/map"}?stays=1`;
}

/**
 * The one primary button's words: "Book 2 on Kayak", N = the rows still to
 * book (Stays counts, though it opens Where to stay after the tabs). Null when
 * nothing is left — the button hides.
 */
export function bookLabel(steps: Step[]): string | null {
  return steps.length ? `Book ${steps.length} on Kayak` : null;
}
