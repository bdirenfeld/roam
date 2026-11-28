/**
 * One travel card instead of two leg cards (28 Nov 2026, Brennan, tapping "Leave for Florence":
 * "it should just be one card and it shows the steps of how you need to get from point A to
 * point B. Having two cards seems complicated"; mock approved).
 *
 * The steps of a joined travel run, in order: each leg ("Drive to Lucca station · 10 min · from
 * Villa Zambaldi"), the time to change between legs when there is some ("15 min to change"),
 * and the arrival ("Arrive Florence").
 */
import { legModeWord, legDestTitle, legDurationMins, readFrom } from "@/lib/travel/leg";
import { stripDuration, stripDest } from "@/lib/week/travelStrip";
import type { TimedCard } from "@/lib/cardTime";

type StepCard = TimedCard & { id: string; details?: unknown; place?: { title?: string | null; type?: string | null; sub_type?: string | null } | null };

export type TravelStep<C> =
  | { kind: "leg"; card: C; time: string | null; title: string; sub: string }
  | { kind: "change"; mins: number }
  | { kind: "arrive"; time: string | null; title: string };

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;

export function travelSteps<C extends StepCard>(cards: C[], dest: string, endMin: number | null): TravelStep<C>[] {
  const out: TravelStep<C>[] = [];
  cards.forEach((c, i) => {
    const prev = cards[i - 1];
    if (prev?.end_time && c.start_time) {
      const gap = toMin(c.start_time) - toMin(prev.end_time);
      if (gap > 0) out.push({ kind: "change", mins: gap });
    }
    // No mode, no word (leg.ts: the app does not guess Drive): "To Lucca".
    const word = legModeWord(c.details);
    const to = legDestTitle(c) ? stripDest(legDestTitle(c)) : "";
    const mins = legDurationMins(c);
    // "from" only on the first leg: after that it is where the last one ended.
    const from = i === 0 ? readFrom(c.details)?.title ?? null : null;
    out.push({
      kind: "leg", card: c, time: c.start_time ?? null,
      title: to ? (word ? `${word} to ${to}` : `To ${to}`) : word || "Travel",
      sub: [mins ? stripDuration(mins) : null, from ? `from ${from}` : null].filter(Boolean).join(" · "),
    });
  });
  out.push({ kind: "arrive", time: endMin !== null ? hm(endMin) : null, title: `Arrive ${dest}` });
  return out;
}
