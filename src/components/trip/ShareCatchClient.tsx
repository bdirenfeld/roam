"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.55)";
const SOFT = "rgba(26,26,46,0.35)";
const RULE = "rgba(26,26,46,0.10)";

export default function ShareCatchClient({
  ideaId,
  title,
  link,
  source,
}: {
  ideaId: string | null;
  title: string | null;
  link: string | null;
  source: string | null;
}) {
  const [note, setNote] = useState("");
  const [savedNote, setSavedNote] = useState(false);

  const saveNote = async () => {
    if (!ideaId) return;
    const supabase = createClient();
    await supabase.from("ideas").update({ note }).eq("id", ideaId);
    setSavedNote(true);
  };

  return (
    <div
      className="min-h-screen bg-parchment px-4"
      style={{ paddingTop: "max(2rem, env(safe-area-inset-top))" }}
    >
      <div className="mx-auto w-full max-w-[520px]">
        <div className="flex items-center gap-2 mb-5">
          <Check size={18} weight="light" color={INK} />
          <span className="font-display italic text-[24px]" style={{ color: INK }}>
            Saved
          </span>
        </div>

        <div
          className="bg-white rounded-2xl p-4 mb-4"
          style={{ boxShadow: `0 0 0 1px ${RULE}` }}
        >
          <div className="text-[14px] mb-1" style={{ color: INK }}>
            {title ?? link ?? "Untitled"}
          </div>
          {source && (
            <div className="text-[11.5px]" style={{ color: SOFT }}>
              {source}
            </div>
          )}
        </div>

        {/* A TikTok hands over a shortlink and nothing else, so without a word
            or two here it is unidentifiable by March. */}
        <input
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setSavedNote(false);
          }}
          onBlur={saveNote}
          placeholder="Which place is this?"
          className="w-full rounded-xl px-3.5 py-3 text-[14px] mb-3"
          style={{ background: "#fff", border: `1px solid ${RULE}`, color: INK }}
        />

        <button
          onClick={saveNote}
          className="w-full rounded-full py-3 text-[14px]"
          style={{ background: INK, color: "#fff" }}
        >
          {savedNote ? "Saved" : "Add note"}
        </button>

        <Link
          href="/ideas"
          className="block text-center text-[13px] mt-4"
          style={{ color: CAPTION }}
        >
          All ideas
        </Link>
      </div>
    </div>
  );
}
