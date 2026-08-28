"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretLeft, Check } from "@phosphor-icons/react";
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

/** Rows and group headers share this left edge so every label lines up. */
const PAD = 16;
const INDENT = 40; // PAD + tick column + gap

interface Props {
  tripId: string;
  tripTitle: string;
  initialAssumptions: Assumptions;
  cardBudgets: CardBudget[];
  uncostedExcursions: number;
  initialFxToCad: number;
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
  dateRange,
}: Props) {
  const router = useRouter();
  const [a, setA] = useState<Assumptions>(initialAssumptions);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const est = useMemo(
    () =>
      compute(a, { cardBudgets, uncostedExcursions, fxToCad: initialFxToCad }),
    [a, cardBudgets, uncostedExcursions, initialFxToCad],
  );

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
          fx_to_cad: initialFxToCad,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "trip_id" },
      );
      setSaved(true);
      router.refresh();
    }
    setSaving(false);
  };

  const boxStyle = (dim: string) => ({
    background: "#FAF7F2",
    border: `1px solid ${RULE}`,
    color: dim,
  });

  /**
   * One line, at every width. The columns are narrow enough to survive a 360px
   * phone: tick, label, unit, count, amount. Both numbers are editable — the
   * count is seeded from the journey but typing over it here beats navigating
   * to Settings to find out what it is.
   */
  const Row = ({ line }: { line: EstimateLine }) => {
    const off = !line.enabled;
    const dim = off ? SOFT : INK;
    return (
      <div
        className="flex items-center gap-1.5"
        style={{
          borderTop: `1px solid ${RULE}`,
          padding: `10px ${PAD}px`,
        }}
      >
        <div className="w-4 shrink-0">
          {line.enabledKey && (
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
          )}
        </div>

        <div
          className="flex-1 min-w-0 text-[14px] truncate"
          style={{ color: dim, marginLeft: 8 }}
          title={line.note ?? line.label}
        >
          {line.label}
        </div>

        {/* Unit cost */}
        <div className="w-[58px] shrink-0">
          {line.readOnly ? (
            <div className="text-[13px] text-right" style={{ color: SIENNA }}>
              {line.unitDisplay ?? cad(line.unit)}
            </div>
          ) : (
            <input
              type="number"
              inputMode="decimal"
              value={String(line.unit)}
              onChange={(e) => setNum(line.unitKey, e.target.value)}
              className="w-full rounded-md px-1.5 py-1.5 text-[13px] text-right"
              style={boxStyle(dim)}
            />
          )}
        </div>

        {/* × count */}
        <span className="text-[12px] shrink-0" style={{ color: off ? SOFT : CAPTION }}>
          ×
        </span>
        <div className="w-[34px] shrink-0">
          {line.readOnly ? (
            <div className="text-[12px] text-center" style={{ color: SIENNA }}>
              {line.count}
            </div>
          ) : (
            <input
              type="number"
              inputMode="numeric"
              value={String(line.count)}
              onChange={(e) => setNum(line.countKey, e.target.value)}
              className="w-full rounded px-0.5 py-1 text-[12.5px] text-center"
              style={boxStyle(dim)}
            />
          )}
        </div>
        <span
          className="text-[12px] shrink-0 w-[42px]"
          style={{ color: line.readOnly ? SIENNA : off ? SOFT : CAPTION }}
        >
          {line.countLabel}
        </span>

        <div
          className="w-[62px] shrink-0 text-right text-[14px]"
          style={{ color: dim }}
        >
          {off ? "—" : cad(line.amount)}
        </div>
      </div>
    );
  };

  /** Subtotal / contingency / points — same column grid, no tick, no count. */
  const SumRow = ({
    label,
    valueKey,
    suffix,
    amount,
    negative,
    tint,
  }: {
    label: string;
    valueKey?: keyof Assumptions;
    suffix?: string;
    amount: number;
    negative?: boolean;
    tint?: string;
  }) => (
    <div
      className="flex items-center gap-1.5"
      style={{ borderTop: `1px solid ${RULE}`, padding: `10px ${PAD}px` }}
    >
      <div className="w-4 shrink-0" />
      <div
        className="flex-1 min-w-0 text-[14px] truncate"
        style={{ color: tint ?? CAPTION, marginLeft: 8 }}
      >
        {label}
      </div>
      <div className="w-[58px] shrink-0">
        {valueKey && (
          <input
            type="number"
            inputMode="decimal"
            value={String(a[valueKey])}
            onChange={(e) => setNum(valueKey, e.target.value)}
            className="w-full rounded-md px-1.5 py-1.5 text-[13px] text-right"
            style={boxStyle(tint ?? INK)}
          />
        )}
      </div>
      <span className="w-[34px] shrink-0 text-[12px]" style={{ color: SOFT }}>
        {suffix}
      </span>
      <span className="w-[42px] shrink-0" />
      <div
        className="w-[62px] shrink-0 text-right text-[14px]"
        style={{ color: tint ?? INK }}
      >
        {negative && amount > 0 ? "−" : ""}
        {cad(amount)}
      </div>
    </div>
  );

  const always = est.lines.filter((l) => l.group === "always");
  const optional = est.lines.filter((l) => l.group === "optional");

  return (
    <div
      className="min-h-screen bg-parchment pb-24"
      // No masthead and no bottom nav on this screen, so it would otherwise run
      // straight under the status bar on a phone.
      style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
    >
      <div className="mx-auto w-full max-w-[560px] px-4 pt-2">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 mb-5"
          style={{ color: CAPTION, fontSize: 13 }}
        >
          <CaretLeft size={15} weight="light" />
          {tripTitle}
        </button>

        <h1 className="font-display italic text-[29px]" style={{ color: INK }}>
          Estimate
        </h1>
        <p className="text-[13px] mb-6" style={{ color: CAPTION }}>
          {a.people} {a.people === 1 ? "traveller" : "travellers"} · {a.nights}{" "}
          {a.nights === 1 ? "night" : "nights"}
          {dateRange ? ` · ${dateRange}` : ""}
        </p>

        <div
          className="bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: `0 0 0 1px ${RULE}` }}
        >
          <div style={{ padding: `20px ${PAD}px 16px` }}>
            <div
              className="font-display italic text-[36px] leading-none mb-2"
              style={{ color: INK }}
            >
              {cad(est.total)}
            </div>
            <div className="text-[13px]" style={{ color: CAPTION }}>
              {cad(est.perPerson)} per person &nbsp;·&nbsp; {cad(est.perDay)} per day
            </div>
          </div>

          <GroupHead label="Every trip" />
          {always.map((l) => (
            <Row key={l.key} line={l} />
          ))}

          <GroupHead label="Might happen" aside="— tick what applies" />
          {optional.map((l) => (
            <Row key={l.key} line={l} />
          ))}

          <SumRow label="Contingency" valueKey="contingencyPct" suffix="%" amount={est.contingency} />
          <SumRow
            label="Paid with points"
            valueKey="pointsCredit"
            amount={est.pointsCredit}
            negative
            tint={est.pointsCredit > 0 ? SIENNA : undefined}
          />

          <div
            className="flex items-center justify-between py-4"
            style={{ borderTop: `1px solid ${RULE}`, padding: `16px ${PAD}px` }}
          >
            <span className="text-[14px]" style={{ color: INK }}>
              Total
            </span>
            <span className="font-display italic text-[22px]" style={{ color: INK }}>
              {cad(est.total)}
            </span>
          </div>
        </div>

        {uncostedExcursions > 0 && (
          <p className="text-[11.5px] mt-3 px-1" style={{ color: SIENNA, lineHeight: 1.6 }}>
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

function GroupHead({ label, aside }: { label: string; aside?: string }) {
  return (
    <div
      className="text-[11px] uppercase tracking-wider"
      style={{
        color: SOFT,
        background: "rgba(26,26,46,0.015)",
        padding: `14px ${PAD}px 6px ${INDENT}px`,
      }}
    >
      {label}
      {aside && (
        <span className="normal-case tracking-normal text-[11.5px]"> {aside}</span>
      )}
    </div>
  );
}
