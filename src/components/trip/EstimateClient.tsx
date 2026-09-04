"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretLeft, CaretDown, Check, X } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import type { ExcursionItem } from "@/lib/budget/load";
import { queuedUpdate } from "@/lib/offline/queuedWrite";
import { SYMBOL } from "@/lib/budget/currency";
import { useToast } from "@/components/ui/Toast";
import {
  compute,
  suggest,
  type Assumptions,
  type EstimateLine,
} from "@/lib/budget/model";

/** Assumption key → line key, for the rows a suggestion can fill. */
const FILLS: [keyof Assumptions, string][] = [
  ["flightPerPerson", "flights"],
  ["nightlyRate", "accommodation"],
  ["groceriesPerDay", "groceries"],
  ["perMealOut", "restaurants"],
  ["carDayRate", "car"],
  ["dogNightlyRate", "dog"],
  ["extrasPerDay", "extras"],
  ["touristTaxPerNight", "touristTax"],
];

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.62)";
const SOFT = "rgba(26,26,46,0.5)"; // 3.3:1 — the faint tier; captions are 0.62 (4.8:1)
const RULE = "rgba(26,26,46,0.10)";
const SIENNA = "#B0541F";

const PAD = 14;

const cad = (n: number) =>
  "$" + Math.round(n).toLocaleString("en-CA", { maximumFractionDigits: 0 });

const box = (dim: string) => ({
  background: "#FFFFFF",
  border: `1px solid ${RULE}`,
  color: dim,
});

/**
 * These three live at module scope on purpose. Defined inside the component
 * body they were a NEW component type on every render, so React unmounted and
 * remounted the whole subtree for each keystroke — which destroys the input
 * element and takes the caret with it. Typing one digit into a price threw you
 * out of the cell. Stable identity is what keeps focus.
 */
function Shell({
  leading,
  label,
  labelColor,
  middle,
  amount,
  amountColor,
  onClick,
  tint,
  pv = 10,
}: {
  leading?: React.ReactNode;
  label: React.ReactNode;
  labelColor: string;
  middle?: React.ReactNode;
  amount: React.ReactNode;
  amountColor: string;
  onClick?: () => void;
  tint?: string;
  pv?: number;
}) {
  const inner = (
    <div className="flex items-center gap-1 w-full">
      <div className="w-4 shrink-0 flex items-center">{leading}</div>
      <div
        className="flex-1 min-w-0 text-[13.5px] truncate text-left"
        style={{ color: labelColor }}
      >
        {label}
      </div>
      {middle}
      <div
        className="w-[62px] shrink-0 text-right text-[13.5px]"
        style={{ color: amountColor }}
      >
        {amount}
      </div>
    </div>
  );
  const style = {
    borderTop: `1px solid ${RULE}`,
    padding: `${pv}px ${PAD}px`,
    background: tint,
  };
  return onClick ? (
    <button onClick={onClick} className="w-full" style={style}>
      {inner}
    </button>
  ) : (
    <div style={style}>{inner}</div>
  );
}

function Row({
  line,
  setNum,
  toggle,
}: {
  line: EstimateLine;
  setNum: (key: keyof Assumptions, raw: string) => void;
  toggle: (key: keyof Assumptions) => void;
}) {
  const off = !line.enabled;
  // 0 means "not priced yet", not "free". An unpriced row shows a dash rather
  // than $0, so an empty budget reads as empty instead of as costless.
  const unset = line.unit === 0;
  const dim = off ? SOFT : INK;
  return (
    <Shell
      labelColor={dim}
      amountColor={off || unset ? SOFT : dim}
      label={
        line.lump && line.hint ? (
          <>
            <span className="block truncate">{line.label}</span>
            <span className="block truncate text-[10.5px] leading-tight" style={{ color: SIENNA }}>
              {line.hint}
            </span>
          </>
        ) : (
          line.label
        )
      }
      amount={off || unset ? "—" : cad(line.amount)}
      leading={
        line.enabledKey && (
          <button
            onClick={() => toggle(line.enabledKey as keyof Assumptions)}
            aria-label={`${line.enabled ? "Exclude" : "Include"} ${line.label}`}
            className="w-[15px] h-[15px] rounded flex items-center justify-center"
            style={{
              background: line.enabled ? INK : "#FFFFFF",
              border: `1px solid ${line.enabled ? INK : "rgba(26,26,46,0.22)"}`,
              color: "#fff",
              fontSize: 9.5,
              lineHeight: 1,
            }}
          >
            {line.enabled ? "✓" : ""}
          </button>
        )
      }
      middle={
        <>
          <div className="w-[58px] shrink-0">
            <input
              type="number"
              inputMode="decimal"
              value={unset ? "" : String(line.unit)}
              onChange={(e) => setNum(line.unitKey, e.target.value)}
              aria-label={`${line.label} unit cost`}
              className="w-full rounded-md px-1.5 py-1.5 text-[12.5px] text-right"
              style={box(dim)}
            />
          </div>
          {line.lump ? (
            // Spacer only: keeps the amount column aligned with the × rows.
            // The hint sits under the row name, where it has room.
            <div className="shrink-0 w-[44px] sm:w-[92px]" aria-hidden />
          ) : (
            <>
              <span
                className="text-[11px] shrink-0"
                style={{ color: off ? SOFT : CAPTION }}
              >
                ×
              </span>
              <div className="w-[30px] shrink-0">
                <input
                  type="number"
                  inputMode="numeric"
                  value={String(line.count)}
                  onChange={(e) => setNum(line.countKey, e.target.value)}
                  aria-label={`${line.label} ${line.countLabel}`}
                  className="w-full rounded px-0.5 py-1 text-[12px] text-center"
                  style={box(dim)}
                />
              </div>
              {/* First thing to go on a narrow screen — "Flights × 7" reads
                  fine, a truncated label does not. */}
              <span
                className="hidden sm:inline text-[12px] shrink-0 w-[46px]"
                style={{ color: off ? SOFT : CAPTION }}
              >
                {line.countLabel}
              </span>
            </>
          )}
        </>
      }
    />
  );
}

function GroupBar({
  label,
  lines,
  isOpen,
  onToggle,
}: {
  label: string;
  lines: EstimateLine[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const subtotal = lines.reduce((s, l) => s + (l.enabled ? l.amount : 0), 0);
  return (
    <Shell
      pv={11}
      tint="rgba(26,26,46,0.025)"
      onClick={onToggle}
      labelColor={CAPTION}
      amountColor={CAPTION}
      amount={cad(subtotal)}
      leading={
        <CaretDown
          size={12}
          weight="bold"
          color={SOFT}
          style={{
            transform: isOpen ? "none" : "rotate(-90deg)",
            transition: "transform 140ms",
          }}
        />
      }
      label={
        <span className="text-[11px] uppercase tracking-wider">
          {label}
          {!isOpen && (
            <span className="normal-case tracking-normal" style={{ color: SOFT }}>
              {" "}
              · {lines.filter((l) => l.enabled).length} items
            </span>
          )}
        </span>
      }
    />
  );
}

interface Props {
  tripId: string;
  tripTitle: string;
  initialAssumptions: Assumptions;
  initialBasis: Record<string, string>;
  uncostedExcursions: number;
  rolledExcursionCount: number;
  /** The rate card costs convert at; editable under "How this was worked out". */
  fxToCad: number;
  fxSource: "typed" | "live" | "reference" | "fallback";
  fxReferenceMonth?: string;
  cardCurrency: string;
  /** The priced activity cards, for the Excursions breakdown table. */
  excursionItems: ExcursionItem[];
  excursionFree: number;
  dateRange: string;
  distanceKm: number;
  peak: boolean;
  /** "page" is the standalone route; "overlay" hands the frame to the host. */
  variant?: "page" | "overlay";
  /** Close, when hosted in an overlay. Defaults to router.back(). */
  onDismiss?: () => void;
}

export default function EstimateClient({
  tripId,
  tripTitle,
  initialAssumptions,
  initialBasis,
  uncostedExcursions,
  rolledExcursionCount,
  fxToCad,
  fxSource,
  fxReferenceMonth,
  cardCurrency,
  excursionItems,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  excursionFree: _excursionFree,
  dateRange,
  distanceKm,
  peak,
  variant = "page",
  onDismiss,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [a, setA] = useState<Assumptions>(initialAssumptions);
  const [basis, setBasis] = useState<Record<string, string>>(initialBasis);
  const [prev, setPrev] = useState<{
    a: Assumptions;
    basis: Record<string, string>;
  } | null>(null);
  const [why, setWhy] = useState(false);
  const [open, setOpen] = useState({ standard: true, additional: true });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // The exchange rate, and whether the Excursions figure was typed by hand.
  // Saved untouched, the line is saved as 0 — which the loader reads as
  // "nothing typed", so the cards' sum keeps flowing through on every open
  // (and follows a new rate). Typed, the figure is kept and wins.
  const [fx, setFx] = useState<number>(fxToCad);
  // A rate is saved only if you typed it; otherwise the market rate of the
  // day applies on every open.
  const [fxTyped, setFxTyped] = useState(fxSource === "typed");
  const sym = (c: string) => SYMBOL[c || cardCurrency] ?? "";
  // The breakdown rows, editable: a cost typed here writes to the card and
  // the line follows (unless you typed the line yourself).
  const [items, setItems] = useState<ExcursionItem[]>(excursionItems);
  const rowTotal = useCallback((x: ExcursionItem, rate: number) => {
    if (x.amount == null) return 0;
    const base = x.per === "person" ? x.amount * x.people : x.amount;
    return x.currency === "CAD" ? base : base * rate;
  }, []);
  const itemsTotal = items.reduce((sum, x) => sum + rowTotal(x, fx), 0);
  const setItemPeople = (cardId: string, raw: string) => {
    const people = raw.trim() === "" ? 0 : Math.max(0, Math.floor(Number(raw)));
    if (Number.isNaN(people)) return;
    setItems((prev) => prev.map((x) => (x.cardId === cardId ? { ...x, people } : x)));
    setSaved(false);
  };
  // Who pays on this card. Written to details.cost_people; the loader reads
  // it back as the row's headcount and rolls the line at that count.
  const saveItemPeople = async (cardId: string, raw: string) => {
    const people = raw.trim() === "" ? 0 : Math.max(0, Math.floor(Number(raw)));
    if (Number.isNaN(people)) return;
    const found = items.find((i) => i.cardId === cardId);
    if (!found) return;
    const x: ExcursionItem = { ...found, people };
    const details: Record<string, unknown> = { ...x.details, cost_people: people };
    const { error } = await queuedUpdate("cards", { id: cardId }, { details });
    if (error) { toast({ message: "Couldn't save that. Try again." }); return; }
    setItems((prev) => prev.map((i) => (i.cardId === cardId ? { ...i, people, details } : i)));
    if (!excursionsTyped) {
      const next = Math.round(items.reduce((sum, i) => sum + rowTotal(i.cardId === cardId ? x : i, fx), 0));
      setA((prev) => ({ ...prev, excursionsTotal: next }));
    }
  };
  const setItemAmount = (cardId: string, raw: string) => {
    const amount = raw.trim() === "" ? null : Number(raw);
    if (amount !== null && Number.isNaN(amount)) return;
    setItems((prev) => prev.map((x) => (x.cardId === cardId ? { ...x, amount } : x)));
    setSaved(false);
  };
  // Takes the value from the field itself, not from state: a blur that lands
  // in the same tick as the last keystroke would otherwise read the old row.
  const saveItemAmount = async (cardId: string, raw: string) => {
    const typed = raw.trim() === "" ? null : Number(raw);
    if (typed !== null && Number.isNaN(typed)) return;
    const found = items.find((i) => i.cardId === cardId);
    if (!found) return;
    const x: ExcursionItem = { ...found, amount: typed };
    const details: Record<string, unknown> = { ...x.details };
    const budget = (details.budget ?? null) as Record<string, unknown> | null;
    if (x.amount == null) {
      delete details.cost_per_person;
      delete details.budget;
    } else {
      details.cost_per_person = x.amount;
      if (budget) details.budget = { ...budget, amount: x.amount };
    }
    const { error } = await queuedUpdate("cards", { id: cardId }, { details });
    if (error) { toast({ message: "Couldn't save that cost. Try again." }); return; }
    setItems((prev) => prev.map((i) => (i.cardId === cardId ? { ...i, details } : i)));
    // The line follows the cards unless a figure was typed on it.
    if (!excursionsTyped) {
      const next = Math.round(items.reduce((sum, i) => sum + rowTotal(i.cardId === cardId ? x : i, fx), 0));
      setA((prev) => ({ ...prev, excursionsTotal: next }));
    }
  };
  const [excursionsTyped, setExcursionsTyped] = useState(false);

  const est = useMemo(
    () => compute(a, { uncostedExcursions, rolledExcursionCount }),
    [a, uncostedExcursions, rolledExcursionCount],
  );

  const setNum = useCallback((key: keyof Assumptions, raw: string) => {
    const v = raw === "" ? 0 : Number(raw);
    if (Number.isNaN(v)) return;
    if (key === "excursionsTotal") setExcursionsTyped(true);
    setA((p) => ({ ...p, [key]: v }));
    setPrev(null); // editing by hand ends the undo window
    setSaved(false);
  }, []);

  const emptyKeys = FILLS.filter(([k]) => a[k] === 0);
  const blankRows = items.filter((x) => x.amount == null).length;
  const [finding, setFinding] = useState(false);

  // The blanks in the excursions table get looked up as part of the same
  // tap — the venue's own price where it can be found, a guess where not.
  // Answers are written to the cards by the route; here the rows follow.
  const findPrices = async () => {
    if (blankRows === 0 || finding) return;
    setFinding(true);
    try {
      const res = await fetch("/api/estimate/find-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const { items: found } = (await res.json()) as { items: { cardId: string; amount: number | null; kind: "found" | "guess"; url: string | null; note: string | null }[] };
      const byId = new Map(found.filter((f) => f.amount != null).map((f) => [f.cardId, f]));
      if (byId.size === 0) { toast({ message: "Couldn't find a price for those." }); return; }
      let next: ExcursionItem[] = [];
      setItems((prev) => {
        next = prev.map((i) => {
          const f = byId.get(i.cardId);
          if (!f) return i;
          const details = { ...i.details, cost_per_person: f.amount, cost_source: { kind: f.kind, url: f.url, note: f.note } };
          return { ...i, amount: f.amount, per: "person" as const, details, found: { kind: f.kind, url: f.url, note: f.note } };
        });
        return next;
      });
      // The line follows the rows unless a figure was typed on it.
      if (!excursionsTyped) {
        const rows = items.map((i) => { const f = byId.get(i.cardId); return f ? { ...i, amount: f.amount, per: "person" as const } : i; });
        setA((prev) => ({ ...prev, excursionsTotal: Math.round(rows.reduce((sum, i) => sum + rowTotal(i, fx), 0)) }));
      }
      const foundN = found.filter((f) => f.amount != null && f.kind === "found").length;
      const guessN = byId.size - foundN;
      toast({ message: `${byId.size} ${byId.size === 1 ? "price" : "prices"} added${foundN ? `, ${foundN} found online` : ""}${guessN ? `, ${guessN} ${guessN === 1 ? "guess" : "guesses"}` : ""}.` });
      setWhy(true);
      setSaved(false);
    } catch {
      toast({ message: "Couldn't look prices up just now. Try again." });
    } finally {
      setFinding(false);
    }
  };

  const runSuggest = () => {
    void findPrices();
    const s = suggest(a, { distanceKm, peak });
    const next = { ...a };
    const added: Record<string, string> = {};
    for (const [key, lineKey] of emptyKeys) {
      const v = s.values[key];
      if (typeof v === "number") {
        (next[key] as number) = v;
        added[lineKey] = s.basis[lineKey];
      }
    }
    setPrev({ a, basis });
    setA(next);
    setBasis({ ...basis, ...added });
    setWhy(true);
    setSaved(false);
  };

  // Clear every price at once, counts untouched. Without this, blanking the
  // sheet on a phone meant tapping into each field and backspacing — Brennan,
  // Sep 2026. Zero is how the model spells "blank" (the field renders empty
  // at 0), and it goes through the same undo window as a suggestion.
  const filledKeys = FILLS.filter(([k]) => a[k] !== 0);
  const runClear = () => {
    const next = { ...a };
    for (const [key] of FILLS) (next[key] as number) = 0;
    next.excursionsTotal = 0;
    next.pointsCredit = 0;
    setPrev({ a, basis });
    setA(next);
    setBasis({});
    setSaved(false);
  };

  const undo = () => {
    if (!prev) return;
    setA(prev.a);
    setBasis(prev.basis);
    setPrev(null);
    setSaved(false);
  };

  const toggle = useCallback((key: keyof Assumptions) => {
    setA((p) => ({ ...p, [key]: !p[key] }));
    setSaved(false);
  }, []);

  const save = async () => {
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase.from("trip_budgets").upsert(
        {
          trip_id: tripId,
          user_id: user.id,
          assumptions: { ...a, excursionsTotal: excursionsTyped ? a.excursionsTotal : 0, fxTyped } as unknown as Record<string, unknown>,
          // NOT NULL: always the number in use; fxTyped above says whether it
          // is yours or the day's market rate.
          fx_to_cad: fx,
          // Kept so the working survives the session — the question comes in
          // March, not thirty seconds after the button.
          basis,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "trip_id" },
      );
      // "Saved" used to light before the server answered (UX audit, Sep
      // 2026, finding 1). It lights on success only; a refusal says so.
      if (error) {
        toast({ message: "Couldn't save the estimate. Try again." });
      } else {
        setSaved(true);
        router.refresh();
      }
    }
    setSaving(false);
  };

  const standard = est.lines.filter((l) => l.group === "standard");
  const additional = est.lines.filter((l) => l.group === "additional");

  return (
    // Overlay.tsx's contract: the hosted screen is a flex column with a
    // `flex-1 min-h-0 overflow-y-auto` body. Without it the sheet has no
    // scrolling region at all and the list is simply stuck.
    //
    // The root is a flex ITEM of the overlay card (`flex-1 min-h-0`), not
    // `h-full`. On desktop the card is `h-auto max-h-[86vh]`, and a percentage
    // height against an auto-height parent resolves to auto — so `h-full`
    // grew to the content, the card clipped it at 86vh, and the body below
    // never had a bound to scroll inside. Brennan hit exactly that: the
    // desktop Estimate stopped at Contingency with no way down.
    <div
      className={
        variant === "overlay"
          ? "flex-1 min-h-0 flex flex-col bg-white md:bg-parchment"
          : "min-h-screen bg-white md:bg-parchment pb-24"
      }
      style={
        variant === "overlay"
          ? undefined
          : { paddingTop: "max(1.25rem, env(safe-area-inset-top))" }
      }
    >
      <div
        className={
          variant === "overlay"
            ? "flex-1 min-h-0 overflow-y-auto mx-auto w-full max-w-[560px] px-3 pt-2 pb-24"
            : "mx-auto w-full max-w-[560px] px-3 pt-2"
        }
      >
        <button
          onClick={() => (onDismiss ? onDismiss() : router.back())}
          className="flex items-center gap-1 mb-5 px-1"
          style={{ color: CAPTION, fontSize: 13 }}
        >
          {variant === "overlay" ? (
            <X size={14} weight="light" />
          ) : (
            <CaretLeft size={15} weight="light" />
          )}
          {tripTitle}
        </button>

        <div
          className="bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: `0 0 0 1px ${RULE}` }}
        >
          {/* No "Estimate" heading: you tapped Estimate to get here, and a
              figure this size says what it is. The party and dates ride above
              the number as its context rather than as a block of their own. */}
          <div style={{ padding: `16px ${PAD}px 15px` }}>
            <div
              className="text-[10.5px] uppercase tracking-wider mb-2"
              style={{ color: SOFT }}
            >
              {a.people} {a.people === 1 ? "traveller" : "travellers"} · {a.nights}{" "}
              {a.nights === 1 ? "night" : "nights"}
              {dateRange ? ` · ${dateRange}` : ""}
            </div>
            <div
              className="font-display italic text-[36px] leading-none mb-1.5"
              style={{ color: INK }}
            >
              {cad(est.total)}
            </div>
            <div className="text-[12.5px]" style={{ color: CAPTION }}>
              {a.people > 0 && <>{cad(est.perPerson)} per person &nbsp;·&nbsp; </>}{cad(est.perDay)} per day
            </div>
          </div>

          <GroupBar
            label="Standard"
            lines={standard}
            isOpen={open.standard}
            onToggle={() => setOpen((p) => ({ ...p, standard: !p.standard }))}
          />
          {open.standard &&
            standard.map((l) => (
              <Row key={l.key} line={l} setNum={setNum} toggle={toggle} />
            ))}

          <GroupBar
            label="Additional"
            lines={additional}
            isOpen={open.additional}
            onToggle={() => setOpen((p) => ({ ...p, additional: !p.additional }))}
          />
          {open.additional &&
            additional.map((l) => (
              <Row key={l.key} line={l} setNum={setNum} toggle={toggle} />
            ))}

          <Shell
            labelColor={CAPTION}
            amountColor={INK}
            label="Contingency"
            amount={cad(est.contingency)}
            middle={
              <>
                <div className="w-[58px] shrink-0">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={String(a.contingencyPct)}
                    onChange={(e) => setNum("contingencyPct", e.target.value)}
                    aria-label="Contingency percent"
                    className="w-full rounded-md px-1.5 py-1.5 text-[12.5px] text-right"
                    style={box(INK)}
                  />
                </div>
                <span
                  className="text-[11px] shrink-0 w-[44px] sm:w-[92px] pl-1"
                  style={{ color: SOFT }}
                >
                  %
                </span>
              </>
            }
          />

          <Shell
            labelColor={est.pointsCredit > 0 ? SIENNA : CAPTION}
            amountColor={est.pointsCredit > 0 ? SIENNA : INK}
            label="Paid with points"
            amount={`${est.pointsCredit > 0 ? "−" : ""}${cad(est.pointsCredit)}`}
            middle={
              <>
                <div className="w-[58px] shrink-0">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={a.pointsCredit === 0 ? "" : String(a.pointsCredit)}
                    onChange={(e) => setNum("pointsCredit", e.target.value)}
                    aria-label="Amount paid with points"
                    className="w-full rounded-md px-1.5 py-1.5 text-[12.5px] text-right"
                    style={box(est.pointsCredit > 0 ? SIENNA : INK)}
                  />
                </div>
                <span className="shrink-0 w-[44px] sm:w-[92px]" />
              </>
            }
          />

          {/* Deliberately NOT a Shell. The amount column is a fixed 62px, which
              the Playfair numerals overran — that was the clipping on the
              right. Here the figure sizes to its own content. */}
          <div
            className="flex items-baseline justify-between gap-3"
            style={{ borderTop: `1px solid ${RULE}`, padding: `14px ${PAD}px` }}
          >
            <span className="text-[14px] shrink-0" style={{ color: INK }}>
              Total
            </span>
            <span
              className="font-display italic text-[21px] text-right"
              style={{ color: INK }}
            >
              {cad(est.total)}
            </span>
          </div>
        </div>

        {Object.keys(basis).length > 0 && (
          <div
            className="bg-white rounded-2xl overflow-hidden mt-3"
            style={{ boxShadow: `0 0 0 1px ${RULE}` }}
          >
            <button
              onClick={() => setWhy((w) => !w)}
              className="w-full flex items-center justify-between"
              style={{ padding: `12px ${PAD}px` }}
            >
              <span
                className="text-[11px] uppercase tracking-wider"
                style={{ color: SOFT }}
              >
                How this was worked out
              </span>
              <CaretDown
                size={12}
                weight="bold"
                color={SOFT}
                style={{ transform: why ? "none" : "rotate(-90deg)" }}
              />
            </button>
            {why && (
              <div style={{ padding: `0 ${PAD}px 12px` }}>
                {est.lines
                  .filter((l) => basis[l.key])
                  .map((l) => l.key === "excursions" && items.length > 0 ? (
                    // Excursions: a table, not a paragraph (Brennan, Sep 2026).
                    // Name · cost each · people · total, adding up to the line.
                    <div key={l.key} className="py-2" style={{ borderTop: `1px solid rgba(26,26,46,0.06)` }}>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-[11.5px]" style={{ color: INK }}>{l.label}</span>
                        <span className="text-[11.5px]" style={{ color: INK }}>{cad(l.unit)}</span>
                      </div>
                      <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", color: CAPTION }}>
                        <thead>
                          <tr style={{ color: SOFT }}>
                            <th className="text-left font-medium pb-1" style={{ fontWeight: 500 }}>Excursion</th>
                            <th className="text-right font-medium pb-1 pl-2 whitespace-nowrap" style={{ fontWeight: 500 }}>Each</th>
                            <th className="text-right font-medium pb-1 pl-2" style={{ fontWeight: 500 }}>People</th>
                            <th className="text-right font-medium pb-1 pl-2" style={{ fontWeight: 500 }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((x) => (
                            <tr key={x.cardId}>
                              <td className="py-[3px] pr-2" style={{ color: INK }}>
                                {x.title}
                                {x.amount != null && (
                                  <span
                                    className="ml-1.5 align-middle text-[9px] uppercase"
                                    style={{ letterSpacing: "0.08em", color: x.confirmed ? "#3E7C5B" : SOFT }}
                                    title={x.confirmed ? "Marked Confirmed on the card" : x.fromTicket ? "Read from the ticket or receipt attached to the card" : x.found ? (x.found.note ?? (x.found.kind === "found" ? "Found online" : "Estimated by the app")) : "An estimate until the card is marked Confirmed"}
                                  >
                                    {x.confirmed ? "booked" : x.fromTicket ? "ticket" : x.found?.kind === "found" && x.found.url ? (
                                      <a href={x.found.url} target="_blank" rel="noopener" className="underline underline-offset-2">found</a>
                                    ) : x.found ? "guess" : "est."}
                                  </span>
                                )}
                              </td>
                              <td className="py-[3px] pl-2 text-right whitespace-nowrap tabular-nums">
                                <span className="inline-flex items-center gap-0.5 justify-end">
                                  <span>{sym(x.currency)}</span>
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    value={x.amount == null ? "" : String(x.amount)}
                                    placeholder="—"
                                    onChange={(e) => setItemAmount(x.cardId, e.target.value)}
                                    onBlur={(e) => void saveItemAmount(x.cardId, e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                    aria-label={`${x.title} cost each`}
                                    className="w-[48px] rounded-md px-1 py-0.5 text-[11px] text-right"
                                    style={box(x.amount == null ? SOFT : INK)}
                                  />
                                </span>
                              </td>
                              <td className="py-[3px] pl-2 text-right tabular-nums">
                                {x.per === "person" ? (
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min="0"
                                    step="1"
                                    value={String(x.people)}
                                    onChange={(e) => setItemPeople(x.cardId, e.target.value)}
                                    onBlur={(e) => void saveItemPeople(x.cardId, e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                    aria-label={`${x.title} people`}
                                    className="w-[34px] rounded-md px-1 py-0.5 text-[11px] text-right"
                                    style={box(INK)}
                                  />
                                ) : (
                                  x.people
                                )}
                              </td>
                              <td className="py-[3px] pl-2 text-right tabular-nums" style={{ color: x.amount == null ? SOFT : INK }}>
                                {x.amount == null ? "—" : cad(rowTotal(x, fx))}
                              </td>
                            </tr>
                          ))}
                          <tr style={{ borderTop: `1px solid rgba(26,26,46,0.10)` }}>
                            <td className="pt-1.5" colSpan={3} style={{ color: INK }}>
                              Total
                              {items.filter((x) => x.amount === 0).length ? ` · ${items.filter((x) => x.amount === 0).length} free` : ""}
                              {items.filter((x) => x.amount == null).length ? ` · ${items.filter((x) => x.amount == null).length} with no cost yet` : ""}
                            </td>
                            <td className="pt-1.5 pl-2 text-right tabular-nums" style={{ color: INK }}>
                              {cad(itemsTotal)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <p className="mt-1.5 text-[11px]" style={{ color: CAPTION, lineHeight: 1.45 }}>
                        {items.some((x) => x.currency !== "CAD") ? `Converted at ${fx} dollars per ${cardCurrency === "EUR" ? "euro" : cardCurrency}. ` : ""}
                        Cost and people are per row and save to the card; the line follows unless you typed a figure on it. Blank cost means no cost yet; 0 means free. &ldquo;ticket&rdquo; was read from a document attached to the card, &ldquo;found&rdquo; from the venue&rsquo;s page (tap it), &ldquo;guess&rdquo; is the app&rsquo;s estimate; type over any of them to keep your own. &ldquo;est.&rdquo; clears when you mark the card Confirmed.
                      </p>
                    </div>
                  ) : (
                    <div
                      key={l.key}
                      className="flex gap-2 py-2"
                      style={{ borderTop: `1px solid rgba(26,26,46,0.06)` }}
                    >
                      <span
                        className="w-[76px] shrink-0 text-[11.5px]"
                        style={{ color: INK }}
                      >
                        {l.label}
                      </span>
                      <span
                        className="w-[46px] shrink-0 text-right text-[11.5px]"
                        style={{ color: INK }}
                      >
                        {cad(l.unit)}
                      </span>
                      <span
                        className="flex-1 text-[11px]"
                        style={{ color: CAPTION, lineHeight: 1.45 }}
                      >
                        {basis[l.key]}
                      </span>
                    </div>
                  ))}
                <div
                  className="flex items-center gap-2 py-2"
                  style={{ borderTop: `1px solid rgba(26,26,46,0.06)` }}
                >
                  <span className="w-[76px] shrink-0 text-[11.5px]" style={{ color: INK }}>
                    Exchange rate
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={fx}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isNaN(v)) { setFx(v); setFxTyped(true); setSaved(false); }
                    }}
                    aria-label="Exchange rate to the dollar"
                    className="w-[64px] rounded-md px-1.5 py-1 text-[12.5px] text-right"
                    style={box(INK)}
                  />
                  <span className="flex-1 text-[11px]" style={{ color: CAPTION, lineHeight: 1.45 }}>
                    {fxTyped
                      ? `dollars per ${cardCurrency === "EUR" ? "euro" : cardCurrency}. Yours; `
                      : fxSource === "live"
                        ? `dollars per ${cardCurrency === "EUR" ? "euro" : cardCurrency}, today's rate. `
                        : fxSource === "reference"
                          ? `dollars per ${cardCurrency === "EUR" ? "euro" : cardCurrency}, the ${fxReferenceMonth ?? "reference"} rate (today's couldn't be fetched). `
                          : `dollars per ${cardCurrency === "EUR" ? "euro" : cardCurrency}, the last rate saved here. `}
                    {fxTyped ? (
                      <button type="button" className="underline underline-offset-2" onClick={() => { setFxTyped(false); setFx(fxToCad); setSaved(false); }}>
                        use today&rsquo;s rate
                      </button>
                    ) : "Type one to lock it."}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {(emptyKeys.length > 0 || blankRows > 0) && (
          <button
            onClick={runSuggest}
            disabled={finding}
            className="w-full rounded-full py-3 text-[13.5px] mt-4"
            style={
              emptyKeys.length === FILLS.length
                ? { background: INK, color: "#fff", opacity: finding ? 0.7 : 1 }
                : { border: `1px solid rgba(26,26,46,0.22)`, color: INK, opacity: finding ? 0.7 : 1 }
            }
          >
            {finding ? `Finding ${blankRows} ${blankRows === 1 ? "price" : "prices"}…` : "Estimate from this journey"}
          </button>
        )}

        {(filledKeys.length > 0 || a.excursionsTotal !== 0 || a.pointsCredit !== 0) && (
          <button
            onClick={runClear}
            className="w-full text-[12px] mt-2.5"
            style={{ color: "rgba(26,26,46,0.62)" }}
          >
            Clear all prices
          </button>
        )}

        {prev && (
          <button
            onClick={undo}
            className="w-full text-[12px] mt-2.5"
            style={{ color: SIENNA }}
          >
            Undo
          </button>
        )}

        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-full py-3.5 text-[14px] flex items-center justify-center gap-2 mt-3"
          style={
            emptyKeys.length === FILLS.length
              ? { border: `1px solid rgba(26,26,46,0.22)`, color: INK, opacity: saving ? 0.6 : 1 }
              : { background: INK, color: "#fff", opacity: saving ? 0.6 : 1 }
          }
        >
          {saved && <Check size={14} weight="light" />}
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
