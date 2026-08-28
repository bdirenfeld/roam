"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretLeft, CaretDown, Check } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import {
  compute,
  type Assumptions,
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
  uncostedExcursions: number;
  rolledExcursionCount: number;
  dateRange: string;
}

const cad = (n: number) =>
  "$" + Math.round(n).toLocaleString("en-CA", { maximumFractionDigits: 0 });

export default function EstimateClient({
  tripId,
  tripTitle,
  initialAssumptions,
  uncostedExcursions,
  rolledExcursionCount,
  dateRange,
}: Props) {
  const router = useRouter();
  const [a, setA] = useState<Assumptions>(initialAssumptions);
  const [open, setOpen] = useState({ standard: true, additional: true });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const est = useMemo(
    () => compute(a, { uncostedExcursions, rolledExcursionCount }),
    [a, uncostedExcursions, rolledExcursionCount],
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
   * Every row on this screen is built from this one shell. The leading 16px
   * slot and the trailing amount column are what make the left and right edges
   * line up; deriving them from a shared structure rather than hand-tuned
   * padding is what stops the group headings drifting off the labels beneath.
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
  };

  const Row = ({ line }: { line: EstimateLine }) => {
    const off = !line.enabled;
    // 0 means "not priced yet", not "free". An unpriced row shows a dash rather
    // than $0, so an empty budget reads as empty instead of as costless.
    const unset = line.unit === 0;
    const dim = off ? SOFT : INK;
    return (
      <Shell
        labelColor={dim}
        amountColor={off || unset ? SOFT : dim}
        label={line.label}
        amount={off || unset ? "—" : cad(line.amount)}
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
              /* A flat sum — no multiplier. Says where the figure came from
                 instead, and stays editable. */
              <div
                className="shrink-0 text-[11px] w-[44px] sm:w-[92px] pl-1 truncate"
                style={{ color: SIENNA }}
              >
                {line.hint ?? ""}
              </div>
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

  const standard = est.lines.filter((l) => l.group === "standard");
  const additional = est.lines.filter((l) => l.group === "additional");
  const sum = (ls: EstimateLine[]) =>
    ls.reduce((s, l) => s + (l.enabled ? l.amount : 0), 0);

  const GroupBar = ({
    id,
    label,
    lines,
  }: {
    id: "standard" | "additional";
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
              {cad(est.perPerson)} per person &nbsp;·&nbsp; {cad(est.perDay)} per day
            </div>
          </div>

          <GroupBar id="standard" label="Standard" lines={standard} />
          {open.standard && standard.map((l) => <Row key={l.key} line={l} />)}

          <GroupBar id="additional" label="Additional" lines={additional} />
          {open.additional && additional.map((l) => <Row key={l.key} line={l} />)}

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

        {uncostedExcursions > 0 && (
          <p className="text-[11.5px] mt-3 px-2" style={{ color: SIENNA, lineHeight: 1.6 }}>
            {uncostedExcursions} scheduled{" "}
            {uncostedExcursions === 1 ? "excursion carries" : "excursions carry"} no
            cost yet, so the seeded figure is light.
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
