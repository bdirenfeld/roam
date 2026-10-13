// Funnel events (10 Oct 2026, growth audit). Roam had no way to see how many
// strangers reached the front door, tapped a way in, or made a trip: Vercel
// Web Analytics was off and only Brennan can switch it on. Clarity is already
// loaded for testers (lib/sessionRecording), and it takes custom events and
// tags, so the funnel is counted there: Clarity → Filters → Custom events.
//
// Names are the funnel's stages, in order. Add a stage only when a question
// needs it; a tag nobody reads is clutter in the dashboard too.
export const FUNNEL = {
  landingView: "landing_view",
  landingDemo: "landing_demo", // "See a real trip" tapped
  signInGoogle: "signin_google",
  signInEmail: "signin_email", // a sign-in link requested
  tripCreated: "trip_created",
} as const;
export type FunnelEvent = (typeof FUNNEL)[keyof typeof FUNNEL];

type ClarityWindow = { clarity?: (...args: unknown[]) => void; __roamFunnel?: unknown[][] };

/**
 * Clarity loads after the session is read (SessionRecorder), so an event sent
 * as the page mounts — landing_view, the source tag — found no Clarity and was
 * dropped (13 Oct 2026). Calls made before it loads wait here, on the window,
 * and SessionRecorder hands them over with flushFunnel once it has loaded.
 * A visitor who is never recorded just leaves a few entries behind.
 */
function send(win: ClarityWindow | undefined, args: unknown[]): void {
  if (!win) return;
  try {
    if (win.clarity) win.clarity(...args);
    else (win.__roamFunnel = win.__roamFunnel ?? []).push(args);
  } catch {
    /* a recorder fault must never reach the page */
  }
}

/** Hand anything sent before Clarity loaded to it, once. */
export function flushFunnel(win: ClarityWindow | undefined = typeof window === "undefined" ? undefined : (window as ClarityWindow)): void {
  const waiting = win?.__roamFunnel;
  if (!win?.clarity || !waiting) return;
  win.__roamFunnel = [];
  for (const args of waiting) send(win, args);
}

/** Count an event. Silent when Clarity is never loaded (dev, Brennan's own
 *  sessions, a blocked script): the event is never the point of the tap. */
export function funnelEvent(name: FunnelEvent, win: ClarityWindow | undefined = typeof window === "undefined" ? undefined : (window as ClarityWindow)): void {
  send(win, ["event", name]);
}

/** Where the visitor came from, as a Clarity tag: the /ig, /reddit and /beta
 *  short links land on `/?utm_source=…`. Direct visits are tagged "direct" so
 *  the filter has a value to pick. */
export function sourceFromSearch(search: string): string {
  const v = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("utm_source")?.trim().toLowerCase();
  return v && /^[a-z0-9_-]{1,32}$/.test(v) ? v : "direct";
}

export function funnelSource(search: string, win: ClarityWindow | undefined = typeof window === "undefined" ? undefined : (window as ClarityWindow)): void {
  send(win, ["set", "source", sourceFromSearch(search)]);
}
