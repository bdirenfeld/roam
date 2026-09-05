"use client";

// ── Entry requirements, in Journey settings ───────────────────────────────
// What the party's passports need to enter the country: one line per
// requirement, a tick box where there is something to do, a dot where there
// isn't, and the source and date underneath. The words come from the lookup
// (api/entry/check), never from the traveller; the traveller owns the
// passports list and the ticks. Reads its own row, so the settings page and
// overlay need no new plumbing.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { entryStatus, firstSentence, type EntryData, type TripEntry } from "@/lib/entry/types";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.62)";
const FAINT = "rgba(26,26,46,0.5)";
const RULE = "rgba(26,26,46,0.10)";
const SIENNA = "#B0541F";
const GREEN = "#3E7C5B";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDay(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export default function EntrySection({ tripId, destination, startDate, defaultOpen = false }: { tripId: string; destination: string; startDate: string; defaultOpen?: boolean }) {
  const supabase = createClient();
  const { toast } = useToast();
  const [entry, setEntry] = useState<TripEntry | null | undefined>(undefined);
  const [checking, setChecking] = useState(false);
  const [editingPassports, setEditingPassports] = useState(false);
  const [passportDraft, setPassportDraft] = useState("");
  // Lines opened to show their full text (the block shows one sentence each).
  const [openLines, setOpenLines] = useState<Set<string>>(new Set());
  // One row, closed by default: the Agenda line already carries the urgent
  // thing on day one, so settings doesn't need to shout too.
  const [open, setOpen] = useState(defaultOpen);
  const upcoming = new Date(startDate + "T12:00:00").getTime() > Date.now();

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("trip_entry")
      .select("trip_id, passports, data, changed, checked_at")
      .eq("trip_id", tripId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setEntry((data as TripEntry | null) ?? null);
        // Reading the block is what clears the "changed" flag.
        if (data?.changed) void supabase.from("trip_entry").update({ changed: false }).eq("trip_id", tripId);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const check = useCallback(async (passports?: string[]) => {
    if (checking) return;
    setChecking(true);
    try {
      const res = await fetch("/api/entry/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, passports }),
      });
      const j = (await res.json()) as { passports?: string[]; data?: EntryData; error?: string };
      if (!res.ok || !j.data) throw new Error(j.error || String(res.status));
      setEntry({ trip_id: tripId, passports: j.passports ?? passports ?? ["Canadian"], data: j.data, changed: false, checked_at: j.data.checked_at });
    } catch {
      toast({ message: "The check took too long or failed. Tap it once more — it usually takes under a minute.", duration: 8000 });
    } finally {
      setChecking(false);
    }
  }, [checking, tripId, toast]);

  const toggleDone = async (key: string) => {
    if (!entry?.data) return;
    const lines = entry.data.lines.map((l) => (l.key === key ? { ...l, done: !l.done } : l));
    const data: EntryData = { ...entry.data, lines, status: lines.some((l) => l.action && !l.done) ? "action" : "clear" };
    setEntry({ ...entry, data });
    const { error } = await supabase.from("trip_entry").update({ data }).eq("trip_id", tripId);
    if (error) toast({ message: "Couldn't save that tick. Try again." });
  };

  const savePassports = async () => {
    const list = passportDraft.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) return;
    setEditingPassports(false);
    if (entry) setEntry({ ...entry, passports: list });
    // A different set of passports is a different answer: check again.
    await check(list);
  };

  const status = entryStatus(entry?.data);
  const passports = entry?.passports ?? ["Canadian"];

  const rowValue =
    entry === undefined ? "" : !entry?.data ? "Not checked yet" : status === "action" ? "Action needed" : "Nothing to do";

  return (
    <div id="entry" style={{ scrollMarginTop: 24 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center px-5 py-[14px] border-b border-black/5 text-left"
      >
        <span className="text-[10px] uppercase tracking-widest text-gray-400 w-20 flex-shrink-0">
          Entry
        </span>
        <span className="flex-1 text-[14px]" style={{ color: status === "action" ? SIENNA : INK }}>{rowValue}</span>
        <span aria-hidden="true" className="text-[14px] flex-shrink-0" style={{ color: FAINT, display: "inline-block", transform: open ? "rotate(90deg)" : "none" }}>›</span>
      </button>
      {open && (
      <div className="border-b border-black/5">
        <div className="px-5 pt-3 pb-3.5">
          {/* Who, and the state in one word */}
          <div className="flex items-center justify-between gap-3 mb-1">
            {editingPassports ? (
              <form
                className="flex-1 flex items-center gap-2"
                onSubmit={(e) => { e.preventDefault(); void savePassports(); }}
              >
                <input
                  autoFocus
                  value={passportDraft}
                  onChange={(e) => setPassportDraft(e.target.value)}
                  placeholder="Canadian, Indian"
                  aria-label="Passports held by the party"
                  className="flex-1 rounded-md px-2 py-1 text-[13.5px] outline-none"
                  style={{ border: `1px solid rgba(26,26,46,0.22)`, color: INK }}
                />
                <button type="submit" className="text-[13px] underline underline-offset-2" style={{ color: INK }}>Check</button>
                <button type="button" className="text-[13px]" style={{ color: FAINT }} onClick={() => setEditingPassports(false)}>Cancel</button>
              </form>
            ) : (
              <button
                type="button"
                className="text-[14.5px] text-left flex items-center gap-1.5"
                style={{ color: INK }}
                onClick={() => { setPassportDraft(passports.join(", ")); setEditingPassports(true); }}
                title="Change which passports the party holds"
              >
                <span style={{ color: CAPTION }}>Passports</span>
                <span>{passports.join(" · ")}</span>
                <span aria-hidden="true" style={{ color: FAINT }}>›</span>
              </button>
            )}

          </div>

          {/* The lines */}
          {entry === undefined ? (
            <p className="text-[13px] py-2" style={{ color: FAINT }}>Loading…</p>
          ) : !entry?.data ? (
            <div className="py-2">
              <p className="text-[13.5px] leading-snug mb-2.5" style={{ color: CAPTION }}>
                What {passports.join(" and ")} passports need to enter {destination.split(",").pop()?.trim() || "the country"}: visa, forms, onward ticket, passport validity. Read from the Government of Canada travel advice page, with the link.
              </p>
              {upcoming ? (
                <button
                  type="button"
                  onClick={() => void check()}
                  disabled={checking}
                  className="rounded-full px-4 py-2 text-[13.5px]"
                  style={{ background: INK, color: "#fff", opacity: checking ? 0.7 : 1 }}
                >
                  {checking ? "Checking… about a minute" : "Check entry requirements"}
                </button>
              ) : (
                <p className="text-[13px]" style={{ color: FAINT }}>This journey has passed, so there is nothing to check.</p>
              )}
            </div>
          ) : status === "clear" && entry.data.lines.every((l) => !l.action) ? (
            // Nothing to do: one quiet sentence, no ticks.
            <p className="text-[13.5px] leading-snug py-1.5" style={{ color: INK }}>
              {entry.data.advisory && entry.data.advisory.level >= 2 && (
                <span style={{ color: SIENNA }}>{entry.data.advisory.label}{entry.data.advisory.reason ? `: ${firstSentence(entry.data.advisory.reason)}` : "."} </span>
              )}
              {entry.data.lines.map((l) => firstSentence(l.text)).join(" ")}
            </p>
          ) : (
            <div>
              {entry.data.advisory && entry.data.advisory.level >= 2 && (
                <div className="grid gap-2.5 py-2" style={{ gridTemplateColumns: "22px 1fr", borderTop: `1px solid ${RULE}` }}>
                  <span className="flex justify-center mt-[9px]"><span className="w-1.5 h-1.5 rounded-full" style={{ background: SIENNA }} /></span>
                  <div>
                    <div className="text-[10.5px] uppercase mb-[2px]" style={{ letterSpacing: "0.08em", color: CAPTION }}>Advisory</div>
                    <div className="text-[13.5px] leading-snug" style={{ color: INK }}>
                      <span style={{ color: SIENNA }}>{entry.data.advisory.label}</span>
                      {entry.data.advisory.reason ? `: ${firstSentence(entry.data.advisory.reason)}` : ""}
                    </div>
                  </div>
                </div>
              )}
              {entry.data.lines.map((l) => (
                <div key={l.key} className="grid gap-2.5 py-2" style={{ gridTemplateColumns: "22px 1fr", borderTop: `1px solid ${RULE}` }}>
                  {l.action ? (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={l.done}
                      aria-label={`${l.done ? "Undo" : "Done"}: ${l.text}`}
                      onClick={() => void toggleDone(l.key)}
                      className="w-5 h-5 rounded-md flex items-center justify-center text-[12px] mt-[3px]"
                      style={l.done ? { background: INK, color: "#fff" } : { border: "1.5px solid rgba(26,26,46,0.35)" }}
                    >
                      {l.done ? "✓" : ""}
                    </button>
                  ) : (
                    <span className="flex justify-center mt-[9px]"><span className="w-1.5 h-1.5 rounded-full" style={{ background: GREEN }} /></span>
                  )}
                  <div>
                    <div className="text-[10.5px] uppercase mb-[2px]" style={{ letterSpacing: "0.08em", color: CAPTION }}>
                      {l.label}{l.deadline ? (l.deadline === startDate ? ` · before you fly, ${fmtDay(l.deadline)}` : ` · by ${fmtDay(l.deadline)}`) : ""}
                    </div>
                    {(() => {
                      const short = firstSentence(l.text);
                      const more = short.length < l.text.length || Boolean(l.why);
                      const open = openLines.has(l.key);
                      return (
                        <div className="text-[13.5px] leading-snug" style={{ color: INK, textDecoration: l.done ? "line-through" : "none", opacity: l.done ? 0.6 : 1 }}>
                          {open ? l.text : short}
                          {l.key === "consent" && (
                            // The Government of Canada's fill-in PDF itself — not the page about it,
                            // which hides the form (Brennan, Sep 2026). Never a home-made letter.
                            <a
                              href="https://travel.gc.ca/docs/child/consent-letter-2123.pdf"
                              target="_blank"
                              rel="noopener"
                              className="ml-1.5 underline underline-offset-2 whitespace-nowrap"
                              style={{ color: INK }}
                            >
                              Get the form (PDF)
                            </a>
                          )}
                          {open && l.why ? <span style={{ color: CAPTION }}> {l.why}</span> : null}
                          {more && (
                            <button
                              type="button"
                              className="ml-1.5 text-[12px] underline underline-offset-2"
                              style={{ color: FAINT }}
                              onClick={() => setOpenLines((prev) => { const n = new Set(prev); if (n.has(l.key)) n.delete(l.key); else n.add(l.key); return n; })}
                            >
                              {open ? "less" : "more"}
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Source and date */}
          {entry?.data && (
            <p className="text-[11.5px] leading-snug pt-2.5 mt-1" style={{ color: CAPTION, borderTop: `1px solid ${RULE}` }}>
              From the {entry.data.source_name}, checked {fmtDate(entry.data.checked_at)}.
              {upcoming && entry.data.next_check ? ` Rechecks ${fmtDay(entry.data.next_check)}, thirty days before you fly.` : ""}{" "}
              {entry.data.source_url && (
                <a href={entry.data.source_url} target="_blank" rel="noopener" className="underline underline-offset-2" style={{ color: INK }}>
                  Read the page
                </a>
              )}
              {upcoming && entry.data.source_url ? " · " : ""}
              {upcoming && (
                <button type="button" onClick={() => void check()} disabled={checking} className="underline underline-offset-2" style={{ color: INK }}>
                  {checking ? "Checking… about a minute" : "Check again now"}
                </button>
              )}
            </p>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
