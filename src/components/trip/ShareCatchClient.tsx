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
  // The heading is the only feedback on this screen, so it has to be the truth
  // rather than a greeting. It was the static word "Saved" from the moment the
  // page opened — which was true of the link, and told you nothing about the
  // title you were typing underneath it.
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A pending debounce must not outlive the page — a share-target tab is often
  // closed the moment the tag is tapped.
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const persist = async (next: { note?: string; tags?: string[] }) => {
    if (!ideaId) return;
    setStatus("saving");
    const supabase = createClient();
    const { error } = await supabase
      .from("ideas")
      .update({ note: next.note ?? note, tags: next.tags ?? tags })
      .eq("id", ideaId);
    // A failed write used to be indistinguishable from a successful one.
    setStatus(error ? "error" : "saved");
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
          {status === "saved" && <Check size={18} weight="light" color={INK} />}
          <span
            className="font-display italic text-[24px]"
            style={{ color: status === "error" ? SIENNA : INK }}
          >
            {status === "saved" ? "Saved" : status === "saving" ? "Saving…" : "Not saved"}
          </span>
        </div>

        {status === "error" && (
          <p className="text-[12.5px] -mt-2 mb-4" style={{ color: SIENNA }}>
            Your connection dropped. It&rsquo;ll save when you edit again.
          </p>
        )}

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

        {/* A TikTok hands over a shortlink and nothing else.
            Saves as you stop typing, not on blur: on a phone there is nothing
            to blur *to* — the keyboard covers the page and a bare text input
            doesn't submit on the keyboard's Go. Enter commits and closes the
            keyboard, and enterKeyHint labels that key "done" rather than "go".
            The heading above reports the result; there is no Save button
            because there is nothing left for one to do. */}
        <input
          value={note}
          enterKeyHint="done"
          onChange={(e) => {
            const v = e.target.value;
            setNote(v);
            setStatus("saving");
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
          style={{ color: CAPTION }}
        >
          All ideas
        </Link>
      </div>
    </div>
  );
}
