/**
 * Booking numbers never reach the shared page (7 Oct 2026, re-audit).
 *
 * The link is forwardable, and a note like "Suite, 1 King Bed, 2 adults,
 * nonsmoking, Expedia For TD itinerary: 73544719922491" handed anyone holding
 * it the number that, with a surname, opens the booking: cancel, change, see
 * the card on file. The journey page strips confirmation, itinerary, booking,
 * reservation and record-locator numbers, and any run of 8+ digits, from note
 * text ON THE SERVER, so the number is never in the HTML. The rest of the
 * sentence stays readable.
 *
 * `guestCardText` is the only door from a card's `details` to the page: it
 * reads `title`, `notes` and `named` and nothing else, so `details.confirmation`
 * (and anything added to details later) cannot cross by accident.
 */

/** Case-insensitive without the `i` flag, so the number itself can be matched case-sensitively. */
function ci(word: string): string {
  return word.replace(/[a-z]/gi, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`).replace(/ /g, String.raw`\s+`);
}

const KEY = String.raw`\b(?:${["confirmation", "conf", "itinerary", "booking", "reservation", "record locator", "pnr", "reference", "ref"].map(ci).join("|")})\b`;
const SUFFIX = String.raw`(?:\s+(?:${["number", "num", "no", "code", "id", "reference", "ref", "locator"].map(ci).join("|")})\b\.?)?`;
const SEP = String.raw`\s*[:#.\-]?\s*#?\s*`;
// The number: 5+ letters/digits with at least one digit (not a date), or a
// six-letter airline locator in capitals.
const CODE = String.raw`(?!\d{4}-\d\d-\d\d\b)(?:(?=[A-Za-z-]*\d)[A-Za-z0-9][A-Za-z0-9-]{4,}|[A-Z]{6})\b`;
const NUMBER = String.raw`${KEY}${SUFFIX}${SEP}${CODE}`;
// Who issued it, when it opens its own clause: ", Expedia For TD itinerary: 735…".
const ISSUER = String.raw`[A-Z][\w&'.-]*(?:\s+(?:[A-Z][\w&'.-]*|for|of|via|by))*?\s+`;

const CLAUSE = new RegExp(String.raw`(^|[,;·|]\s*|[.!?]\s+)${ISSUER}${NUMBER}`, "g");
// A number in brackets takes its brackets with it: "(reservation no. 48213X)".
const BARE = new RegExp(String.raw`(\(\s*)?${NUMBER}(\s*\))?`, "g");
const unbracket = (_m: string, open?: string, close?: string) =>
  (open && close) || (!open && !close) ? "" : open ? "(" : ")";
const DIGITS = /#?\b\d{8,}\b/g;

/** One line, with the numbers out and the punctuation they leave behind tidied. */
function stripLine(line: string): string {
  const out = line.replace(CLAUSE, "$1").replace(BARE, unbracket).replace(DIGITS, "");
  if (out === line) return line;
  return out
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]+([.,;:)])/g, "$1")
    .replace(/([.,;:·|])(?:\s*[.,;:·|])+/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[\s,;:·|–—-]+/, "")
    .replace(/[\s,;:·|–—-]+$/, "")
    .trim();
}

/** Note text as a guest may see it: every booking number taken out. */
export function stripBookingNumbers(text: string): string {
  return text.split("\n").map(stripLine).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** The three things the shared page reads from a card's details, made guest-safe. */
export function guestCardText(details: Record<string, unknown> | null | undefined): {
  title: string | null;
  note: string | null;
  named: boolean;
} {
  const title = typeof details?.title === "string" ? stripBookingNumbers(details.title) || null : null;
  const note = typeof details?.notes === "string" ? stripBookingNumbers(details.notes) || null : null;
  return { title, note, named: details?.named === true };
}
