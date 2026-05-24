"use client";

// ============================================================
// Roam — Companion confirm gate
// The inline proposal card, plus the after-decision ack frames.
// Visual source of truth: /design-reference/companion.
// ============================================================

import {
  Check,
  Plus,
  Scissors,
  ArrowCounterClockwise,
  Coffee,
  ForkKnife,
  IceCream,
  Wine,
  Storefront,
  Flag,
  Bed,
  MapPin,
} from "@phosphor-icons/react";
import type { AddProposal, CutProposal, ProposalIcon } from "@/lib/companion/types";

const SIENNA = "#C4622D";
const INK = "#1A1A2E";
const PARCHMENT = "#FAF7F2";
const RULE = "rgba(26,26,46,0.12)";
const RULE_STRONG = "rgba(26,26,46,0.20)";

const ICONS: Record<ProposalIcon, typeof Coffee> = {
  coffee: Coffee,
  fork: ForkKnife,
  dessert: IceCream,
  bar: Wine,
  shop: Storefront,
  flag: Flag,
  bed: Bed,
  pin: MapPin,
};

// ── The proposal — an editorial card inline in the thread ──────
export function ProposalCard({
  proposal,
  busy,
  onApprove,
  onDiscard,
}: {
  proposal: AddProposal;
  busy: boolean;
  onApprove: () => void;
  onDiscard: () => void;
}) {
  const count = proposal.places.length;

  return (
    <div
      className="overflow-hidden rounded-[4px] bg-[#FAF7F2]"
      style={{ border: `1px solid ${RULE_STRONG}` }}
    >
      {/* Header */}
      <div className="px-4 pb-3 pt-3.5" style={{ borderBottom: `1px solid ${RULE}` }}>
        <div className="mb-1 flex items-baseline justify-between">
          <span
            className="text-[9.5px] font-medium uppercase"
            style={{ letterSpacing: "0.22em", color: SIENNA }}
          >
            About to add
          </span>
          <span
            className="text-[9.5px] font-medium uppercase"
            style={{ letterSpacing: "0.22em", color: "rgba(26,26,46,0.40)" }}
          >
            {count} {count === 1 ? "place" : "places"}
          </span>
        </div>
        <p
          className="font-display text-[17px] italic"
          style={{ color: INK, letterSpacing: "-0.005em" }}
        >
          {proposal.heading}
        </p>
        {proposal.lede && (
          <p className="mt-1.5 text-[12.5px] leading-[1.55]" style={{ color: "rgba(26,26,46,0.55)" }}>
            {proposal.lede}
          </p>
        )}
        <p className="mt-1.5 text-[11px]" style={{ color: "rgba(26,26,46,0.40)" }}>
          Held unscheduled — you choose the day.
        </p>
      </div>

      {/* Place rows */}
      <div>
        {proposal.places.map((p, i) => {
          const Icon = ICONS[p.icon] ?? MapPin;
          return (
            <div
              key={`${p.google_place_id}-${i}`}
              className="flex items-start gap-3 px-3.5 py-3 animate-in fade-in slide-in-from-bottom-2 duration-300"
              style={{
                borderBottom: i < count - 1 ? `1px solid ${RULE}` : "none",
                animationDelay: `${i * 60}ms`,
                animationFillMode: "both",
              }}
            >
              <div
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#F2EDE3]"
                style={{ border: `1px solid ${RULE_STRONG}`, color: INK }}
              >
                <Icon size={14} weight="light" />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="text-[11px] font-medium uppercase"
                  style={{ letterSpacing: "0.14em", color: "rgba(26,26,46,0.40)" }}
                >
                  {p.kind}
                </div>
                <div
                  className="text-[14px] font-medium"
                  style={{ color: INK, letterSpacing: "-0.01em" }}
                >
                  {p.name}
                </div>
                {p.meta && (
                  <div className="mt-0.5 text-[11.5px]" style={{ color: "rgba(26,26,46,0.55)" }}>
                    {p.meta}
                  </div>
                )}
              </div>
              <Plus
                size={12}
                weight="light"
                style={{ color: "rgba(26,26,46,0.40)", marginTop: 3, flexShrink: 0 }}
              />
            </div>
          );
        })}
      </div>

      {/* Footer — reassurance + Approve / Discard */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3"
        style={{ borderTop: `1px solid ${RULE}`, background: "#F7F3EA" }}
      >
        <span
          className="font-display text-[12.5px] italic"
          style={{ color: "rgba(26,26,46,0.55)" }}
        >
          Nothing changes until you approve.
        </span>
        <div className="flex flex-shrink-0 items-center gap-4">
          <button
            type="button"
            onClick={onDiscard}
            disabled={busy}
            className="bg-transparent text-[13px] font-medium disabled:opacity-40"
            style={{ color: "rgba(26,26,46,0.55)" }}
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-medium disabled:opacity-60"
            style={{ background: INK, color: PARCHMENT }}
          >
            {busy ? "Adding…" : "Approve"}
            {!busy && <Check size={13} weight="light" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── After approval — the card collapses to a quiet ack frame ───
export function ApprovedAck({ count }: { count: number }) {
  return (
    <div
      className="rounded-[4px] px-4 py-3.5 animate-in fade-in duration-300"
      style={{ background: "#F7F3EA", border: `1px solid ${RULE}` }}
    >
      <div className="flex items-center gap-2.5">
        <Check size={14} weight="light" style={{ color: INK }} />
        <span
          className="text-[10px] font-medium uppercase"
          style={{ letterSpacing: "0.22em", color: "rgba(26,26,46,0.85)" }}
        >
          Added · {count} {count === 1 ? "place" : "places"}
        </span>
      </div>
    </div>
  );
}

// ── After discard — a quiet trace, nothing vanishes ────────────
export function DiscardedAck() {
  return (
    <p
      className="font-display text-[14px] italic animate-in fade-in duration-300"
      style={{ color: "rgba(26,26,46,0.55)" }}
    >
      Discarded — nothing moved.
    </p>
  );
}

// ── Cut proposal — sober variant of the confirm gate ───────────
// Cards listed at reduced opacity (never strikethrough — that reads
// punitive). Reason line appears ONLY when the traveller gave one.
export function CutProposalCard({
  proposal,
  busy,
  onApprove,
  onDiscard,
}: {
  proposal: CutProposal;
  busy: boolean;
  onApprove: () => void;
  onDiscard: () => void;
}) {
  const count = proposal.cards.length;
  return (
    <div
      className="overflow-hidden rounded-[4px] bg-[#FAF7F2]"
      style={{ border: `1px solid ${RULE_STRONG}` }}
    >
      {/* Header */}
      <div className="px-4 pb-3 pt-3.5" style={{ borderBottom: `1px solid ${RULE}` }}>
        <div className="mb-1 flex items-baseline justify-between">
          <span
            className="text-[9.5px] font-medium uppercase"
            style={{ letterSpacing: "0.22em", color: SIENNA }}
          >
            About to cut
          </span>
          <span
            className="text-[9.5px] font-medium uppercase"
            style={{ letterSpacing: "0.22em", color: "rgba(26,26,46,0.40)" }}
          >
            {count} {count === 1 ? "card" : "cards"}
          </span>
        </div>
        <p
          className="font-display text-[17px] italic"
          style={{ color: INK, letterSpacing: "-0.005em" }}
        >
          {proposal.heading}
        </p>
        {proposal.lede && (
          <p className="mt-1.5 text-[12.5px] leading-[1.55]" style={{ color: "rgba(26,26,46,0.55)" }}>
            {proposal.lede}
          </p>
        )}
        {proposal.reason && (
          <p
            className="mt-1.5 font-display text-[12.5px] italic leading-[1.55]"
            style={{ color: "rgba(26,26,46,0.55)" }}
          >
            “{proposal.reason}”
          </p>
        )}
        <p className="mt-1.5 text-[11px]" style={{ color: "rgba(26,26,46,0.40)" }}>
          Always restorable — nothing is destroyed.
        </p>
      </div>

      {/* Card rows — at reduced opacity, never struck through */}
      <div>
        {proposal.cards.map((c, i) => (
          <div
            key={`${c.card_id}-${i}`}
            className="flex items-start gap-3 px-3.5 py-3 animate-in fade-in slide-in-from-bottom-2 duration-300"
            style={{
              borderBottom: i < count - 1 ? `1px solid ${RULE}` : "none",
              animationDelay: `${i * 60}ms`,
              animationFillMode: "both",
              opacity: 0.5,
            }}
          >
            <div
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#F2EDE3]"
              style={{ border: `1px solid ${RULE_STRONG}`, color: INK }}
            >
              <Scissors size={13} weight="light" />
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="text-[14px] font-medium"
                style={{ color: INK, letterSpacing: "-0.01em" }}
              >
                {c.title}
              </div>
              <div className="mt-0.5 text-[11.5px]" style={{ color: "rgba(26,26,46,0.55)" }}>
                {c.meta}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer — same vocabulary as the add gate */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3"
        style={{ borderTop: `1px solid ${RULE}`, background: "#F7F3EA" }}
      >
        <span
          className="font-display text-[12.5px] italic"
          style={{ color: "rgba(26,26,46,0.55)" }}
        >
          Nothing changes until you approve.
        </span>
        <div className="flex flex-shrink-0 items-center gap-4">
          <button
            type="button"
            onClick={onDiscard}
            disabled={busy}
            className="bg-transparent text-[13px] font-medium disabled:opacity-40"
            style={{ color: "rgba(26,26,46,0.55)" }}
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-medium disabled:opacity-60"
            style={{ background: INK, color: PARCHMENT }}
          >
            {busy ? "Cutting…" : "Approve"}
            {!busy && <Check size={13} weight="light" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── After cut — collapsed ack frame with a Sienna Restore link ──
// The Restore call is a direct, non-model API hit; it puts each card
// back at the status it held BEFORE the cut.
export function CutAck({
  count,
  busy,
  onRestore,
}: {
  count: number;
  busy: boolean;
  onRestore: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-[4px] px-4 py-3.5 animate-in fade-in duration-300"
      style={{ background: "#F7F3EA", border: `1px solid ${RULE}` }}
    >
      <div className="flex items-center gap-2.5">
        <Scissors size={13} weight="light" style={{ color: INK }} />
        <span
          className="text-[10px] font-medium uppercase"
          style={{ letterSpacing: "0.22em", color: "rgba(26,26,46,0.85)" }}
        >
          Cut · {count} {count === 1 ? "card" : "cards"}
        </span>
      </div>
      <button
        type="button"
        onClick={onRestore}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium disabled:opacity-40"
        style={{ color: SIENNA }}
      >
        <ArrowCounterClockwise size={12} weight="light" />
        {busy ? "Restoring…" : "Restore"}
      </button>
    </div>
  );
}

// ── After restore — quiet trace, mirrors DiscardedAck ──────────
export function RestoredAck() {
  return (
    <p
      className="font-display text-[14px] italic animate-in fade-in duration-300"
      style={{ color: "rgba(26,26,46,0.55)" }}
    >
      Restored — back where it was.
    </p>
  );
}
