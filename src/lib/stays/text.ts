// ── The sentences on the Where-to-stay sheet ──────────────────────────────
// Two lines under the map, and one under a listing. Written here, not in the
// route, so they can be tested against the Tuscany brief without a network.
// No label introduces them (Brennan, Sep 2026: "do not include unnecessary
// copy"). Each one is a fact against this journey or it is not there.

import type { StayBrief, Anchor } from "./brief";
import { greatCircleKm } from "./brief";
import { fmtMinutes } from "./drive";

/** How far out the journey has to reach before a direction means anything. */
const OUT_OF_TOWN_KM = 25;

/** Eight-point compass word for a bearing from `from` to `to`, in the phrase "South of Lucca". */
export function compassWord(fromLat: number, fromLng: number, toLat: number, toLng: number): string {
  const dLng = (toLng - fromLng) * Math.cos(((fromLat + toLat) / 2) * Math.PI / 180);
  const dLat = toLat - fromLat;
  const deg = ((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360;
  const words = ["North", "North-east", "East", "South-east", "South", "South-west", "West", "North-west"];
  return words[Math.round(deg / 45) % 8];
}

/**
 * "South of Lucca, toward Pisa." — the side of the evening centre that the
 * weighted day trips and the airport pull to, and the heaviest anchor on
 * that side named as the direction. Null when there is no evening centre or
 * nothing pulls anywhere (every anchor within 5 km).
 */
export function areaHeadline(brief: StayBrief): string | null {
  const ev = brief.evening;
  if (!ev) return null;
  const pulls = brief.anchors.filter((a) => a.kind !== "evening" && a.kmFromEvening >= 5);
  if (!pulls.length) return `In ${ev.label}.`;
  // A direction is only worth giving when the journey actually leaves town.
  //
  // Printed for all nine journeys on 11 Sept 2026. Where it reads well the
  // farthest thing he is going to is a long way out: Tuscany 74 km, Costa
  // Rica 56, Palm Springs 49 ("toward Joshua Tree"), Sydney 32. Where it
  // reads badly everything is local and the sentence has to reach for the
  // airport to find a direction at all:
  //
  //   New York, farthest 12 km  → "North-east of New York, toward East
  //                                Elmhurst" — three nights in Manhattan and
  //                                it points at LaGuardia
  //   Rome, farthest 21 km      → "South of Roma, toward the airport"
  //   Santa Barbara, 18 km      → "West of Montecito, toward Santa Barbara",
  //                                which is also the airport
  //
  // Inside this radius the next sentence already says everything useful —
  // stay within N minutes of the centre — so the direction is decoration.
  if (Math.max(...pulls.map((a) => a.kmFromEvening)) < OUT_OF_TOWN_KM) return `In ${ev.label}.`;
  let wLat = 0, wLng = 0, w = 0;
  for (const a of pulls) { wLat += a.lat * a.days; wLng += a.lng * a.days; w += a.days; }
  const cLat = wLat / w, cLng = wLng / w;
  if (greatCircleKm(ev.lat, ev.lng, cLat, cLng) < 3) return `In ${ev.label}.`;
  const side = compassWord(ev.lat, ev.lng, cLat, cLng);
  // The direction is the heaviest anchor on that side; ties go to the airport.
  // Ties still go to the airport: Pisa is a landmark everyone knows and
  // Montefoscoli is a village nobody does, so "toward Pisa" is the better
  // direction even though Pisa is also where the plane lands. The guard above
  // is the one New York needed — an airport ALONE is not a direction.
  const onSide = pulls
    .filter((a) => compassWord(ev.lat, ev.lng, a.lat, a.lng) === side)
    .sort((a, b) => b.days - a.days || (a.kind === "airport" ? -1 : 1));
  const toward = onSide[0] ?? pulls.sort((a, b) => b.days - a.days)[0];
  return `${side} of ${ev.label}, toward ${toward.label}.`;
}

/**
 * The line under the headline. Evenings set the radius; the airport is a
 * factor, named with its minutes when known.
 */
export function areaLine(brief: StayBrief, airportMinFromEvening: number | null): string | null {
  const ev = brief.evening;
  if (!ev) return null;
  const parts: string[] = [];
  // A centre can now be won on pin mass alone — Japan's is Shibuya, where
  // nothing is timed after five. Saying "one evening in Shibuya" would be an
  // invention, so a centre with no late pins says what it actually is.
  parts.push(ev.evenings
    ? `${ev.days === 1 ? "One evening" : `${ev.days} evenings`} in ${ev.label}; stay within ${brief.radiusMin} minutes of it.`
    // Nothing on the itinerary at all — Japan — so there is no day count to
    // quote and "0 days around Tokyo" was what shipped. Say what is true: the
    // pins are the only evidence there is.
    : ev.days < 1
      ? `Most of your places are around ${ev.label}; stay within ${brief.radiusMin} minutes of it.`
      : `${ev.days === 1 ? "A day" : `${ev.days} days`} around ${ev.label}; stay within ${brief.radiusMin} minutes of it.`);
  if (airportMinFromEvening != null) parts.push(`Airport ${fmtMinutes(airportMinFromEvening)}.`);
  return parts.join(" ");
}

/**
 * One base or two. A cluster visited on 2+ days and far from the evening
 * centre saves the transfer drive every day but the first:
 * 2 × minutes × (days − 1). Never a decision — it ends "your call".
 */
export function splitText(brief: StayBrief, minutesFromEvening: Record<string, number | null>): string | null {
  // More than one region with real weight is not a day-trip question, it is a
  // different trip. Japan reached Kagoshima and still read "One base is
  // enough" for thirteen nights (Brennan, 10 Sept 2026). When the journey has
  // nothing on the itinerary the nights are shared out by where the pins are,
  // so it is offered as a starting point, not stated as a plan.
  if (brief.bases.length > 1) {
    // The count and the night split sit on the base switcher directly above
    // this line — "2 places to stay. Roughly Tokyo 8 nights, Osaka 5" was the
    // same thing read twice (Brennan, 11 Sept 2026). What the tabs cannot say
    // is WHY there are two, so that is all this keeps.
    return "Too spread out for one base.";
  }
  const best = brief.splitCandidates
    .map((s) => ({ ...s, min: minutesFromEvening[s.label] ?? null }))
    .filter((s) => s.min != null && s.min >= 60)
    .sort((a, b) => (b.min as number) * b.days - (a.min as number) * a.days)[0];
  if (!best) return brief.splitCandidates.length ? null : "One base is enough.";
  const saved = 2 * (best.min as number) * (best.days - 1);
  const nights = best.days === 2 ? "Two nights" : `${best.days} nights`;
  return `One base is enough. ${nights} in ${best.label} would save ${fmtMinutes(saved)} of driving; your call.`;
}

const REVIEW_TELLS: [RegExp, string][] = [
  [/\b(quiet|peaceful|tranquil)\b/i, "quiet"],
  [/\b(noisy|noise|traffic|loud)\b/i, "some noise"],
  [/\b(steep|stairs|steps|staircase)\b/i, "stairs or a steep approach"],
  [/\b(mosquito|mosquitoes|bugs|insects)\b/i, "mosquitoes"],
  [/\b(pool)\b/i, "the pool gets praise"],
  [/\b(host|owner|hosts)\b.{0,40}\b(helpful|kind|lovely|wonderful|attentive)\b/i, "helpful hosts"],
  [/\b(supermarket|grocery|shops?)\b/i, "shops nearby"],
  [/\b(hot|no air ?con|no ac|air ?conditioning)\b/i, "heat or AC comes up"],
  [/\b(clean|spotless|immaculate)\b/i, "clean"],
  [/\b(parking)\b/i, "parking mentioned"],
];

/**
 * What the reviews say, in one line: the tells a listing never volunteers.
 * Takes the review texts Google returns (five at most) and names each tell
 * once, in the order they are worth knowing.
 */
export function reviewNotes(texts: string[]): string | null {
  const joined = texts.join("\n");
  const hits: string[] = [];
  for (const [re, note] of REVIEW_TELLS) if (re.test(joined)) hits.push(note);
  return hits.length ? hits.join(", ") : null;
}

/** "Needs 4 bedrooms and 3 baths" — the floor, when the listing does not say what it has. */
export function fitFloorText(brief: StayBrief): string {
  const f = brief.fit;
  return `Needs ${f.bedrooms} ${f.bedrooms === 1 ? "bedroom" : "bedrooms"} and ${f.baths} ${f.baths === 1 ? "bath" : "baths"}`;
}

/** The host questions the brief raises. */
export function hostQuestions(brief: StayBrief): string[] {
  const q: string[] = [];
  if (brief.fit.askGroundFloor) q.push("Which floor are the bedrooms on?");
  if (brief.party.kids > 0) q.push("Is the pool fenced or gated?");
  if (brief.fit.askCot) q.push("Is there a cot?");
  if (brief.kind === "house") q.push("Is there a supermarket within ten minutes?");
  return q;
}

/**
 * The area line for ONE base of a journey that needs several.
 *
 * The whole-journey headline says which side of the single centre to sit on —
 * "West of Tokyo, toward Osaka". That is advice for a trip with one base, and
 * with a hotel in Osaka already it is beside the point; worse, every base got
 * the SAME line, so the Osaka tab read "most of your places are around Tokyo"
 * (Brennan, 11 Sept 2026). A base says the one thing that is true of it.
 */
export function baseArea(brief: StayBrief, i: number): string | null {
  const b = brief.bases[i];
  if (!b) return null;
  return `Stay within ${brief.radiusMin} minutes of ${b.label}.`;
}

/** How far out a place can sit and still be a day from a base. */
const REACH_KM = 100;

/**
 * The places the journey probably will not get to.
 *
 * Brennan, 11 Sept 2026: "if you are suggesting Osaka and Tokyo, there are a
 * bunch of things on my map that I likely won't be able to do... you may want
 * to include copy that the trip, for the time allotted and where most of the
 * pins are, should centre in Tokyo and Osaka."
 *
 * The bases are chosen by weight of pins, so the outliers are silently left
 * behind and nothing ever says so. Naming them is not a complaint about the
 * plan; it is the sentence that lets him decide whether to move a base, drop
 * a place, or add nights.
 */
export function reachNote(brief: StayBrief): string | null {
  if (!brief.bases.length || !brief.anchors.length) return null;
  const far = brief.anchors
    .filter((a) => a.kind !== "airport" && a.kind !== "evening")
    .filter((a) => Math.min(...brief.bases.map((b) => greatCircleKm(b.lat, b.lng, a.lat, a.lng))) > REACH_KM)
    .sort((a, b) => b.days - a.days);
  if (!far.length) return null;
  // Two pins in the same town are two anchors with the same name, so the
  // sentence read "Kagoshima, Kagoshima and 3 more" on his real Japan
  // journey — caught by running all nine journeys through it, not by the
  // example I wrote by hand (11 Sept 2026).
  const names = Array.from(new Set(far.map((a) => a.label)));
  const list = names.length === 1 ? names[0]
    : names.length === 2 ? `${names[0]} and ${names[1]}`
    : names.length === 3 ? `${names[0]}, ${names[1]} and ${names[2]}`
    : `${names[0]}, ${names[1]} and ${names.length - 2} more`;
  const where = brief.bases.length > 1 ? "every base" : brief.bases[0].label;
  return `${list} ${far.length === 1 ? "sits" : "sit"} well outside ${where}; ${brief.nights} ${brief.nights === 1 ? "night" : "nights"} probably will not reach ${far.length === 1 ? "it" : "them"}.`;
}

export type { Anchor };
