/**
 * The rental voucher on a rental car card (19 Nov 2026, Brennan approved the
 * mock after checking how rental vouchers are laid out: Auto Europe, Rentcars,
 * Discover Cars). Pick-up and drop-off side by side with day, time and place,
 * the days between; confirmation, price and the desk's phone in one strip;
 * then the lines vouchers lead with: which car, where to find the desk, fuel.
 *
 * A rental is two cards (lib/confirmations/toCards closingEvent): the pick-up,
 * which holds details.drop_off (the return day) and drop_off_location, and the
 * return, titled "Return the rental car…", on that day. Either card shows the
 * whole rental; this pairs them.
 */

export interface VoucherCard {
  id: string;
  day_id: string | null;
  place_id?: string | null;
  start_time: string | null;
  confirmed?: boolean | null;
  details: unknown;
  place?: { title?: string | null; sub_type?: string | null } | null;
}
export interface VoucherEnd { date: string | null; time: string | null; where: string | null }
export interface RentalVoucher {
  side: "pickup" | "return";
  company: string | null;
  pickup: VoucherEnd;
  dropoff: VoucherEnd;
  days: number | null;
  confirmation: string | null;
  paid: { amount: number; currency: string } | null;
  phone: string | null;
  carClass: string | null;
  pickupInfo: string | null;
  fuel: string | null;
  booked: boolean;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const det = (c: VoucherCard) => (c.details ?? {}) as Record<string, unknown>;

export const isRentalCar = (subType: string | null | undefined) => subType === "car_rental";
/** The drop-off card: "Return the rental car · …", "Return the rental van". */
export const isReturnCard = (c: VoucherCard) => /^return\b/i.test(str(det(c).title) ?? "");

/** "Pick up rental car · Alamo · Harry Reid International Airport" → "Alamo"; details.company first. */
export function companyOf(c: VoucherCard): string | null {
  const own = str(det(c).company);
  if (own) return own;
  const t = (str(det(c).title) ?? "").replace(/^pick.?up\s+(the\s+)?rental\s+\w+\s*·?\s*/i, "");
  if (!t || /^return\b/i.test(t)) return null;
  return t.split(" · ")[0].trim() || null;
}

/**
 * A place said briefly: "Hertz Car Rental - Las Vegas - Harry Reid International Airport (LAS)"
 * → "Harry Reid International Airport (LAS)"; "Harry Reid International Airport, 7135 Gilespie St…"
 * → "Harry Reid International Airport".
 */
export function shortWhere(s: string | null | undefined): string | null {
  if (!s || !s.trim()) return null;
  const dash = s.split(/\s+-\s+/);
  return dash[dash.length - 1].split(",")[0].trim() || null;
}

const daysBetween = (a: string | null, b: string | null) =>
  a && b ? Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000) : null;

/**
 * The voucher for `card`, given the journey's rental cards with their dates.
 * The partner is the other card on the same desk (same place) — the return on
 * the pick-up's drop_off day, or the nearest pick-up before a return.
 */
export function rentalVoucher<C extends VoucherCard>(card: C, cardDate: string | null, others: { card: C; date: string | null }[]): RentalVoucher {
  const ret = isReturnCard(card);
  const d = det(card);
  const sameDesk = others.filter((o) => o.card.id !== card.id && (!card.place_id || o.card.place_id === card.place_id));
  let pickupCard: C = card, pickupDate = cardDate, returnCard: C | null = null, returnDate: string | null = null;
  if (ret) {
    const p = sameDesk.filter((o) => !isReturnCard(o.card) && (!o.date || !cardDate || o.date <= cardDate))
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0];
    if (p) { pickupCard = p.card; pickupDate = p.date; }
    returnCard = card; returnDate = cardDate;
  } else {
    const want = str(d.drop_off);
    const r = sameDesk.find((o) => isReturnCard(o.card) && (!want || o.date === want));
    returnCard = r?.card ?? null;
    returnDate = r?.date ?? want;
  }
  const pd = det(pickupCard);
  const paidAmount = typeof pd.paid_total === "number" ? pd.paid_total : null;
  const paidCur = str(pd.paid_currency);
  const deskName = shortWhere(card.place?.title ?? null);
  const pick = (k: string) => str(d[k]) ?? str(pd[k]);
  return {
    side: ret ? "return" : "pickup",
    company: companyOf(card) ?? companyOf(pickupCard),
    pickup: { date: pickupDate, time: ret && pickupCard === card ? null : pickupCard.start_time, where: shortWhere(pickupCard.place?.title ?? null) ?? deskName },
    dropoff: { date: returnDate, time: returnCard?.start_time ?? null, where: shortWhere(str(pd.drop_off_location) ?? str(d.drop_off_location)) ?? deskName },
    days: daysBetween(pickupDate, returnDate),
    confirmation: pick("confirmation"),
    paid: paidAmount != null && paidCur ? { amount: paidAmount, currency: paidCur } : null,
    phone: pick("phone"),
    carClass: pick("car_class"),
    pickupInfo: pick("pickup_instructions"),
    fuel: pick("fuel_policy"),
    booked: !!(card.confirmed || pickupCard.confirmed),
  };
}

/** "€450", "450 EUR", "US$279.31", "C$600", "£300" → an amount and a currency; a bare "$450" is unclear, so null. */
export function readPaid(s: string): { amount: number; currency: string } | null {
  const t = s.replace(/,/g, "").trim();
  const num = t.match(/\d+(\.\d{1,2})?/);
  if (!num) return null;
  const amount = Number(num[0]);
  const code = t.match(/\b([A-Z]{3})\b/)?.[1];
  const currency = code ?? (/US\$/.test(t) ? "USD" : /(C|CA)\$/.test(t) ? "CAD" : /€/.test(t) ? "EUR" : /£/.test(t) ? "GBP" : null);
  return currency ? { amount, currency } : null;
}

/** "US$279.31", "€450", "C$600". */
export function paidLabel(p: { amount: number; currency: string }): string {
  const sym: Record<string, string> = { USD: "US$", CAD: "C$", EUR: "€", GBP: "£" };
  const n = p.amount % 1 === 0 ? String(p.amount) : p.amount.toFixed(2);
  return sym[p.currency] ? `${sym[p.currency]}${n}` : `${n} ${p.currency}`;
}
