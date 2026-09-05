// ── Entry requirements: the shape the lookup writes and the screens read ──
//
// One answer per journey, for the party's passports and the destination
// country. Every line carries its own words; the block carries the source
// and the date. Nothing here is typed by the traveller except the passports
// and the "done" ticks.

export interface EntryLine {
  /** Stable across rechecks so a "done" tick survives: visa | before | onward | passport | other-N. */
  key: string;
  /** Small caps label: "Before you go", "Visa", "Onward travel", "Passport". */
  label: string;
  /** The requirement, one or two sentences. */
  text: string;
  /** Why it matters or what the family's own situation makes of it. Optional. */
  why?: string | null;
  /** Something to do before departure (shows a tick box) vs a fact (shows a dot). */
  action: boolean;
  /** Ticked by the owner. */
  done: boolean;
  /** ISO date to do it by, when the lookup could say. */
  deadline?: string | null;
}

/** The Government of Canada advisory level for the country: 1 normal precautions … 4 avoid all travel. */
export interface EntryAdvisory {
  level: 1 | 2 | 3 | 4;
  /** The government's own words: "Exercise a high degree of caution". */
  label: string;
  /** One sentence on why, or null. */
  reason: string | null;
}

export interface EntryData {
  country: string;
  /** Present from the first lookup that read it; null when the page gave none. */
  advisory?: EntryAdvisory | null;
  /** "action" while any action line is not done; "clear" otherwise. Derived on read. */
  status: "action" | "clear";
  lines: EntryLine[];
  source_url: string | null;
  source_name: string;
  /** ISO timestamp of the lookup. */
  checked_at: string;
  /** ISO date the next automatic recheck is due (30 days before departure). */
  next_check: string | null;
  /** One line on what changed at the last recheck, for the toast. */
  change_note?: string | null;
}

export interface TripEntry {
  trip_id: string;
  passports: string[];
  data: EntryData | null;
  changed: boolean;
  checked_at: string | null;
}

export function entryStatus(data: EntryData | null | undefined): "action" | "clear" | null {
  if (!data) return null;
  return data.lines.some((l) => l.action && !l.done) ? "action" : "clear";
}

/** The first sentence of a line — what the screens show; the rest sits behind a tap. */
export function firstSentence(text: string): string {
  return text.split(/(?<=[.!?])\s+/)[0];
}

/** The first undone action, for the Agenda's one line. */
export function entryHeadline(data: EntryData | null | undefined): string | null {
  // An advisory at "avoid" level is a decision, not a caution: it leads.
  if (data?.advisory && data.advisory.level >= 3) return `Advisory · ${data.advisory.label}`;
  const line = data?.lines.find((l) => l.action && !l.done);
  if (!line) return null;
  // First sentence only: the Agenda line is a nudge, the block has the rest.
  const short = firstSentence(line.text).replace(/[.!?]$/, "");
  // A separator, not a preposition: the sentence often ends "before departure" already.
  const by = line.deadline
    ? ` · by ${new Date(line.deadline + "T12:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`
    : "";
  return `Entry · ${short.charAt(0).toLowerCase()}${short.slice(1)}${by}`;
}
