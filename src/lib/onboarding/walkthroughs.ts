/**
 * The walkthroughs, one per screen (14 Oct 2026, his yes to the plan).
 *
 * "Your first journey" (components/onboarding/progress.ts) teaches the core
 * loop on the Map and keeps its own record. Everything else is here: each
 * walkthrough belongs to one screen, shows once the first time that screen is
 * opened, and is tracked on its own — so someone with three journeys who opens
 * Budget for the first time gets the Budget walkthrough, and nothing else.
 *
 * Two rules decide what happens when a screen opens:
 *  - Never seen, and the feature already used (a budget edited, a stay found,
 *    a booking uploaded…): marked done without showing. Nobody is taught what
 *    they have already done.
 *  - Never seen, not used: it starts. Under way: it picks up at its step.
 *    Skipped or done: quiet, until "Show all walkthroughs again" in Profile.
 *
 * Steps point at real controls by selector. A step lists its anchors in order
 * of preference; the first one on screen wins, so a folded Budget group can say
 * "Tap Standard" and, once it is open, the same step points at the tick.
 */

export type TourId = "day" | "week" | "budget" | "stays" | "bookings" | "share" | "notes";

export type Anchor = { selector: string; text: string };
export type TourStep = {
  anchors: Anchor[];
  /**
   * The control appears only after something happens (Where to stay's ✕
   * arrives with the results). Until then the hint stays hidden instead of
   * floating unattached.
   */
  wait?: boolean;
};
export type Tour = { id: TourId; title: string; steps: TourStep[] };

export type TourState = { status: "underway" | "skipped" | "done"; step: number; updatedAt: number };
export type TourRecord = Partial<Record<TourId, TourState>>;

export const TOURS: Record<TourId, Tour> = {
  day: {
    id: "day",
    title: "Your day",
    steps: [
      { anchors: [{ selector: '[role="button"][aria-label^="Change the time"], [role="button"][aria-label="Set a time"]', text: "Tap a time to change when it starts and how long it takes." }] },
      { anchors: [{ selector: 'button[aria-label^="Add to this gap"]', text: "A gap is free time. Tap it to fill it with a saved place or a note." }] },
      { anchors: [{ selector: '[data-walk="day-strip-day"]', text: "Press and hold a day to rename it, give it times, or re-plan it." }] },
    ],
  },
  week: {
    id: "week",
    title: "The week board",
    steps: [
      { anchors: [{ selector: "[data-daycol] [data-card-id]", text: "Drag a block to another day or time. Drag its top or bottom edge to change how long it lasts." }] },
      { anchors: [{ selector: 'button[aria-label="Day actions"]', text: "Day actions renames a day, gives it times, or re-plans it in one go." }] },
      { anchors: [{ selector: 'button[aria-label="Select several pins"]', text: "Select several pins on the map to move them to a day together." }] },
    ],
  },
  budget: {
    id: "budget",
    title: "Budget",
    steps: [
      {
        anchors: [
          { selector: 'button[aria-label^="Exclude "], button[aria-label^="Include "]', text: "Tick a cost to count it, or untick it to leave it out." },
          { selector: '[data-walk="budget-standard"]', text: "Tap Standard to see each cost." },
        ],
      },
      {
        anchors: [
          { selector: 'input[aria-label$=" unit cost"]', text: "Every price starts as Roam’s estimate. Type over it with what you know." },
          { selector: '[data-walk="budget-standard"]', text: "Tap Standard to see each cost and change it." },
        ],
      },
      {
        anchors: [
          { selector: '[data-walk="budget-add-cost"]', text: "Add anything Roam missed, like ski passes or gifts." },
          { selector: '[data-walk="budget-additional"]', text: "Tap Additional to add your own costs." },
        ],
      },
    ],
  },
  stays: {
    id: "stays",
    title: "Where to stay",
    steps: [
      { anchors: [{ selector: '[data-walk="stays-find"]', text: "Roam picks five places to stay near what you’ve saved, priced for your dates and party." }] },
      { wait: true, anchors: [{ selector: 'button[aria-label="Not for us"]', text: "Not right? Tap ✕, say why, and Roam won’t suggest it again." }] },
    ],
  },
  bookings: {
    id: "bookings",
    title: "Bookings",
    steps: [
      { anchors: [{ selector: '[data-testid="to-book"] button[aria-haspopup="menu"]', text: "Each row is something to book. Tap its circle to mark it booked or not needed." }] },
      { anchors: [{ selector: '[data-walk="bookings-upload"]', text: "Upload a booking email or PDF. Roam reads it and adds it to the right days." }] },
    ],
  },
  share: {
    id: "share",
    title: "Share & travellers",
    steps: [
      { anchors: [{ selector: '[data-walk="travellers-add"]', text: "Add who’s coming. Their names and passports are kept with the journey." }] },
      { anchors: [{ selector: '[data-walk="entry-check"]', text: "Check visas and entry rules for everyone’s passports." }, { selector: 'input[aria-label="Type a country to add its passport"]', text: "Add everyone’s passports, then check the visas and entry rules they need." }] },
      { anchors: [{ selector: 'input[aria-label="Their email address"]', text: "Invite someone by email to plan with you, or make a link to share the plan." }] },
    ],
  },
  notes: {
    id: "notes",
    title: "Notes",
    steps: [
      { anchors: [{ selector: '[data-walk="notes-item"]', text: "Add a packing item or a to-do. Tap its box to tick it off." }] },
      { anchors: [{ selector: '[data-walk="notes-note"]', text: "A note is a line to read, not tick: a door code, the house rules." }] },
      { anchors: [{ selector: '[data-walk="notes-section"]', text: "Group things into sections, like Packing or Before we go." }] },
    ],
  },
};

export const TOUR_IDS = Object.keys(TOURS) as TourId[];

export function parseRecord(value: unknown): TourRecord {
  if (!value || typeof value !== "object") return {};
  const out: TourRecord = {};
  for (const id of TOUR_IDS) {
    const s = (value as Record<string, unknown>)[id] as TourState | undefined;
    if (s && ["underway", "skipped", "done"].includes(s.status) && Number.isInteger(s.step) && s.step >= 0 && s.step < TOURS[id].steps.length && typeof s.updatedAt === "number") out[id] = s;
  }
  return out;
}

/** The newer of two records, walkthrough by walkthrough (this device vs the account). */
export function mergeRecords(a: TourRecord, b: TourRecord): TourRecord {
  const out: TourRecord = { ...a };
  for (const id of TOUR_IDS) {
    const x = a[id], y = b[id];
    if (y && (!x || y.updatedAt > x.updatedAt)) out[id] = y;
  }
  return out;
}

/** What opening a screen does to its walkthrough. */
export function onOpen(state: TourState | undefined, used: boolean): "start" | "resume" | "quiet-done" | "none" {
  if (!state) return used ? "quiet-done" : "start";
  return state.status === "underway" ? "resume" : "none";
}

export function advance(id: TourId, state: TourState, now: number): TourState {
  const last = TOURS[id].steps.length - 1;
  return state.step >= last ? { status: "done", step: last, updatedAt: now } : { status: "underway", step: state.step + 1, updatedAt: now };
}

/** The Walkthrough tile: pick up one under way, otherwise run it again from the top. */
export function fromTile(state: TourState | undefined, now: number): TourState {
  return state?.status === "underway" ? { ...state, updatedAt: now } : { status: "underway", step: 0, updatedAt: now };
}

export function tourStepLabel(step: number, total: number): string {
  return `Step ${step + 1} of ${total}`;
}

/** The anchor to point at: the first in the step's list that is on screen. */
export function pickAnchor<T>(step: TourStep, find: (selector: string) => T | null | undefined): { el: T; text: string } | null {
  for (const a of step.anchors) {
    const el = find(a.selector);
    if (el) return { el, text: a.text };
  }
  return null;
}
