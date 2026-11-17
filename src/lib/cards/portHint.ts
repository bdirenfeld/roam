/**
 * "Is this a port of call?" (17 Nov 2026). Don built his cruise by hand: each
 * port was an Explore place named for the town, 7am–6pm. Nothing told Roam it
 * was a port, so the ship's blue never appeared. A card that looks like that
 * offers one tap to mark it a Port.
 *
 * Looks like a port call: an activity place that IS a town (its address is the
 * town, maybe after a postcode: "350 Grundarfjörður, Iceland"), with a start by
 * 10am and at least four hours to its end.
 */
type HintCard = { start_time: string | null; end_time: string | null; place?: { type?: string | null; sub_type?: string | null; title?: string | null; address?: string | null } | null };

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function looksLikePortCall(c: HintCard): boolean {
  const p = c.place;
  if (!p || p.type !== "activity" || !p.title || !p.address || !c.start_time || !c.end_time) return false;
  const start = toMin(c.start_time), end = toMin(c.end_time);
  if (start > 10 * 60 || end - start < 4 * 60) return false;
  const lead = fold(p.address.split(",")[0].replace(/^\s*[\d\s-]+/, ""));
  return lead === fold(p.title);
}
