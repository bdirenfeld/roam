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
 *    Skipped or done: quiet, until it is picked again from the Walkthroughs
 *    list (⋯ → Walkthrough) or "Show all again" there.
 *
 * Steps point at real controls by selector. A step lists its anchors in order
 * of preference; the first one on screen wins, so a folded Budget group can say
 * "Tap Standard" and, once it is open, the same step points at the tick.
 *
 * The list's groups and one-line benefits came from ChatGPT's review build
 * (localhost:4176/dev/walkthroughs, 14 Oct 2026), as did the map, card and
 * on-the-day walkthroughs and Next opening the control the next step needs.
 */

export type TourId = "day" | "week" | "map" | "card" | "budget" | "stays" | "bookings" | "share" | "notes" | "ontrip";

export type Anchor = { selector: string; text: string };
export type TourStep = {
  anchors: Anchor[];
  /**
   * The control appears only after something happens (Where to stay's ✕
   * arrives with the results). Until then the hint stays hidden instead of
   * floating unattached.
   */
  wait?: boolean;
  /**
   * Clicked on Next from the step before, when this step's control is not on
   * screen yet: Budget's folded Standard group opens itself rather than
   * asking for a tap. It only ever opens a fold — it never saves anything.
   */
  reveal?: string;
};
export type Group = "Plan your days" | "Prepare" | "Travel";
/**
 * Where the list sends someone who picks a walkthrough from another screen.
 * `route` and `overlay` open the screen; `hint` says where to go (Bookings
 * and a place's card open from things on the page, not from a link).
 */
export type Door =
  | { kind: "route"; path: "day" | "map" | "plan" | "stays" }
  | { kind: "overlay"; which: "budget" | "notes" | "settings" }
  | { kind: "hint"; text: string };
export type Tour = { id: TourId; title: string; benefit: string; group: Group; door: Door;
  /** Only where its screen exists: the owner's computer opens the week board, never the day view. */
  device?: "phone" | "computer";
  steps: TourStep[] };

export type TourState = { status: "underway" | "skipped" | "done"; step: number; updatedAt: number };
export type TourRecord = Partial<Record<TourId, TourState>>;

export const TOURS: Record<TourId, Tour> = {
  day: {
    id: "day",
    title: "Your day",
    benefit: "Change times and fill the gaps in a day.",
    group: "Plan your days",
    door: { kind: "route", path: "day" },
    device: "phone",
    steps: [
      { anchors: [{ selector: '[role="button"][aria-label^="Change the time"], [role="button"][aria-label="Set a time"]', text: "Tap a time to change when it starts and how long it takes." }] },
      // The phone has no gap rows (they are md:flex); its door is "Add a place".
      { anchors: [{ selector: '[data-walk="day-add"] button', text: "Add to this day: a place you saved, somewhere new, or a note." }] },
      { anchors: [{ selector: '[data-walk="day-strip-day"]', text: "Press and hold a day to rename it, give it times, or re-plan it." }] },
    ],
  },
  week: {
    id: "week",
    title: "The week board",
    benefit: "Move places between days and times on a computer.",
    group: "Plan your days",
    door: { kind: "route", path: "plan" },
    device: "computer",
    steps: [
      { anchors: [{ selector: "[data-daycol] [data-card-id]", text: "Drag a block to another day or time. Drag its top or bottom edge to change how long it lasts." }] },
      { anchors: [{ selector: 'button[aria-label="Day actions"]', text: "Day actions renames a day, gives it times, or re-plans it in one go." }] },
      { anchors: [{ selector: 'button[aria-label="Select several pins"]', text: "Select several pins on the map to move them to a day together." }] },
    ],
  },
  map: {
    id: "map",
    title: "Your map",
    benefit: "Show only what you need, and move several places at once.",
    group: "Plan your days",
    door: { kind: "route", path: "map" },
    steps: [
      { anchors: [{ selector: '[data-walk="map-filter"]', text: "Filter makes a busy map easier to read: just food, ideas still to fit in, or what’s planned." }] },
      { anchors: [{ selector: ".mapboxgl-marker", text: "Tap a pin to put it on a day. Press and hold to pick several pins and move them together." }] },
    ],
  },
  card: {
    id: "card",
    title: "A place’s card",
    benefit: "Keep directions, tickets and a checklist with each stop.",
    group: "Prepare",
    door: { kind: "hint", text: "Open any place on your day to start it." },
    steps: [
      { anchors: [{ selector: '[aria-label^="Directions to "]', text: "Tap the address for directions when it’s time to go." }] },
      {
        anchors: [
          { selector: 'button[aria-label="Attachments"]', text: "The paperclip keeps tickets and booking files with this place." },
          { selector: '[data-walk="card-add-details"]', text: "Tickets and booking files can live on a place too, once it’s an activity or a booking." },
        ],
      },
      { anchors: [{ selector: '[data-walk="card-add-details"]', text: "Add details shows the rest, like a checklist of what this stop needs." }] },
    ],
  },
  budget: {
    id: "budget",
    title: "Budget",
    benefit: "See what the journey will cost, and change any price.",
    group: "Prepare",
    door: { kind: "overlay", which: "budget" },
    steps: [
      {
        anchors: [
          { selector: 'button[aria-label^="Exclude "], button[aria-label^="Include "]', text: "Tick a cost to count it, or untick it to leave it out." },
          { selector: '[data-walk="budget-standard"]', text: "Tap Standard to see each cost." },
        ],
      },
      {
        reveal: '[data-walk="budget-standard"]',
        anchors: [
          { selector: 'input[aria-label$=" unit cost"]', text: "Every price starts as Roam’s estimate. Type over it with what you know." },
          { selector: '[data-walk="budget-standard"]', text: "Tap Standard to see each cost and change it." },
        ],
      },
      {
        reveal: '[data-walk="budget-additional"]',
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
    benefit: "Five places to stay that fit your days and party.",
    group: "Prepare",
    door: { kind: "route", path: "stays" },
    steps: [
      { anchors: [{ selector: '[data-walk="stays-find"]', text: "Roam picks five places to stay near what you’ve saved, priced for your dates and party." }] },
      { wait: true, anchors: [{ selector: 'button[aria-label="Not for us"]', text: "Not right? Tap ✕, say why, and Roam won’t suggest it again." }] },
    ],
  },
  bookings: {
    id: "bookings",
    title: "Bookings",
    benefit: "See what’s still to book, and keep the confirmations.",
    group: "Prepare",
    door: { kind: "hint", text: "Open Bookings from ⋯ to start it." },
    steps: [
      { anchors: [{ selector: '[data-testid="to-book"] button[aria-haspopup="menu"]', text: "Each row is something to book. Tap its circle to mark it booked or not needed." }] },
      { anchors: [{ selector: '[data-walk="bookings-upload"]', text: "Upload a booking email or PDF. Roam reads it and adds it to the right days." }] },
    ],
  },
  share: {
    id: "share",
    title: "Share & travellers",
    benefit: "Who’s coming, entry rules, and inviting people.",
    group: "Prepare",
    door: { kind: "overlay", which: "settings" },
    steps: [
      // Settings' real rows (14 Oct 2026 walk): the party is a "Change" row, entry a folded row.
      { anchors: [{ selector: '[data-walk="travellers-change"]', text: "Change who’s coming here. The budget and Where to stay count everyone." }] },
      { anchors: [{ selector: '[data-walk="entry-row"]', text: "Travel requirements checks the visas and entry rules for everyone’s passports." }] },
      { anchors: [{ selector: 'input[aria-label="Their email address"]', text: "Invite someone by email to plan with you, or make a link to share the plan." }] },
    ],
  },
  notes: {
    id: "notes",
    title: "Notes",
    benefit: "A packing list and the essentials, in one place.",
    group: "Prepare",
    door: { kind: "overlay", which: "notes" },
    steps: [
      { anchors: [{ selector: '[data-walk="notes-item"]', text: "Add a packing item or a to-do. Tap its box to tick it off." }] },
      { anchors: [{ selector: '[data-walk="notes-note"]', text: "A note is a line to read, not tick: a door code, the house rules." }] },
      { anchors: [{ selector: '[data-walk="notes-section"]', text: "Group things into sections, like Packing or Before we go." }] },
    ],
  },
  ontrip: {
    id: "ontrip",
    title: "On the day",
    benefit: "Today’s stops, directions and details while you’re away.",
    group: "Travel",
    door: { kind: "route", path: "day" },
    device: "phone",
    steps: [
      { anchors: [{ selector: "[data-card-id]", text: "While you’re away, Roam opens on today. Open a stop for its booking and notes." }] },
      { wait: true, anchors: [{ selector: '[aria-label^="Directions to "]', text: "When it’s time to go, tap the address and your maps app takes you there." }] },
    ],
  },
};

export const TOUR_IDS = Object.keys(TOURS) as TourId[];
export const GROUPS: Group[] = ["Plan your days", "Prepare", "Travel"];

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

/** Picked from the list: pick one under way back up, otherwise run it again from the top. */
export function fromTile(state: TourState | undefined, now: number): TourState {
  return state?.status === "underway" ? { ...state, updatedAt: now } : { status: "underway", step: 0, updatedAt: now };
}

/** The list's line under a walkthrough's name. */
export function statusLine(id: TourId, state: TourState | undefined): string {
  if (!state) return TOURS[id].benefit;
  if (state.status === "underway") return `Continue · Step ${state.step + 1} of ${TOURS[id].steps.length}`;
  return state.status === "done" ? "Done · Run it again" : "Skipped · Run it again";
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
