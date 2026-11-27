/**
 * Everyone on one flight, on one card (27 Nov 2026, Brennan approved the mock:
 * "It's the same card but everyone's gonna have a different seat and a different
 * confirmation"). Two confirmations for AA 1993 used to be two cards; now the
 * card keeps one pass per person in details.travellers, and you swipe through them.
 *
 * The card's own seat, confirmation and notes stay the FIRST person's, so
 * everything that already reads them (the shared page, the week, search) is
 * unchanged. Each person may carry a boarding pass: a file kept in
 * card-attachments, shown big at the gate.
 */

export interface BoardingPass { path: string; name: string; type: string | null }
export interface Traveller {
  name: string | null;
  seat?: string | null;
  confirmation?: string | null;
  notes?: string | null;
  boarding_pass?: BoardingPass | null;
}

type Details = Record<string, unknown>;
/** What differs person to person; everything else is the flight's. */
export const PERSON_FIELDS = ["seat", "confirmation", "notes"] as const;
export type PersonField = (typeof PERSON_FIELDS)[number];
export const isPersonField = (f: string): f is PersonField => (PERSON_FIELDS as readonly string[]).includes(f);

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const pass = (v: unknown): BoardingPass | null => {
  const p = v as Partial<BoardingPass> | null;
  return p && typeof p.path === "string" && p.path ? { path: p.path, name: typeof p.name === "string" ? p.name : "Boarding pass", type: typeof p.type === "string" ? p.type : null } : null;
};

/** "Passenger: Isha Seth. Economy…" → "Isha Seth" (how the reader writes it into the notes). */
export function passengerName(notes: unknown): string | null {
  const m = typeof notes === "string" ? notes.match(/passenger(?:s)?\s*:\s*([^.\n;,]+)/i) : null;
  return m ? m[1].trim() || null : null;
}

/** The first word: "Isha Seth" → "Isha". */
export const firstName = (name: string | null | undefined) => (name ? name.trim().split(/\s+/)[0] : null);

/** This card's person, read from its own top-level fields. */
export function personFrom(d: Details | null | undefined): Traveller {
  const x = d ?? {};
  return {
    name: str(x.passenger) ?? passengerName(x.notes),
    seat: str(x.seat),
    confirmation: str(x.confirmation),
    notes: str(x.notes),
    boarding_pass: null,
  };
}

/**
 * Everyone on the card, in order. A card that never had a second person has
 * no list: it reads as one person from its own fields (the pass shows no name
 * unless the reader found one).
 */
export function travellersOf(d: Details | null | undefined): Traveller[] {
  const raw = (d ?? {}).travellers;
  if (!Array.isArray(raw) || raw.length === 0) return [personFrom(d)];
  return raw.map((t, i) => {
    const o = (t ?? {}) as Details;
    const own: Traveller = { name: str(o.name), seat: str(o.seat), confirmation: str(o.confirmation), notes: str(o.notes), boarding_pass: pass(o.boarding_pass) };
    // The first person IS the card's top-level fields.
    return i === 0 ? { ...own, seat: str((d ?? {}).seat), confirmation: str((d ?? {}).confirmation), notes: str((d ?? {}).notes) } : own;
  });
}

const stored = (list: Traveller[]): Details[] => list.map((t, i) => {
  const o: Details = { name: t.name ?? null };
  // The first person's seat, confirmation and notes live at the top level only.
  if (i > 0) { o.seat = t.seat ?? null; o.confirmation = t.confirmation ?? null; o.notes = t.notes ?? null; }
  if (t.boarding_pass) o.boarding_pass = t.boarding_pass;
  return o;
});

/** The card's details as one person sees them: their seat, confirmation and notes on top. */
export function viewFor(d: Details | null | undefined, i: number): Details {
  const list = travellersOf(d);
  const t = list[Math.max(0, Math.min(i, list.length - 1))];
  return { ...(d ?? {}), seat: t.seat ?? null, confirmation: t.confirmation ?? null, notes: t.notes ?? null };
}

/** One person's seat, confirmation or notes changed; the first person's is the card's own field. */
export function withPersonField(d: Details | null | undefined, i: number, field: PersonField, value: string | null): Details {
  const base = { ...(d ?? {}) };
  if (i === 0) return { ...base, [field]: value };
  const list = travellersOf(base);
  if (!list[i]) return base;
  list[i] = { ...list[i], [field]: value };
  return { ...base, travellers: stored(list) };
}

/** One person's boarding pass added (or taken away with null). A one-person card gets its list here. */
export function withBoardingPass(d: Details | null | undefined, i: number, bp: BoardingPass | null): Details {
  const base = { ...(d ?? {}) };
  const list = travellersOf(base);
  if (!list[i]) return base;
  list[i] = { ...list[i], boarding_pass: bp };
  return { ...base, travellers: stored(list) };
}

const digits = (v: unknown) => (typeof v === "string" ? (v.match(/\d+/g) ?? []).join("").replace(/^0+/, "") : "");
const code = (v: unknown) => (typeof v === "string" ? (v.match(/\(([A-Z]{3})\)/)?.[1] ?? v.trim().toUpperCase().slice(0, 3)) : "");

/**
 * The same flight: same number, same day, same airport out. "AA 1993" and
 * "1993" match; a different airline's 1993 out of another airport does not.
 */
export function sameFlight(a: { details: unknown; date: string | null }, b: { details: unknown; date: string | null }): boolean {
  const x = (a.details ?? {}) as Details, y = (b.details ?? {}) as Details;
  const n = digits(x.flight_number);
  if (!n || n !== digits(y.flight_number)) return false;
  if (!a.date || a.date !== b.date) return false;
  const ox = code(x.origin_airport), oy = code(y.origin_airport);
  return !ox || !oy || ox === oy;
}

const samePerson = (a: Traveller, b: Traveller) =>
  (!!a.confirmation && a.confirmation === b.confirmation && (!a.name || !b.name || a.name === b.name)) && (!a.seat || !b.seat || a.seat === b.seat);

/**
 * Another confirmation for a flight already on the card: its person joins the
 * list, and the price is added once (same currency only). The same person
 * uploaded twice changes nothing.
 */
export function joinFlight(existing: Details | null | undefined, incoming: Details | null | undefined): Details {
  const base = { ...(existing ?? {}) };
  const list = travellersOf(base);
  const them = personFrom(incoming);
  if (list.some((t) => samePerson(t, them))) return base;
  const out: Details = { ...base, travellers: stored([...list, them]) };
  const a = typeof base.paid_total === "number" ? base.paid_total : null;
  const b = typeof (incoming ?? {}).paid_total === "number" ? (incoming as Details).paid_total as number : null;
  if (b != null) {
    if (a == null) { out.paid_total = b; out.paid_currency = (incoming as Details).paid_currency; }
    else if (base.paid_currency === (incoming as Details).paid_currency) out.paid_total = Math.round((a + b) * 100) / 100;
  }
  return out;
}

/**
 * Everyone the reader found on one booking (a family under one confirmation):
 * the first is the card's own person, the rest join the list with their seats
 * and the same confirmation. One passenger only names the card's person.
 */
export function withPassengers(d: Details | null | undefined, passengers: unknown): Details {
  const base = { ...(d ?? {}) };
  const list = (Array.isArray(passengers) ? passengers : [])
    .map((x) => ({ name: str((x as Details)?.name), seat: str((x as Details)?.seat) }))
    .filter((x) => x.name);
  if (!list.length) return base;
  base.passenger = list[0].name;
  if (list[0].seat && !str(base.seat)) base.seat = list[0].seat;
  if (list.length === 1) return base;
  const people: Traveller[] = [personFrom(base), ...list.slice(1).map((x) => ({ name: x.name, seat: x.seat, confirmation: str(base.confirmation), notes: null, boarding_pass: null }))];
  return { ...base, travellers: stored(people) };
}
