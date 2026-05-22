"use client";

// ============================================================
// Roam — Companion panel
// Full-screen on mobile, right-docked side panel on desktop.
// Interview-transcript thread + editorial composer.
// Visual source of truth: /design-reference/companion.
// ============================================================

import { useEffect, useRef } from "react";
import { Compass, X, ArrowElbowDownLeft } from "@phosphor-icons/react";
import type { AddProposal } from "@/lib/companion/types";
import { ProposalCard, ApprovedAck, DiscardedAck } from "./ProposalCard";

const SIENNA = "#C4622D";
const INK = "#1A1A2E";
const RULE = "rgba(26,26,46,0.12)";
const CAPTION = "rgba(26,26,46,0.55)";
const CAPTION_SOFT = "rgba(26,26,46,0.40)";
const LABEL = "rgba(26,26,46,0.85)";

export type ThreadItem =
  | { kind: "msg"; id: string; role: "user" | "assistant"; text: string }
  | {
      kind: "proposal";
      id: string;
      proposal: AddProposal;
      decision: "pending" | "approved" | "discarded";
    };

interface Props {
  items: ThreadItem[];
  loaded: boolean;
  streaming: boolean;
  streamingId: string | null;
  busyProposalId: string | null;
  input: string;
  onInput: (v: string) => void;
  onSend: () => void;
  onClose: () => void;
  onApprove: (id: string) => void;
  onDiscard: (id: string) => void;
}

// ── A single transcript turn ───────────────────────────────────
function ChatTurn({
  role,
  text,
  streaming,
}: {
  role: "user" | "assistant";
  text: string;
  streaming: boolean;
}) {
  const isYou = role === "user";
  return (
    <div className="mb-[26px]">
      <div className="mb-1.5">
        <span
          className="font-display text-[13px] italic"
          style={{ color: isYou ? CAPTION : SIENNA, letterSpacing: "0.01em" }}
        >
          {isYou ? "You." : "Roam."}
        </span>
      </div>
      <div
        className="max-w-[58ch] whitespace-pre-wrap text-[15px] leading-[1.6]"
        style={{ color: isYou ? LABEL : INK, letterSpacing: "-0.005em" }}
      >
        {text}
        {streaming && (
          <span
            className="roam-caret ml-0.5 inline-block h-[14px] w-[7px] align-[-2px]"
            style={{ background: INK }}
          />
        )}
      </div>
    </div>
  );
}

// ── Editorial composer — thin rule, italic placeholder ─────────
function Composer({
  value,
  onInput,
  onSend,
  disabled,
}: {
  value: string;
  onInput: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow to content, capped.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [value]);

  return (
    <div className="px-5 pb-5">
      <div className="pt-3.5" style={{ borderTop: `1px solid ${RULE}` }}>
        <div className="flex items-end gap-3.5 py-1.5">
          <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!disabled) onSend();
              }
            }}
            placeholder="Think aloud with Roam…"
            className="flex-1 resize-none bg-transparent text-[15px] leading-[1.5] outline-none placeholder:font-display placeholder:text-[16px] placeholder:italic"
            style={{ color: INK, letterSpacing: "-0.005em", maxHeight: 132 }}
          />
          <button
            type="button"
            onClick={() => !disabled && onSend()}
            disabled={disabled}
            aria-label="Send"
            className="flex flex-shrink-0 items-center gap-1.5 pb-0.5 disabled:opacity-40"
          >
            <span
              className="text-[9.5px] font-medium uppercase"
              style={{ letterSpacing: "0.22em", color: CAPTION_SOFT }}
            >
              Return to send
            </span>
            <ArrowElbowDownLeft size={13} weight="light" style={{ color: CAPTION }} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CompanionPanel({
  items,
  loaded,
  streaming,
  streamingId,
  busyProposalId,
  input,
  onInput,
  onSend,
  onClose,
  onApprove,
  onDiscard,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);

  // Keep the transcript pinned to the latest line.
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, streaming]);

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-[#FAF7F2] animate-in fade-in slide-in-from-right duration-300 md:left-auto md:w-[440px]"
      style={{ borderLeft: `1px solid rgba(26,26,46,0.20)` }}
      role="dialog"
      aria-label="Roam Companion"
    >
      {/* Masthead */}
      <div
        className="flex flex-shrink-0 items-center justify-between px-5 py-3.5"
        style={{ borderBottom: `1px solid ${RULE}` }}
      >
        <div className="flex items-center gap-2.5">
          <Compass size={16} weight="light" style={{ color: SIENNA }} />
          <span
            className="font-display text-[17px] italic"
            style={{ color: INK, letterSpacing: "-0.005em" }}
          >
            Roam · Companion
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close companion"
          className="flex h-7 w-7 items-center justify-center"
          style={{ color: CAPTION }}
        >
          <X size={15} weight="light" />
        </button>
      </div>

      {/* Thread */}
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {!loaded ? (
          <p className="font-display text-[14px] italic" style={{ color: CAPTION_SOFT }}>
            Opening…
          </p>
        ) : items.length === 0 ? (
          <div className="pt-2">
            <p
              className="font-display text-[19px] italic"
              style={{ color: INK, letterSpacing: "-0.005em" }}
            >
              A thinking partner for this journey.
            </p>
            <p className="mt-2.5 max-w-[44ch] text-[13.5px] leading-[1.6]" style={{ color: CAPTION }}>
              Think aloud — scope a day, weigh an idea, ask for places worth
              considering. Nothing changes without your say-so.
            </p>
          </div>
        ) : (
          items.map((item) => {
            if (item.kind === "msg") {
              return (
                <ChatTurn
                  key={item.id}
                  role={item.role}
                  text={item.text}
                  streaming={streaming && item.id === streamingId}
                />
              );
            }
            return (
              <div key={item.id} className="mb-[26px] max-w-[64ch]">
                {item.decision === "pending" && (
                  <ProposalCard
                    proposal={item.proposal}
                    busy={busyProposalId === item.id}
                    onApprove={() => onApprove(item.id)}
                    onDiscard={() => onDiscard(item.id)}
                  />
                )}
                {item.decision === "approved" && (
                  <ApprovedAck count={item.proposal.places.length} />
                )}
                {item.decision === "discarded" && <DiscardedAck />}
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      <div className="flex-shrink-0">
        <Composer value={input} onInput={onInput} onSend={onSend} disabled={streaming} />
      </div>
    </div>
  );
}
