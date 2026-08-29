"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CaretLeft, ArrowSquareOut } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.55)";
const SOFT = "rgba(26,26,46,0.35)";
const RULE = "rgba(26,26,46,0.10)";
const SIENNA = "#C4622D";

export interface Idea {
  id: string;
  url: string | null;
  title: string | null;
  note: string | null;
  source: string | null;
  status: string;
  created_at: string;
}

export default function IdeasClient({ initial }: { initial: Idea[] }) {
  const router = useRouter();
  const [ideas, setIdeas] = useState(initial);
  const [showPassed, setShowPassed] = useState(false);

  const setStatus = async (id: string, status: string) => {
    setIdeas((p) => p.map((i) => (i.id === id ? { ...i, status } : i)));
    const supabase = createClient();
    await supabase.from("ideas").update({ status }).eq("id", id);
  };

  const inbox = ideas.filter((i) => i.status === "inbox");
  const kept = ideas.filter((i) => i.status === "kept");
  const passed = ideas.filter((i) => i.status === "passed");

  const Item = ({ i }: { i: Idea }) => (
    <div
      className="px-4 py-3"
      style={{ borderTop: `1px solid ${RULE}` }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[14px]" style={{ color: INK }}>
            {i.note || i.title || i.url || "Untitled"}
          </div>
          <div className="text-[11.5px] mt-0.5 flex items-center gap-2" style={{ color: SOFT }}>
            {i.source ?? "no link"}
            {i.note && i.title && (
              <span className="truncate" style={{ maxWidth: 160 }}>
                · {i.title}
              </span>
            )}
          </div>
        </div>
        {i.url && (
          <a
            href={i.url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 p-1"
            aria-label="Open"
          >
            <ArrowSquareOut size={16} weight="light" color={SOFT} />
          </a>
        )}
      </div>
      {i.status === "inbox" && (
        <div className="flex gap-2 mt-2.5">
          <button
            onClick={() => setStatus(i.id, "kept")}
            className="px-3 py-1.5 rounded-full text-[12px]"
            style={{ background: INK, color: "#fff" }}
          >
            Keep
          </button>
          <button
            onClick={() => setStatus(i.id, "passed")}
            className="px-3 py-1.5 rounded-full text-[12px]"
            style={{ border: `1px solid ${RULE}`, color: CAPTION }}
          >
            Pass
          </button>
        </div>
      )}
    </div>
  );

  const Group = ({ label, items }: { label: string; items: Idea[] }) =>
    items.length === 0 ? null : (
      <div
        className="bg-white rounded-2xl overflow-hidden mb-4"
        style={{ boxShadow: `0 0 0 1px ${RULE}` }}
      >
        <div
          className="px-4 pt-3 pb-1.5 text-[11px] uppercase tracking-wider"
          style={{ color: SOFT }}
        >
          {label} · {items.length}
        </div>
        {items.map((i) => (
          <Item key={i.id} i={i} />
        ))}
      </div>
    );

  return (
    <div
      className="min-h-screen bg-parchment pb-24 px-3"
      style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
    >
      <div className="mx-auto w-full max-w-[560px]">
        <button
          onClick={() => router.push("/trips")}
          className="flex items-center gap-1 mb-5 px-1"
          style={{ color: CAPTION, fontSize: 13 }}
        >
          <CaretLeft size={15} weight="light" />
          Journeys
        </button>

        <h1 className="font-display italic text-[29px] px-1 mb-5" style={{ color: INK }}>
          Ideas
        </h1>

        {ideas.length === 0 && (
          <p className="text-[13px] px-1" style={{ color: SOFT }}>
            Nothing saved yet.
          </p>
        )}

        <Group label="Inbox" items={inbox} />
        <Group label="Kept" items={kept} />

        {passed.length > 0 && (
          <>
            <button
              onClick={() => setShowPassed((s) => !s)}
              className="text-[12px] px-1 mb-3"
              style={{ color: SIENNA }}
            >
              {showPassed ? "Hide" : `Passed · ${passed.length}`}
            </button>
            {showPassed && <Group label="Passed" items={passed} />}
          </>
        )}
      </div>
    </div>
  );
}
