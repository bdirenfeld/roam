/**
 * The admin table's rules (17 Nov 2026): what each column says and how rows
 * sort and filter. Pure, so the table component only draws.
 */
export interface AdminRow {
  id: string; title: string | null; destination: string | null;
  start_date: string | null; end_date: string | null; owner: string | null;
  created_at: string; planned: number; saved: number; guests: number;
  last_active: string | null; archived: boolean;
}
export type Phase = "upcoming" | "underway" | "past" | "undated";
export type SortKey = "title" | "country" | "owner" | "dates" | "active" | "planned" | "saved" | "guests";
export type Filter = "all" | "upcoming" | "underway" | "past";

/** "Tuscany, Italy" → "Italy"; "Iceland" → "Iceland"; "Ontario, Canada" → "Canada". */
export const countryOf = (destination: string | null): string => {
  const parts = (destination ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
};

export function phaseOf(r: Pick<AdminRow, "start_date" | "end_date">, today: string): Phase {
  if (!r.start_date) return "undated";
  if (r.end_date && r.end_date < today) return "past";
  if (r.start_date > today) return "upcoming";
  return "underway";
}

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY);

/** The tag under the dates: "in 3 days" (soon), "in 4 months", "under way", "past". */
export function whenTag(r: Pick<AdminRow, "start_date" | "end_date">, today: string): { text: string; tone: "soon" | "now" | "past" | "plain" } | null {
  const p = phaseOf(r, today);
  if (p === "undated") return null;
  if (p === "past") return { text: "past", tone: "past" };
  if (p === "underway") return { text: "under way", tone: "now" };
  const n = days(today, r.start_date!);
  if (n <= 14) return { text: n === 1 ? "tomorrow" : `in ${n} days`, tone: "soon" };
  if (n < 60) return { text: `in ${Math.round(n / 7)} weeks`, tone: "plain" };
  return { text: `in ${Math.round(n / 30)} months`, tone: "plain" };
}

/** "12 min ago", "3 h ago", "yesterday", "5 days ago", "5 weeks ago", "4 months ago". */
export function ago(iso: string | null, now: number): string {
  if (!iso) return "";
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  return `${Math.round(d / 30)} months ago`;
}

/** Faded once a journey has been quiet for two weeks. */
export const isQuiet = (iso: string | null, now: number) => !iso || now - Date.parse(iso) > 14 * DAY;

const text = (s: string | null | undefined) => (s ?? "").toLocaleLowerCase();

export function filterRows(rows: AdminRow[], q: string, f: Filter, today: string): AdminRow[] {
  const needle = q.trim().toLocaleLowerCase();
  return rows.filter((r) => {
    if (f !== "all" && phaseOf(r, today) !== f) return false;
    if (!needle) return true;
    return [r.title, r.destination, r.owner].some((s) => text(s).includes(needle));
  });
}

/** Sorts by a column; text A→Z and numbers / dates high→low first, flipped by `desc`. Ties keep last-active order. */
export function sortRows(rows: AdminRow[], key: SortKey, desc: boolean): AdminRow[] {
  const val = (r: AdminRow): string | number => {
    switch (key) {
      case "title": return text(r.title);
      case "country": return text(countryOf(r.destination));
      case "owner": return text(r.owner);
      case "dates": return r.start_date ?? "";
      case "active": return r.last_active ? Date.parse(r.last_active) : 0;
      default: return r[key];
    }
  };
  const byActive = (a: AdminRow, b: AdminRow) => (Date.parse(b.last_active ?? "0") || 0) - (Date.parse(a.last_active ?? "0") || 0);
  return rows.slice().sort((a, b) => {
    const x = val(a), y = val(b);
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return (desc ? -c : c) || byActive(a, b);
  });
}
