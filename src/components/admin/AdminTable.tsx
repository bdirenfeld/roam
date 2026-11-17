"use client";

import { useEffect, useMemo, useState } from "react";
import { ago, countryOf, filterRows, isQuiet, sortRows, whenTag, type AdminRow, type Filter, type SortKey } from "@/lib/adminJourneys";

const CAPTION = "rgba(26,26,46,0.62)";
const SOFT = "rgba(26,26,46,0.5)";
const TONES = { soon: { background: "#FBEFE7", color: "#B0541F" }, now: { background: "#E8F3EC", color: "#1D7A55" }, past: { background: "transparent", color: SOFT }, plain: { background: "rgba(26,26,46,0.05)", color: "#1A1A2E" } } as const;

const fmt = (d: string, year = true) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) });
const range = (r: AdminRow) => !r.start_date ? "No dates" : !r.end_date ? fmt(r.start_date) : `${fmt(r.start_date, false)} – ${fmt(r.end_date)}`;

const COLUMNS: { key: SortKey; label: string; num?: boolean; firstDesc?: boolean }[] = [
  { key: "title", label: "Journey" },
  { key: "country", label: "Country" },
  { key: "owner", label: "Owner" },
  { key: "dates", label: "Dates" },
  { key: "active", label: "Last active", firstDesc: true },
  { key: "planned", label: "Planned", num: true, firstDesc: true },
  { key: "saved", label: "Saved", num: true, firstDesc: true },
  { key: "guests", label: "Guests", num: true, firstDesc: true },
];

const FILTERS: [Filter, string][] = [["all", "All"], ["upcoming", "Upcoming"], ["underway", "Under way"], ["past", "Past"]];

/**
 * Every journey as a table (17 Nov 2026, Brennan's mock): search and the
 * phase pills first, then the rows; every heading sorts, a second click flips
 * it. Last active, newest first, until he picks another. A row opens the
 * journey read only through /admin/view (a full page load, see lib/adminView).
 */
export default function AdminTable({ rows }: { rows: AdminRow[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "active", desc: true });
  // "Today" and "now" are the browser's, read after mount so the server render matches.
  const [clock, setClock] = useState<{ today: string; now: number } | null>(null);
  useEffect(() => { const d = new Date(); setClock({ today: d.toLocaleDateString("en-CA"), now: d.getTime() }); }, []);

  const shown = useMemo(() => sortRows(filterRows(rows, q, filter, clock?.today ?? "0000-00-00"), sort.key, sort.desc), [rows, q, filter, clock, sort]);
  const tap = (c: (typeof COLUMNS)[number]) => setSort((s) => (s.key === c.key ? { key: c.key, desc: !s.desc } : { key: c.key, desc: !!c.firstDesc }));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 h-10 w-[340px] max-w-full px-4 rounded-full" style={{ boxShadow: "inset 0 0 0 1px rgba(26,26,46,0.14)" }}>
          <span aria-hidden="true" style={{ color: SOFT }}>⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search journey, person or place" aria-label="Search journeys" className="flex-1 min-w-0 bg-transparent outline-none text-[14px]" />
        </label>
        <div className="flex gap-1.5" role="group" aria-label="Show">
          {FILTERS.map(([f, label]) => (
            <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
              className="h-8 px-3.5 rounded-full text-[13px]" style={filter === f ? { background: "#1A1A2E", color: "#fff" } : { background: "rgba(26,26,46,0.05)", color: "#1A1A2E" }}>{label}</button>
          ))}
        </div>
      </div>

      <table className="w-full mt-5 text-[14px] border-collapse" data-testid="admin-table">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c.key} className={`px-3 py-2.5 border-b border-black/10 ${c.num ? "text-right" : "text-left"}`} aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : "none"}>
                <button type="button" onClick={() => tap(c)} className="text-[11px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap" style={{ color: sort.key === c.key ? "#1A1A2E" : CAPTION }}>
                  {c.label}{sort.key === c.key ? (sort.desc ? " ↓" : " ↑") : ""}
                </button>
              </th>
            ))}
            <th className="border-b border-black/10" />
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const tag = clock ? whenTag(r, clock.today) : null;
            const quiet = clock ? isQuiet(r.last_active, clock.now) : false;
            const open = () => { window.location.href = `/admin/view/${r.id}`; };
            return (
              <tr key={r.id} data-testid="admin-row" onClick={open} className="cursor-pointer hover:bg-[#F7F7F5] align-top">
                <td className="px-3 py-3.5 border-b border-black/5">
                  {/* A plain link too, for keyboard and middle-click; a full page load either way. */}
                  <a href={`/admin/view/${r.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold">{r.title || "Untitled"}</a>
                  {r.archived && <div className="text-[12px] mt-0.5" style={{ color: SOFT }}>Archived</div>}
                </td>
                <td className="px-3 py-3.5 border-b border-black/5">{countryOf(r.destination) || <span style={{ color: SOFT }}>—</span>}</td>
                <td className="px-3 py-3.5 border-b border-black/5 whitespace-nowrap">
                  <span aria-hidden="true" className="inline-flex w-6 h-6 rounded-full items-center justify-center text-[11px] font-semibold mr-2 align-middle" style={{ background: "#E9E7F5", color: "#4B4290" }}>{(r.owner ?? "?").trim().charAt(0).toUpperCase()}</span>
                  {r.owner ?? "Someone"}
                </td>
                <td className="px-3 py-3.5 border-b border-black/5 whitespace-nowrap">
                  {range(r)}
                  {tag && <div><span className="inline-block mt-1 text-[11.5px] px-2 py-0.5 rounded-full" style={TONES[tag.tone]}>{tag.text}</span></div>}
                </td>
                <td className="px-3 py-3.5 border-b border-black/5 whitespace-nowrap" style={{ color: quiet ? SOFT : undefined }}>{clock ? ago(r.last_active, clock.now) : ""}</td>
                {(["planned", "saved"] as const).map((k) => (
                  <td key={k} className="px-3 py-3.5 border-b border-black/5 text-right tabular-nums" style={{ color: r[k] ? undefined : SOFT }}>{r[k]}</td>
                ))}
                <td className="px-3 py-3.5 border-b border-black/5 text-right tabular-nums" style={{ color: r.guests ? undefined : SOFT }}>{r.guests || "—"}</td>
                <td className="px-3 py-3.5 border-b border-black/5 text-right" style={{ color: "rgba(26,26,46,0.35)" }} aria-hidden="true">›</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!shown.length && <p className="mt-8 text-center text-[14px]" style={{ color: CAPTION }}>No journeys match.</p>}
    </div>
  );
}
