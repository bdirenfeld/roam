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

interface Props {
  tripId: string;
  tripTitle: string;
  partySize: number;
  nights: number;
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
  partySize,
  nights,
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
      compute(a, {
        partySize,
        nights,
        cardBudgets,
        uncostedExcursions,
        fxToCad: initialFxToCad,
      }),
    [a, partySize, nights, cardBudgets, uncostedExcursions, initialFxToCad],
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

  const Row = ({ line }: { line: EstimateLine }) => {
    const off = !line.enabled;
    const dim = off ? SOFT : INK;
    return (
      <div
        className="flex items-center gap-2.5 px-5 py-2.5"
        style={{ borderTop: `1px solid ${RULE}` }}
      >
        {/* Tick — only optional rows carry one; the always-group keeps the
            column so every label starts at the same x. */}
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

        <div className="w-[124px] shrink-0 text-[14px]" style={{ color: dim }}>
          {line.label}
        </div>

        <div className="w-[70px] shrink-0">
          {line.readOnly ? (
            <div
              className="text-[13.5px] text-right pr-2"
              style={{ color: SIENNA }}
            >
              {line.unitDisplay ?? cad(line.unit)}
            </div>
          ) : (
            <input
              type="number"
              inputMode="decimal"
              value={String(line.unit)}
              onChange={(e) => setNum(line.unitKey, e.target.value)}
              className="w-full rounded-md px-2 py-1.5 text-[13.5px] text-right"
              style={{
                background: "#FAF7F2",
                border: `1px solid ${RULE}`,
                color: dim,
              }}
            />
          )}
        </div>

        <div
          className="flex-1 text-[12.5px] whitespace-nowrap flex items-center gap-1"
          style={{ color: line.readOnly ? SIENNA : off ? SOFT : CAPTION }}
        >
          <span>{line.multiplier}</span>
          {line.countKey && (
            <>
              <input
                type="number"
                inputMode="numeric"
                value={String(line.count)}
                onChange={(e) =>
                  setNum(line.countKey as keyof Assumptions, e.target.value)
                }
                className="w-[36px] rounded px-1 py-0.5 text-[12.5px] text-center"
                style={{
                  background: "#FAF7F2",
                  border: `1px solid ${RULE}`,
                  color: dim,
                }}
              />
              <span>{line.countLabel}</span>
            </>
          )}
          {line.hint && (
            <span style={{ color: line.onPoints ? SIENNA : SOFT }}>
              {line.countKey ? "" : " "}
              {line.hint}
            </span>
          )}
        </div>

        <div
          className="w-[70px] text-right text-[14px] shrink-0"
          style={{ color: dim }}
        >
          {off ? "—" : cad(line.amount)}
        </div>

        {/* Points, on the two lines where it's a real option. */}
        <div className="w-[62px] shrink-0 flex justify-end">
          {line.pointsKey && (
            <button
              onClick={() => toggle(line.pointsKey as keyof Assumptions)}
              className="flex items-center gap-1.5 text-[11.5px]"
              style={{ color: line.onPoints ? SIENNA : SOFT }}
            >
              <span
                className="w-[14px] h-[14px] rounded-[3px] flex items-center justify-center"
                style={{
                  background: line.onPoints ? SIENNA : "#FAF7F2",
                  border: `1px solid ${line.onPoints ? SIENNA : "rgba(26,26,46,0.22)"}`,
                  color: "#fff",
                  fontSize: 9,
                  lineHeight: 1,
                }}
              >
                {line.onPoints ? "✓" : ""}
              </span>
              points
            </button>
          )}
        </div>
      </div>
    );
  };

  const always = est.lines.filter((l) => l.group === "always");
  const optional = est.lines.filter((l) => l.group === "optional");

  return (
    <div className="min-h-screen bg-parchment pb-24">
      <div className="mx-auto w-full max-w-[620px] px-5 pt-6">
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
          {partySize} {partySize === 1 ? "traveller" : "travellers"} · {nights}{" "}
          {nights === 1 ? "night" : "nights"}
          {dateRange ? ` · ${dateRange}` : ""}
        </p>

        <div
          className="bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: `0 0 0 1px ${RULE}` }}
        >
          <div className="px-5 pt-5 pb-4">
            <div
              className="font-display italic text-[40px] leading-none mb-2"
              style={{ color: INK }}
            >
              {cad(est.total)}
            </div>
            <div className="text-[13px]" style={{ color: CAPTION }}>
              {cad(est.perPerson)} per person &nbsp;·&nbsp; {cad(est.perDay)} per
              day
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

          <div
            className="flex items-center gap-2.5 px-5 py-2.5"
            style={{ borderTop: `1px solid ${RULE}`, background: "rgba(26,26,46,0.02)" }}
          >
            <div className="w-4 shrink-0" />
            <div className="w-[124px] shrink-0 text-[14px]" style={{ color: CAPTION }}>
              Contingency
            </div>
            <div className="w-[70px] shrink-0">
              <input
                type="number"
                value={String(a.contingencyPct)}
                onChange={(e) => setNum("contingencyPct", e.target.value)}
                className="w-full rounded-md px-2 py-1.5 text-[13.5px] text-right"
                style={{ background: "#FAF7F2", border: `1px solid ${RULE}`, color: INK }}
              />
            </div>
            <div className="flex-1 text-[12.5px]" style={{ color: CAPTION }}>
              % of {cad(est.subtotal)}
            </div>
            <div className="w-[70px] text-right text-[14px]" style={{ color: INK }}>
              {cad(est.contingency)}
            </div>
            <div className="w-[62px] shrink-0" />
          </div>

          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ borderTop: `1px solid ${RULE}` }}
          >
            <span className="text-[14px]" style={{ color: INK }}>
              Total
            </span>
            <span
              className="font-display italic text-[22px]"
              style={{ color: INK }}
            >
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
      className="px-5 pt-3.5 pb-1.5 text-[11px] uppercase tracking-wider"
      style={{ color: SOFT, background: "rgba(26,26,46,0.015)" }}
    >
      {label}
      {aside && (
        <span className="normal-case tracking-normal text-[11.5px]"> {aside}</span>
      )}
    </div>
  );
}
