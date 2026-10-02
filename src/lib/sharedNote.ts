import { plainNote } from "./plainNote";

/**
 * A card note as the shared page shows it (2 Oct 2026, Brennan's yes): its
 * first sentence under each stop, with "more" for the rest, so a family member sees
 * the whole day as a list instead of scrolling several screens of notes.
 *
 * Two things never reach a guest: the "**Intent**" heading Plan my trip writes
 * above its first paragraph (131 of 326 notes), and the planner's own hedging,
 * a bullet in the first person ("I cannot verify specific details about
 * Shodai…", "I have limited verified operational detail…"). Two notes carried
 * one when this was written; they read as a robot talking to the family.
 */

// A heading line on its own: "**Intent**" or "## Intent".
const INTENT = /^\s*(?:\*\*Intent\*\*|#{1,6}\s*Intent)\s*$/im;
// A line (bullet or not) where the writer talks about itself.
const HEDGE = /^\s*(?:[-*]\s+)?I (?:have|cannot|can't|could not|couldn't|do not|don't|was unable|am unable|did not)\b.*(?:\n|$)/gim;
// Words ending in a full stop that do not end a sentence.
const ABBREV = /(?:^|\s)(?:St|Mt|Dr|Mr|Mrs|Ms|No|approx|e\.g|i\.e|vs|incl|min|km|ca)\.$/i;

/** The note with the Intent heading and the first-person hedging taken out, as plain text. */
export function cleanNote(raw: string): string {
  return plainNote(raw.replace(INTENT, "").replace(HEDGE, ""));
}

// The line shown is at least this long: the notes Brennan writes himself open
// with fragments ("Florence, since 1953. Google 4.6 (4,600). Lunch only…"), and
// "Florence, since 1953." alone says nothing.
const MIN_LEAD = 60;

/** Where the shown line of `p` ends (the index after a sentence's stop), or -1 when it is the whole of `p`. */
function leadStop(p: string): number {
  const re = /[.!?](?=\s+\S)/g;
  for (let m = re.exec(p); m; m = re.exec(p)) {
    const end = m.index + 1;
    if (!ABBREV.test(p.slice(0, end)) && end >= MIN_LEAD) return end;
  }
  return -1;
}

/**
 * Split a note into the line the page shows (`lead`) and what "more" opens
 * (`rest`, empty when there is nothing more, so the page shows no "more").
 */
export function foldNote(raw: string): { lead: string; rest: string } {
  const text = cleanNote(raw);
  const brk = text.indexOf("\n");
  const first = brk < 0 ? text : text.slice(0, brk);
  const after = brk < 0 ? "" : text.slice(brk + 1);
  const stop = leadStop(first);
  const lead = (stop < 0 ? first : first.slice(0, stop)).trim();
  const rest = [stop < 0 ? "" : first.slice(stop).trim(), after.trim()].filter(Boolean).join("\n\n");
  return { lead, rest };
}
