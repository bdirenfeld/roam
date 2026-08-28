"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretLeft, CaretDown, Check } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import {
  compute,
  type Assumptions,
  type CardBudget,
  type EstimateLine,
} from "@/lib/budget/model";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.55)";
const SOFT = "rgba(26,26,46,0.35)";
const RULE = "rgba(26,26,46,0.10)";
const SIENNA = "#C4622D";

const PAD = 14;

interface Props {
  tripId: string;
  tripTitle: string;
  initialAssumptions: Assumptions;
  cardBudgets: CardBudget[];
  uncostedExcursions: number;
  initialFxToCad: number;
  initialCurrency: string;
  dateRange: string;
}

const cad = (n: number) =>
  "$" + Math.round(n).toLocaleString("en-CA", { maximumFractionDigits: 0 });

export default function EstimateClient({
  tripId,
  tripTitle,
  initialAssumptions,
  cardBudgets,
  uncostedExcursions,
  initialFxToCad,
  initialCurrency,
  dateRange,
}: Props) {
  const router = useRouter();
  const [a, setA] = useState<Assumptions>(initialAssumptions);
  const [open, setOpen] = useState({ always: true, optional: true });
  const [fx, setFx] = useState(initialFxToCad);
  const [currency, setCurrency] = useState(initialCurrency);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const est = useMemo(
    () => compute(a, { cardBudgets, uncostedExcursions, fxToCad: fx }),
    [a, cardBudgets, uncostedExcursions, fx],
  );

  // What you'll actually hand over abroad: the lines marked local, shown back
  // in local money. The rate is CAD per 1 unit of local, so converting home →
  // local divides. Guard the zero you pass through while typing "1.4".
  const localCad = est.lines
    .filter((l) => l.enabled && l.local)
    .reduce((s, l) => s + l.amount, 0);
  const localSpend = fx > 0 ? localCad / fx : 0;
  const symbol =
    ({ EUR: "€", GBP: "£", USD: "$", JPY: "¥", CHF: "CHF ", MXN: "$" } as Record<
      string,
      string
    >)[currency.toUpperCase()] ?? "";

  const setNum = (key: keyof Assumptions, raw: string) => {
    const v = raw === "" ? 0 : Number(raw);
    if (Number.isNaN(v)) return;
    setA((p) => ({ ...p, [key]: v }));
    setSaved(false);
  };
  const toggle = (key: keyof Assumptions) => {
    setA((p) => ({ ...p, [key]: !p[key] }));
    setSaved(false);
  };
  /** Flip one line between "I pay this at home" and "I pay this there". */
  const toggleLocal = (key: string) => {
    setA((p) => ({
      ...p,
      localLines: p.localLines.includes(key)
        ? p.localLines.filter((k) => k !== key)
        : [...p.localLines, key],
    }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("trip_budgets").upsert(
        {
          trip_id: tripId,
          user_id: user.id,
          assumptions: a as unknown as Record<string, unknown>,
          fx_to_cad: fx,
          currency: currency.toUpperCase().slice(0, 3),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "trip_id" },
      );
      setSaved(true);
      router.refresh();
    }
    setSaving(false);
  };

  const box = (dim: string) => ({
    background: "#FAF7F2",
    border: `1px solid ${RULE}`,
    color: dim,
  });

  /**
   * Every row on this screen — group bars, line items and the summary rows —
   * is built from this one shell. The leading 16px slot and the trailing amount
   * column are what make the left and right edges line up; deriving them from a
   * shared structure rather than hand-tuned padding is what stops the group
   * headings drifting a few pixels off the labels beneath them.
   */
  const Shell = ({
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
  }) => {
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
          className="w-[56px] shrink-0 text-right text-[13.5px]"
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
  };

  const Row = ({ line }: { line: EstimateLine }) => {
    const off = !line.enabled;
    const dim = off ? SOFT : INK;
    return (
      <Shell
        labelColor={dim}
        amountColor={dim}
        label={line.label}
        amount={off ? "—" : cad(line.amount)}
        leading={
          line.enabledKey && (
            <button
              onClick={() => toggle(line.enabledKey as keyof Assumptions)}
              aria-label={`${line.enabled ? "Exclude" : "Include"} ${line.label}`}
              className="w-[15px] h-[15px] rounded flex items-center justify-center"
              style={{
                background: line.enabled ? INK : "#FAF7F2",
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
            {/* The unit cost is entered in whatever money you'll be quoted in.
                Tap the symbol to flip the line between home and local — the
                amount column stays CAD either way. */}
            <div className="w-[68px] shrink-0 flex items-center gap-0.5">
              {line.readOnly ? (
                <div
                  className="w-full text-[12.5px] text-right"
                  style={{ color: SIENNA }}
                >
                  {line.unitDisplay ?? cad(line.unit)}
                </div>
              ) : (
                <>
                  <button
                    onClick={() => toggleLocal(line.key)}
                    aria-label={`${line.label} is paid in ${line.local ? currency : "CAD"} — tap to change`}
                    className="w-[13px] shrink-0 text-[11.5px] text-center"
                    style={{ color: line.local ? SIENNA : SOFT }}
                  >
                    {line.local ? symbol || currency.slice(0, 1) : "$"}
                  </button>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={String(line.unit)}
                    onChange={(e) => setNum(line.unitKey, e.target.value)}
                    className="flex-1 min-w-0 rounded-md px-1 py-1.5 text-[12.5px] text-right"
                    style={box(dim)}
                  />
                </>
              )}
            </div>
            {line.readOnly ? (
              <div
                className="shrink-0 text-[11.5px] text-center w-[42px] sm:w-[88px]"
                style={{ color: SIENNA }}
              >
                <span className="sm:hidden">×{line.count}</span>
                <span className="hidden sm:inline">
                  from {line.count} {line.countLabel}
                </span>
              </div>
            ) : (
              <>
                <span className="text-[11px] shrink-0" style={{ color: off ? SOFT : CAPTION }}>
                  ×
                </span>
                <div className="w-[30px] shrink-0">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={String(line.count)}
                    onChange={(e) => setNum(line.countKey, e.target.value)}
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
  };

  const always = est.lines.filter((l) => l.group === "always");
  const optional = est.lines.filter((l) => l.group === "optional");
  const sum = (ls: EstimateLine[]) =>
    ls.reduce((s, l) => s + (l.enabled ? l.amount : 0), 0);

  const GroupBar = ({
    id,
    label,
    lines,
  }: {
    id: "always" | "optional";
    label: string;
    lines: EstimateLine[];
  }) => (
    <Shell
      pv={11}
      tint="rgba(26,26,46,0.025)"
      onClick={() => setOpen((p) => ({ ...p, [id]: !p[id] }))}
      labelColor={CAPTION}
      amountColor={CAPTION}
      amount={cad(sum(lines))}
      leading={
        <CaretDown
          size={12}
          weight="bold"
          color={SOFT}
          style={{
            transform: open[id] ? "none" : "rotate(-90deg)",
            transition: "transform 140ms",
          }}
        />
      }
      label={
        <span className="text-[11px] uppercase tracking-wider">
          {label}
          {!open[id] && (
            <span className="normal-case tracking-normal" style={{ color: SOFT }}>
              {" "}
              · {lines.filter((l) => l.enabled).length} items
            </span>
          )}
        </span>
      }
    />
  );

  return (
    <div
      className="min-h-screen bg-parchment pb-24"
      style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
    >
      <div className="mx-auto w-full max-w-[560px] px-3 pt-2">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 mb-5 px-1"
          style={{ color: CAPTION, fontSize: 13 }}
        >
          <CaretLeft size={15} weight="light" />
          {tripTitle}
        </button>

        <h1 className="font-display italic text-[29px] px-1" style={{ color: INK }}>
          Estimate
        </h1>
        <p className="text-[13px] mb-5 px-1" style={{ color: CAPTION }}>
          {a.people} {a.people === 1 ? "traveller" : "travellers"} · {a.nights}{" "}
          {a.nights === 1 ? "night" : "nights"}
          {dateRange ? ` · ${dateRange}` : ""}
        </p>

        <div
          className="bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: `0 0 0 1px ${RULE}` }}
        >
          <div style={{ padding: `18px ${PAD}px 15px` }}>
            <div
              className="font-display italic text-[36px] leading-none mb-1.5"
              style={{ color: INK }}
            >
              {cad(est.total)}
            </div>
            <div className="text-[12.5px]" style={{ color: CAPTION }}>
              {cad(est.perPerson)} per person &nbsp;·&nbsp; {cad(est.perDay)} per day
            </div>
          </div>

          <GroupBar id="always" label="Every trip" lines={always} />
          {open.always && always.map((l) => <Row key={l.key} line={l} />)}

          <GroupBar id="optional" label="Might happen" lines={optional} />
          {open.optional && optional.map((l) => <Row key={l.key} line={l} />)}

          <Shell
            labelColor={CAPTION}
            amountColor={INK}
            label="Contingency"
            amount={cad(est.contingency)}
            middle={
              <>
                <div className="w-[68px] shrink-0">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={String(a.contingencyPct)}
                    onChange={(e) => setNum("contingencyPct", e.target.value)}
                    className="w-full rounded-md px-1 py-1.5 text-[12.5px] text-right"
                    style={box(INK)}
                  />
                </div>
                <span
                  className="text-[11px] shrink-0 w-[42px] sm:w-[88px] pl-1"
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
                <div className="w-[68px] shrink-0">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={String(a.pointsCredit)}
                    onChange={(e) => setNum("pointsCredit", e.target.value)}
                    className="w-full rounded-md px-1 py-1.5 text-[12.5px] text-right"
                    style={box(est.pointsCredit > 0 ? SIENNA : INK)}
                  />
                </div>
                <span className="shrink-0 w-[42px] sm:w-[88px]" />
              </>
            }
          />

          <Shell
            pv={14}
            labelColor={INK}
            amountColor={INK}
            label={<span className="text-[14px]">Total</span>}
            amount={
              <span className="font-display italic text-[20px]">{cad(est.total)}</span>
            }
          />

          {/* Not a second total — the slice of the journey you pay for on the
              ground, shown back in that money. Everything marked with the local
              symbol above lands here. */}
          <Shell
            labelColor={CAPTION}
            amountColor={CAPTION}
            label={
              <span className="flex items-center gap-1.5">
                Paid in
                <input
                  value={currency}
                  onChange={(e) => {
                    setCurrency(e.target.value.toUpperCase().slice(0, 3));
                    setSaved(false);
                  }}
                  aria-label="Local currency code"
                  className="w-[44px] rounded px-1 py-0.5 text-[12px] text-center uppercase"
                  style={box(INK)}
                />
              </span>
            }
            middle={
              <>
                <div className="w-[68px] shrink-0">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={String(fx)}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isNaN(v)) setFx(v);
                      setSaved(false);
                    }}
                    aria-label={`CAD per 1 ${currency}`}
                    className="w-full rounded-md px-1 py-1.5 text-[12.5px] text-right"
                    style={box(INK)}
                  />
                </div>
                <span
                  className="text-[11px] shrink-0 w-[42px] sm:w-[88px] pl-1 truncate"
                  style={{ color: SOFT }}
                >
                  <span className="hidden sm:inline">CAD per 1 {currency}</span>
                  <span className="sm:hidden">rate</span>
                </span>
              </>
            }
            amount={
              fx > 0
                ? `${symbol}${Math.round(localSpend).toLocaleString("en-CA")}`
                : "—"
            }
          />
        </div>

        {uncostedExcursions > 0 && (
          <p className="text-[11.5px] mt-3 px-2" style={{ color: SIENNA, lineHeight: 1.6 }}>
            {uncostedExcursions} scheduled{" "}
            {uncostedExcursions === 1 ? "excursion carries" : "excursions carry"} no
            cost yet, so the real figure is higher than this.
          </p>
        )}

        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-full py-3.5 text-[14px] flex items-center justify-center gap-2 mt-5"
          style={{ background: INK, color: "#fff", opacity: saving ? 0.6 : 1 }}
        >
          {saved && <Check size={14} weight="light" />}
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
