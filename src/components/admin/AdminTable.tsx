"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ago, applyPicks, countryOf, filterRows, isQuiet, matchesTyped, pickOptions, pickValue, sortRows, whenTag, type AdminRow, type Filter, type PickColumn, type Picks, type SortKey } from "@/lib/adminJourneys";

const CAPTION = "rgba(26,26,46,0.62)";
const SOFT = "rgba(26,26,46,0.5)";
const CHIP = "rgba(26,26,46,0.05)";
const TONES = { soon: { background: "#FBEFE7", color: "#B0541F" }, now: { background: "#E8F3EC", color: "#1D7A55" }, past: { background: "transparent", color: SOFT }, plain: { background: "rgba(26,26,46,0.05)", color: "#1A1A2E" } } as const;

const fmt = (d: string, year = true) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) });
const range = (r: AdminRow) => !r.start_date ? "No dates" : !r.end_date ? fmt(r.start_date) : `${fmt(r.start_date, false)} – ${fmt(r.end_date)}`;

// Owner, Country, Journey first; Last active, which is about the person rather than the trip, last (18 Nov 2026).
const COLUMNS: { key: SortKey; label: string; num?: boolean; firstDesc?: boolean; pick?: PickColumn }[] = [
  { key: "owner", label: "Owner", pick: "owner" },
  { key: "country", label: "Country", pick: "country" },
  { key: "title", label: "Journey" },
  { key: "dates", label: "Dates" },
  { key: "planned", label: "Planned", num: true, firstDesc: true },
  { key: "saved", label: "Saved", num: true, firstDesc: true },
  { key: "guests", label: "Guests", num: true, firstDesc: true },
  { key: "active", label: "Last active", firstDesc: true },
];

const FILTERS: [Filter, string][] = [["all", "All"], ["upcoming", "Upcoming"], ["underway", "Under way"], ["past", "Past"]];

/**
 * Every journey as a table (17 Nov 2026, Brennan's mock): search and the
 * phase pills first, then the rows. Owner and Country open an Excel-style
 * checklist (18 Nov 2026); the other headings sort, a second click flips it.
 * Clicking a name or country in a row shows only that one. A row opens the
 * journey through /admin/view (a full page load, see lib/adminView).
 */
export default function AdminTable({ rows }: { rows: AdminRow[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "active", desc: true });
  const [picks, setPicks] = useState<Picks>({});
  const [menu, setMenu] = useState<PickColumn | null>(null);
  // "Today" and "now" are the browser's, read after mount so the server render matches.
  const [clock, setClock] = useState<{ today: string; now: number } | null>(null);
  useEffect(() => { const d = new Date(); setClock({ today: d.toLocaleDateString("en-CA"), now: d.getTime() }); }, []);

  const searched = useMemo(() => filterRows(rows, q, filter, clock?.today ?? "0000-00-00"), [rows, q, filter, clock]);
  const shown = useMemo(() => sortRows(applyPicks(searched, picks), sort.key, sort.desc), [searched, picks, sort]);
  const tap = (c: (typeof COLUMNS)[number]) => setSort((s) => (s.key === c.key ? { key: c.key, desc: !s.desc } : { key: c.key, desc: !!c.firstDesc }));
  const anyPick = !!(picks.owner || picks.country);
  const only = (col: PickColumn, value: string) => { setPicks((p) => ({ ...p, [col]: new Set([value]) })); setMenu(null); };

  return (
    <div>
      {/* Frozen like a spreadsheet's top rows (18 Nov 2026): the ink bar is sticky at 0 (56px),
          this row at 56px for 64px, the headings at 120px. Change one height, change all three. */}
      <div className="sticky top-14 z-10 bg-white h-16 flex items-center gap-3" data-testid="admin-controls">
        <label className="flex items-center gap-2 h-10 w-[340px] max-w-full px-4 rounded-full" style={{ boxShadow: "inset 0 0 0 1px rgba(26,26,46,0.14)" }}>
          <span aria-hidden="true" style={{ color: SOFT }}>⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search journey, person or place" aria-label="Search journeys" className="flex-1 min-w-0 bg-transparent outline-none text-[14px]" />
        </label>
        <div className="flex gap-1.5" role="group" aria-label="Show">
          {FILTERS.map(([f, label]) => (
            <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
              className="h-8 px-3.5 rounded-full text-[13px]" style={filter === f ? { background: "#1A1A2E", color: "#fff" } : { background: CHIP, color: "#1A1A2E" }}>{label}</button>
          ))}
        </div>
        {anyPick && (
          <button type="button" onClick={() => setPicks({})} className="h-8 px-3.5 rounded-full text-[13px]" style={{ background: CHIP, color: "#1A1A2E" }}>✕ Clear filters</button>
        )}
      </div>

      <table className="w-full text-[14px] border-collapse" data-testid="admin-table">
        <thead>
          <tr>
            {COLUMNS.map((c) => {
              const picked = c.pick ? picks[c.pick] : null;
              const arrow = sort.key === c.key ? (sort.desc ? " ↓" : " ↑") : "";
              return (
                <th key={c.key} className={`sticky top-[120px] ${menu && menu === c.pick ? "z-30" : "z-10"} bg-white px-3 py-2.5 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)] ${c.num ? "text-right" : "text-left"}`} aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : "none"}>
                  <div className="relative inline-block">
                    <button type="button" onClick={() => (c.pick ? setMenu((m) => (m === c.pick ? null : c.pick!)) : tap(c))}
                      aria-haspopup={c.pick ? "dialog" : undefined} aria-expanded={c.pick ? menu === c.pick : undefined}
                      className={`text-[11px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap ${c.pick ? "inline-flex items-center gap-1.5 -mx-2 px-2 py-0.5 rounded-full hover:bg-[rgba(26,26,46,0.05)]" : ""}`}
                      style={{ color: sort.key === c.key || picked ? "#1A1A2E" : CAPTION, background: c.pick && menu === c.pick ? CHIP : undefined }}>
                      {c.label}
                      {picked && <span className="rounded-full px-1.5 text-[10px] tracking-normal" style={{ background: "#1A1A2E", color: "#fff" }}>{picked.size}</span>}
                      {arrow}
                      {c.pick && <span aria-hidden="true">▾</span>}
                    </button>
                    {c.pick && menu === c.pick && (
                      <PickMenu
                        col={c.pick} label={c.label}
                        // Like Excel: the list and its counts are what the other filters leave.
                        base={applyPicks(searched, { ...picks, [c.pick]: null })}
                        current={picks[c.pick] ?? null}
                        onSort={(desc) => { setSort({ key: c.key, desc }); setMenu(null); }}
                        onApply={(set) => { setPicks((p) => ({ ...p, [c.pick!]: set })); setMenu(null); }}
                        onClose={() => setMenu(null)}
                      />
                    )}
                  </div>
                </th>
              );
            })}
            <th className="sticky top-[120px] z-10 bg-white shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]" />
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const tag = clock ? whenTag(r, clock.today) : null;
            const quiet = clock ? isQuiet(r.last_active, clock.now) : false;
            const open = () => { window.location.href = `/admin/view/${r.id}`; };
            const owner = pickValue(r, "owner");
            const country = countryOf(r.destination);
            return (
              <tr key={r.id} data-testid="admin-row" onClick={open} className="cursor-pointer hover:bg-[#F7F7F5] align-top">
                <td className="px-3 py-3.5 border-b border-black/5 whitespace-nowrap">
                  {/* Clicking the name shows only this person's journeys, not the journey itself. */}
                  <button type="button" onClick={(e) => { e.stopPropagation(); only("owner", owner); }} title={`Show only ${owner}`} className="-mx-1.5 px-1.5 py-0.5 rounded-full hover:bg-[rgba(26,26,46,0.06)] hover:underline underline-offset-2 text-left">
                    <span aria-hidden="true" className="inline-flex w-6 h-6 rounded-full items-center justify-center text-[11px] font-semibold mr-2 align-middle" style={{ background: "#E9E7F5", color: "#4B4290" }}>{owner.charAt(0).toUpperCase()}</span>
                    {owner}
                  </button>
                </td>
                <td className="px-3 py-3.5 border-b border-black/5">
                  {country
                    ? <button type="button" onClick={(e) => { e.stopPropagation(); only("country", country); }} title={`Show only ${country}`} className="-mx-1.5 px-1.5 py-0.5 rounded-full hover:bg-[rgba(26,26,46,0.06)] hover:underline underline-offset-2 text-left">{country}</button>
                    : <span style={{ color: SOFT }}>—</span>}
                </td>
                <td className="px-3 py-3.5 border-b border-black/5">
                  {/* A plain link too, for keyboard and middle-click; a full page load either way. */}
                  <a href={`/admin/view/${r.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold">{r.title || "Untitled"}</a>
                  {r.archived && <div className="text-[12px] mt-0.5" style={{ color: SOFT }}>Archived</div>}
                </td>
                <td className="px-3 py-3.5 border-b border-black/5 whitespace-nowrap">
                  {range(r)}
                  {tag && <div><span className="inline-block mt-1 text-[11.5px] px-2 py-0.5 rounded-full" style={TONES[tag.tone]}>{tag.text}</span></div>}
                </td>
                {(["planned", "saved"] as const).map((k) => (
                  <td key={k} className="px-3 py-3.5 border-b border-black/5 text-right tabular-nums" style={{ color: r[k] ? undefined : SOFT }}>{r[k]}</td>
                ))}
                <td className="px-3 py-3.5 border-b border-black/5 text-right tabular-nums" style={{ color: r.guests ? undefined : SOFT }}>{r.guests || "—"}</td>
                <td className="px-3 py-3.5 border-b border-black/5 whitespace-nowrap" style={{ color: quiet ? SOFT : undefined }}>{clock ? ago(r.last_active, clock.now) : ""}</td>
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

/**
 * The Excel-style checklist under Owner / Country. Nothing changes until
 * "Show": Cancel by clicking away or pressing Escape. Typing narrows the list
 * and ticks just the names it leaves, as Excel does.
 */
function PickMenu({ col, label, base, current, onSort, onApply, onClose }: {
  col: PickColumn; label: string; base: AdminRow[];
  current: Set<string> | null; onSort: (desc: boolean) => void; onApply: (set: Set<string> | null) => void; onClose: () => void;
}) {
  const options = useMemo(() => pickOptions(base, col), [base, col]);
  const all = useMemo(() => options.map((o) => o.value), [options]);
  const [draft, setDraft] = useState<Set<string>>(() => new Set(current ?? all));
  const [typed, setTyped] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const visible = options.filter((o) => matchesTyped(o.value, typed));
  const allVisibleOn = visible.length > 0 && visible.every((o) => draft.has(o.value));
  const count = base.filter((r) => draft.has(pickValue(r, col))).length;

  useEffect(() => {
    // The heading button sits beside the menu in the same wrapper: a click on it toggles, so it isn't "away".
    const away = (e: MouseEvent) => { const box = ref.current?.parentElement; if (box && !box.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [onClose]);

  const type = (v: string) => { setTyped(v); setDraft(new Set(v.trim() ? options.filter((o) => matchesTyped(o.value, v)).map((o) => o.value) : current ?? all)); };
  const toggle = (v: string) => setDraft((d) => { const n = new Set(d); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  const toggleVisible = () => setDraft((d) => { const n = new Set(d); visible.forEach((o) => (allVisibleOn ? n.delete(o.value) : n.add(o.value))); return n; });
  // Everything ticked is the same as no filter. Nothing ticked can't be shown (Show is disabled, Enter too).
  const apply = () => { if (draft.size) onApply(draft.size === all.length ? null : draft); };
  const word = col === "owner" ? "names" : "countries";

  return (
    <div ref={ref} role="dialog" aria-label={`Filter by ${label}`} data-testid={`pick-${col}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); if (e.key === "Enter") apply(); }}
      className="absolute left-0 top-full mt-1.5 w-[264px] bg-white rounded-2xl p-2 text-left normal-case tracking-normal font-normal text-[13px]"
      style={{ color: "#1A1A2E", boxShadow: "0 12px 32px rgba(26,26,46,0.18), 0 0 0 1px rgba(26,26,46,0.10)" }}>
      <button type="button" onClick={() => onSort(false)} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[rgba(26,26,46,0.05)]">↑ Sort A to Z</button>
      <button type="button" onClick={() => onSort(true)} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[rgba(26,26,46,0.05)]">↓ Sort Z to A</button>
      <div className="h-px my-1.5 mx-0.5" style={{ background: "rgba(26,26,46,0.10)" }} />
      <label className="flex items-center gap-1.5 mx-0.5 mb-1.5 px-2.5 h-[34px] rounded-full" style={{ boxShadow: "inset 0 0 0 1px rgba(26,26,46,0.14)" }}>
        <span aria-hidden="true" style={{ color: SOFT }}>⌕</span>
        <input autoFocus value={typed} onChange={(e) => type(e.target.value)} placeholder={`Search ${word}`} aria-label={`Search ${word}`} className="flex-1 min-w-0 bg-transparent outline-none" />
      </label>
      <div className="max-h-[240px] overflow-auto">
        {visible.length ? (
          <>
            <label className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-[rgba(26,26,46,0.05)]">
              <input type="checkbox" checked={allVisibleOn} onChange={toggleVisible} className="w-[15px] h-[15px] accent-[#1A1A2E]" />
              <span>(Select all{typed.trim() ? " shown" : ""})</span>
            </label>
            {visible.map((o) => (
              <label key={o.value} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-[rgba(26,26,46,0.05)]">
                <input type="checkbox" checked={draft.has(o.value)} onChange={() => toggle(o.value)} className="w-[15px] h-[15px] accent-[#1A1A2E]" />
                <span className="flex-1 truncate">{o.value}</span>
                <span className="tabular-nums text-[12px]" style={{ color: SOFT }}>{o.count}</span>
              </label>
            ))}
          </>
        ) : <p className="px-2 py-2 text-[12.5px]" style={{ color: SOFT }}>Nothing matches.</p>}
      </div>
      <div className="flex justify-between items-center gap-2 mt-1.5 pt-2 px-0.5" style={{ borderTop: "1px solid rgba(26,26,46,0.10)" }}>
        <button type="button" onClick={() => onApply(null)} className="px-3 py-1.5 rounded-full font-semibold" style={{ color: SOFT }}>Clear</button>
        <button type="button" onClick={apply} disabled={draft.size === 0} className="px-3.5 py-1.5 rounded-full font-semibold disabled:opacity-40" style={{ background: "#1A1A2E", color: "#fff" }}>Show {count} {count === 1 ? "journey" : "journeys"}</button>
      </div>
    </div>
  );
}
