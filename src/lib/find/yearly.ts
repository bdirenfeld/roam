/**
 * Yearly events, found once per area and kept (1 Oct 2026). Brennan wanted to
 * stop paying Claude for every events search; no free source lists what
 * happens every year (Wikidata had 28 Tuscan events, mostly undated, no
 * Bravio). So Claude is asked once per area for the year's recurring events,
 * each with its date rule ("last Sunday of August"), and every later trip
 * there, anyone's, any year, is answered from that list for free. Pure.
 */

import type { FindResult } from "./merge";

export interface YearlyRule {
  /** 1–12. */
  month: number;
  /** A fixed day of the month, when it has one. */
  day: number | null;
  /** Or a weekday rule: "Sun" with nth 1–4, or -1 for the last. */
  weekday: string | null;
  nth: number | null;
  /** How many days it runs. */
  days: number;
}

export interface YearlyPick extends YearlyRule {
  event: string; name: string; near: string | null; why: string;
  sourceName: string | null; sourceUrl: string | null; kids: boolean;
}

/** What is kept for an area: Google's checked place and the rule. */
export interface YearlyItem { result: FindResult; rule: YearlyRule }

/** One answer per area of about 10 km, kept for good; the version says which question it answers. */
export function yearlyKey(lat: number, lng: number): string {
  return `yearly|v1|${lat.toFixed(1)}|${lng.toFixed(1)}`;
}

export function yearlyPrompt(where: string): string {
  return `List the events held every year in or within about two hours' drive of ${where}: traditional festivals, palios and
historic races, village food festivals, feast-day processions and re-enactments first, then the major annual music, arts and
food festivals. Cover the whole year. Up to 30, the best-known first. Search official tourism and town sites.
For each: "event" is its own name; "name" is the venue or starting point Google Maps would know; "near" is the town;
"month" is 1–12; "day" is the date when it is always the same (else null); "weekday" ("Sun", "Mon", …) with "nth" (1–4, or -1
for the last) when it follows a rule like "the last Sunday of August" (else null); "days" is how many days it runs.
"why" says in under 16 words what it is, without the date. "kids" is true when it suits children.
Reply with JSON only:
{"events":[{"event":string,"name":string,"near":string,"month":number,"day":number|null,"weekday":string|null,"nth":number|null,"days":number,"why":string,"source_name":string,"source_url":string,"kids":boolean}]}
"source_url" must be a page you actually read.`;
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function parseYearly(text: string): YearlyPick[] {
  const t = text.trim();
  for (const c of [t, t.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1], t.match(/\{[\s\S]*\}/)?.[0]]) {
    if (!c) continue;
    try {
      const j = JSON.parse(c.trim()) as { events?: unknown };
      if (!Array.isArray(j.events)) continue;
      return (j.events as Record<string, unknown>[]).map((e) => {
        const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
        const wd = typeof e.weekday === "string" ? WD.find((d) => d.toLowerCase() === e.weekday!.toString().slice(0, 3).toLowerCase()) ?? null : null;
        return {
          event: typeof e.event === "string" ? e.event.trim().slice(0, 120) : "",
          name: typeof e.name === "string" ? e.name.trim().slice(0, 120) : "",
          near: typeof e.near === "string" ? e.near.trim().slice(0, 80) : null,
          month: num(e.month) ?? 0,
          day: num(e.day),
          weekday: wd,
          nth: wd ? num(e.nth) : null,
          days: Math.max(1, Math.min(31, num(e.days) ?? 1)),
          why: typeof e.why === "string" ? e.why.trim().slice(0, 140) : "",
          sourceName: typeof e.source_name === "string" ? e.source_name.trim().slice(0, 60) : null,
          sourceUrl: typeof e.source_url === "string" && /^https?:\/\//.test(e.source_url) ? e.source_url : null,
          kids: e.kids === true,
        };
      }).filter((e) => e.event.length > 1 && e.name.length > 1 && e.month >= 1 && e.month <= 12);
    } catch { /* next */ }
  }
  return [];
}

/** The rule's first day in a year (YYYY-MM-DD), or null when only the month is known. */
export function dateIn(r: YearlyRule, year: number): string | null {
  const m = r.month - 1;
  if (r.day) return new Date(Date.UTC(year, m, r.day)).toISOString().slice(0, 10);
  if (r.weekday && r.nth) {
    const wd = WD.indexOf(r.weekday);
    if (r.nth < 0) {
      const last = new Date(Date.UTC(year, m + 1, 0));
      return new Date(Date.UTC(year, m, last.getUTCDate() - ((last.getUTCDay() - wd + 7) % 7))).toISOString().slice(0, 10);
    }
    const first = new Date(Date.UTC(year, m, 1)).getUTCDay();
    return new Date(Date.UTC(year, m, 1 + ((wd - first + 7) % 7) + 7 * (r.nth - 1))).toISOString().slice(0, 10);
  }
  return null;
}

const label = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
};

/**
 * The yearly events on a trip's dates, each with its date line in the form
 * Find already uses ("Usually Sun 29 Aug: …"), so the rest of Roam (the
 * days it is on, the drop rule) reads it the same way. An event known only
 * by its month counts when the trip touches that month ("Usually in August").
 */
export function yearlyForTrip(items: YearlyItem[], from: string, to: string): FindResult[] {
  const a = Date.parse(from + "T00:00:00Z"), b = Date.parse(to + "T00:00:00Z");
  const years = Array.from(new Set([new Date(a).getUTCFullYear(), new Date(b).getUTCFullYear()]));
  const months = new Set<number>();
  for (let t = a; t <= b; t += 86_400_000) months.add(new Date(t).getUTCMonth() + 1);
  const out: FindResult[] = [];
  for (const { result, rule } of items) {
    let line: string | null = null;
    for (const y of years) {
      const start = dateIn(rule, y);
      if (!start) continue;
      const s = Date.parse(start + "T00:00:00Z"), e = s + (rule.days - 1) * 86_400_000;
      if (e < a || s > b) continue;
      const end = new Date(e).toISOString().slice(0, 10);
      line = rule.days > 1 ? `Usually ${label(start)}–${label(end)}` : `Usually ${label(start)}`;
      break;
    }
    if (!line && !rule.day && !rule.weekday && months.has(rule.month)) {
      line = `Usually in ${new Date(Date.UTC(2000, rule.month - 1, 1)).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })}`;
    }
    if (line) out.push({ ...result, why: `${line}: ${result.why}` });
  }
  return out;
}

/**
 * Google's own event listings for a place and month, to open in the browser
 * (1 Oct 2026): one-off concerts and shows, for free, with no API. Roam's
 * Events list is the area's yearly events; this is the rest.
 */
export function whatsOnUrl(place: string, from: string): string {
  const month = new Date(from + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return `https://www.google.com/search?q=${encodeURIComponent(`events in ${place} ${month}`)}&ibp=htl;events`;
}
