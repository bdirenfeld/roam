"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Check } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.55)";
const SOFT = "rgba(26,26,46,0.35)";
const RULE = "rgba(26,26,46,0.10)";
const SIENNA = "#C4622D";

export default function ShareCatchClient({
  ideaId,
  title,
  link,
  source,
  knownTags,
}: {
  ideaId: string | null;
  title: string | null;
  link: string | null;
  source: string | null;
  /** Tags already in use, most-used first — tapping one is the whole flow. */
  knownTags: string[];
}) {
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A pending debounce must not outlive the page — a share-target tab is often
  // closed the moment the tag is tapped.
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const persist = async (next: { note?: string; tags?: string[] }) => {
    if (!ideaId) return;
    const supabase = createClient();
    await supabase
      .from("ideas")
      .update({ note: next.note ?? note, tags: next.tags ?? tags })
      .eq("id", ideaId);
    setSaved(true);
  };

  const toggleTag = (t: string) => {
    const next = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t];
    setTags(next);
    persist({ tags: next });
  };

  const addNewTag = () => {
    const t = newTag.trim().toLowerCase();
    if (!t || tags.includes(t)) return setNewTag("");
    const next = [...tags, t];
    setTags(next);
    setNewTag("");
    persist({ tags: next });
  };

  const chip = (t: string, on: boolean) => (
    <button
      key={t}
      onClick={() => toggleTag(t)}
      className="px-3 py-1.5 rounded-full text-[12.5px]"
      style={
        on
          ? { background: SIENNA, color: "#fff" }
          : { border: `1px solid ${RULE}`, color: CAPTION, background: "#fff" }
      }
    >
      {t}
    </button>
  );

  const unused = knownTags.filter((t) => !tags.includes(t));

  return (
    <div
      className="min-h-screen bg-parchment px-4"
      style={{ paddingTop: "max(1.5rem, env(safe-area-inset-top))" }}
    >
      <div className="mx-auto w-full max-w-[520px]">
        <div className="flex items-center gap-2 mb-4">
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

        {/* A TikTok hands over a shortlink and nothing else. */}
        {/* Saves as you stop typing, not on blur.
            On a phone there is nothing to blur *to*: the keyboard covers the
            page, a bare text input doesn't submit on the keyboard's Go, and the
            heading says "Saved" the whole time — so the only honest reading was
            that typing a title did nothing. Enter also closes the keyboard, and
            enterKeyHint labels that key "done" rather than "go". */}
        <input
          value={note}
          enterKeyHint="done"
          onChange={(e) => {
            const v = e.target.value;
            setNote(v);
            setSaved(false);
            if (saveTimer.current) clearTimeout(saveTimer.current);
            saveTimer.current = setTimeout(() => persist({ note: v }), 600);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (saveTimer.current) clearTimeout(saveTimer.current);
            persist({ note });
            e.currentTarget.blur();
          }}
          onBlur={() => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
            persist({ note });
          }}
          placeholder="Which place is this?"
          className="w-full rounded-xl px-3.5 py-3 text-[14px] mb-4"
          style={{ background: "#fff", border: `1px solid ${RULE}`, color: INK }}
        />

        <div className="flex flex-wrap gap-2 mb-3">
          {tags.map((t) => chip(t, true))}
          {unused.map((t) => chip(t, false))}
        </div>

        <div className="flex gap-2 mb-5">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addNewTag()}
            placeholder="New tag"
            className="flex-1 rounded-xl px-3.5 py-2.5 text-[13.5px]"
            style={{ background: "#fff", border: `1px solid ${RULE}`, color: INK }}
          />
          <button
            onClick={addNewTag}
            className="px-4 rounded-xl text-[13.5px]"
            style={{ border: `1px solid ${RULE}`, color: CAPTION, background: "#fff" }}
          >
            Add
          </button>
        </div>

        <Link
          href="/ideas"
          className="block text-center text-[13px]"
          style={{ color: saved ? SIENNA : CAPTION }}
        >
          All ideas
        </Link>
      </div>
    </div>
  );
}
